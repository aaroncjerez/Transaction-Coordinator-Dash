/**
 * Dialer Queries — All Supabase query functions + local SQLite cache for the AI Dialer.
 * Called by IPC handlers in ipc-handlers.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type Database from 'better-sqlite3';

// ── Helpers ──

function getSetting(db: Database.Database, key: string, envFallback: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  return (row?.value?.trim() || process.env[envFallback] || '').trim();
}

// ── Call Queue ──

export async function getCallQueue(supabase: SupabaseClient, limit = 20) {
  const { data, error } = await supabase
    .from('v_dashboard_call_queue_priority')
    .select('*')
    .eq('can_call_now', true)
    .order('priority_score', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ── Call History ──

export async function getCallHistory(
  supabase: SupabaseClient,
  limit = 50,
  filters?: { search?: string; status?: string; sentiment?: string; direction?: string }
) {
  let query = supabase
    .from('call_records')
    .select('*')
    .order('call_started_at', { ascending: false })
    .limit(limit);

  if (filters?.status) {
    query = query.eq('call_status', filters.status);
  }
  if (filters?.sentiment) {
    query = query.eq('sentiment', filters.sentiment);
  }
  if (filters?.direction) {
    query = query.eq('call_direction', filters.direction);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ── Calls for a specific lead ──

export async function getCallsForLead(supabase: SupabaseClient, phoneNormalized: string) {
  const { data, error } = await supabase
    .from('call_records')
    .select('*')
    .eq('seller_phone_normalized', phoneNormalized)
    .order('call_started_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ── Single lead ──

export async function getLeadById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from('leads_cache')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ── Conversation memory ──

export async function getLeadMemory(supabase: SupabaseClient, phoneNormalized: string) {
  const { data, error } = await supabase
    .from('conversation_memory')
    .select('*')
    .eq('phone_normalized', phoneNormalized)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

// ── DNC List ──

export async function getDNCList(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('v_dashboard_dnc_list')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ── DNC Stats (3 sources: AI-detected, FUB, Manual — Airtable dropped) ──

export async function getDNCStats(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('v_dashboard_dnc_list')
    .select('source');

  if (error) throw error;

  const entries = data || [];
  return {
    total: entries.length,
    autoDetected: entries.filter((d: any) => d.source === 'Auto-Detected' || d.source === 'Not Interested').length,
    fub: entries.filter((d: any) => d.source === 'Follow Up Boss').length,
    manual: entries.filter((d: any) => d.source === 'Manually Uploaded').length,
  };
}

// ── DNC Management ──

export async function addManualDNC(supabase: SupabaseClient, phone: string, reason: string) {
  const { data, error } = await supabase.rpc('add_manual_dnc', {
    p_phone: phone,
    p_reason: reason,
  });

  if (error) throw error;
  return data;
}

export async function removeFromDNC(supabase: SupabaseClient, phone: string) {
  const { data, error } = await supabase.rpc('remove_from_dnc', {
    p_phone: phone,
  });

  if (error) throw error;
  return data;
}

// ── Daily Stats ──

export async function getDailyStats(supabase: SupabaseClient, days = 30) {
  const { data, error } = await supabase
    .from('v_dashboard_daily_stats')
    .select('*')
    .order('call_date', { ascending: false })
    .limit(days);

  if (error) throw error;
  return data || [];
}

// ── Hot Leads ──

export async function getHotLeads(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('v_dashboard_hot_leads')
    .select('*')
    .order('heat_level', { ascending: false })
    .limit(20);

  if (error) throw error;
  return data || [];
}

// ── Callbacks Due ──

export async function getCallbacksDue(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('v_dashboard_callbacks_with_calls')
    .select('*')
    .order('callback_datetime', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ── Trigger n8n Cadence ──

export async function triggerCadence(
  supabase: SupabaseClient,
  db: Database.Database,
  onProgress: (status: any) => void
): Promise<any> {
  // Query local cache for cadence-eligible leads (replaces n8n webhook trigger)
  const leads = db.prepare(`
    SELECT id FROM dialer_leads_cache
    WHERE ai_cadence_on = 1
      AND can_call_now = 1
      AND final_outcome IS NULL
    ORDER BY priority_score DESC
    LIMIT 50
  `).all() as any[];

  if (leads.length === 0) {
    return { success: true, message: 'No leads due for cadence calls', dialed: 0 };
  }

  console.log(`[triggerCadence] Found ${leads.length} cadence-eligible leads, starting batch dial...`);
  const leadIds = leads.map((l: any) => l.id);
  return batchDialLeads(supabase, db, leadIds, 10, 30000, onProgress);
}

// ── Un-reviewed calls (for AI reviewer) ──

export async function getUnreviewedCalls(supabase: SupabaseClient, limit = 10) {
  const { data, error } = await supabase
    .from('call_records')
    .select('*')
    .not('transcript', 'is', null)
    .is('custom_analysis', null)
    .order('call_started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ── Update call with AI review ──

export async function updateCallReview(supabase: SupabaseClient, callId: string, review: any) {
  const { error } = await supabase
    .from('call_records')
    .update({ custom_analysis: review })
    .eq('id', callId);

  if (error) throw error;
}

// ── Mark lead as DNC (from AI review) ──

export async function markLeadDNC(supabase: SupabaseClient, phoneNormalized: string, reason: string) {
  const { error } = await supabase
    .from('leads_cache')
    .update({
      final_outcome: 'DNC',
      final_outcome_date: new Date().toISOString(),
      final_outcome_reason: reason,
      ai_cadence_on: false,
    })
    .eq('phone_normalized', phoneNormalized);

  if (error) throw error;
}

// ── Mark lead as hot (from AI review) ──

export async function markLeadHot(supabase: SupabaseClient, phoneNormalized: string) {
  const { error } = await supabase
    .from('leads_cache')
    .update({ rapport_level: 'hot' })
    .eq('phone_normalized', phoneNormalized);

  if (error) throw error;
}

// ── Recent calls count (for sidebar badge) ──

export async function getTodayCallCount(supabase: SupabaseClient) {
  const today = new Date().toISOString().split('T')[0];
  const { count, error } = await supabase
    .from('call_records')
    .select('*', { count: 'exact', head: true })
    .gte('call_started_at', `${today}T00:00:00`);

  if (error) throw error;
  return count || 0;
}

// ── Inbound Calls ──

export async function getInboundCalls(supabase: SupabaseClient, limit = 20) {
  const { data, error } = await supabase
    .from('call_records')
    .select('*')
    .eq('call_direction', 'inbound')
    .order('call_started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ── Upload Leads (CSV bulk import) ──

export async function uploadLeadsBatch(
  supabase: SupabaseClient,
  leads: Array<{
    phone_number: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    county?: string;
    state?: string;
    parcel_acres?: number;
    market_value?: number;
    property_address?: string;
    property_city?: string;
    property_zip?: string;
    parcel_number?: string;
    min_offer?: number;
    max_offer?: number;
    labels?: string;
    notes?: string;
    lead_source?: string;
    acquired_by?: string;
  }>,
  batchId: string
): Promise<{
  batch_id: string;
  total_rows: number;
  imported: number;
  duplicates: number;
  errors: number;
  skipped: number;
  details: Array<{
    row_index: number;
    lead_id: string | null;
    action: 'inserted' | 'updated' | 'skipped' | 'error';
    reason: string | null;
    phone: string;
  }>;
}> {
  const details: Array<{
    row_index: number;
    lead_id: string | null;
    action: 'inserted' | 'updated' | 'skipped' | 'error';
    reason: string | null;
    phone: string;
  }> = [];

  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const phone = lead.phone_number?.trim();

    if (!phone) {
      skipped++;
      details.push({ row_index: i, lead_id: null, action: 'skipped', reason: 'No phone number', phone: '' });
      continue;
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      skipped++;
      details.push({ row_index: i, lead_id: null, action: 'skipped', reason: `Invalid phone (${phoneDigits.length} digits)`, phone });
      continue;
    }

    try {
      const { data, error } = await supabase.rpc('sync_lead_from_airtable', {
        p_airtable_record_id: `csv_upload_${batchId}_${i}`,
        p_batch_id: batchId,
        p_phone: phone,
        p_first_name: lead.first_name || null,
        p_last_name: lead.last_name || null,
        p_email: lead.email || null,
        p_county: lead.county || null,
        p_state: lead.state || null,
        p_acres: lead.parcel_acres || null,
        p_market_value: lead.market_value || null,
        p_property_address: lead.property_address || null,
        p_labels: lead.labels || null,
      });

      if (error) {
        errors++;
        details.push({ row_index: i, lead_id: null, action: 'error', reason: error.message, phone });
        continue;
      }

      const result = Array.isArray(data) ? data[0] : data;
      const action = result?.action || 'inserted';
      const leadId = result?.lead_id || null;

      if (action === 'inserted') imported++;
      else if (action === 'updated') { imported++; duplicates++; }
      else if (action === 'skipped') skipped++;
      else imported++;

      details.push({
        row_index: i,
        lead_id: leadId,
        action: action as any,
        reason: result?.reason || null,
        phone,
      });
    } catch (err: any) {
      errors++;
      details.push({ row_index: i, lead_id: null, action: 'error', reason: err.message || 'Unknown error', phone });
    }
  }

  return {
    batch_id: batchId,
    total_rows: leads.length,
    imported,
    duplicates,
    errors,
    skipped,
    details,
  };
}

// ── Upload Batch Management ──

export async function getUploadBatches(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('get_upload_batches');

  if (error && error.code === 'PGRST202') {
    const { data: leads, error: err2 } = await supabase
      .from('leads_cache')
      .select('airtable_record_id, created_at')
      .like('airtable_record_id', 'csv_upload_%');

    if (err2) throw err2;

    const batches = new Map<string, { batch_id: string; lead_count: number; uploaded_at: string }>();
    for (const lead of (leads || [])) {
      const parts = (lead.airtable_record_id as string).split('_');
      const batchId = parts.length >= 4 ? `${parts[2]}_${parts[3]}` : 'unknown';
      if (batchId === 'unknown' || !/^\d+_[a-z0-9]+$/i.test(batchId)) continue;
      if (!batches.has(batchId)) {
        batches.set(batchId, { batch_id: batchId, lead_count: 0, uploaded_at: lead.created_at });
      }
      const b = batches.get(batchId)!;
      b.lead_count++;
      if (lead.created_at < b.uploaded_at) b.uploaded_at = lead.created_at;
    }

    return Array.from(batches.values()).sort((a, b) =>
      new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
    );
  }

  if (error) throw error;
  return data || [];
}

export async function getUploadBatchLeads(supabase: SupabaseClient, batchId: string) {
  const { data, error } = await supabase
    .from('leads_cache')
    .select('id, first_name, last_name, phone_normalized, county, state, created_at')
    .like('airtable_record_id', `csv_upload_${batchId}_%`)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function deleteUploadBatch(supabase: SupabaseClient, batchId: string) {
  if (!/^\d+_[a-z0-9]+$/i.test(batchId)) throw new Error('Invalid batch ID format');

  const { data, error } = await supabase
    .from('leads_cache')
    .delete()
    .like('airtable_record_id', `csv_upload_${batchId}_%`)
    .select('id');

  if (error) throw error;
  return { deleted: (data || []).length };
}

// ── Call a specific lead via Retell API (credentials from Settings + .env) ──

export async function callLead(
  supabase: SupabaseClient,
  db: Database.Database,
  lead: {
    id: string;
    phone_number?: string;
    phone_normalized?: string;
    first_name?: string;
    last_name?: string;
    county?: string;
    state?: string;
    parcel_acres?: number;
    market_value?: number;
    retell_agent_id?: string;
    from_number?: string;
  }
) {
  const RETELL_API_KEY = getSetting(db, 'retell_api_key', 'RETELL_API_KEY');
  const DEFAULT_AGENT_ID = getSetting(db, 'retell_agent_id', 'RETELL_AGENT_ID');
  const DEFAULT_FROM_NUMBER = getSetting(db, 'retell_from_number', 'RETELL_FROM_NUMBER');

  if (!RETELL_API_KEY) throw new Error('Retell API key not configured — set it in Settings.');
  if (!DEFAULT_AGENT_ID) throw new Error('Retell Agent ID not configured — set it in Settings.');

  // Normalize phone to E.164 format (+1XXXXXXXXXX) — Retell requires this
  const rawPhone = lead.phone_number || lead.phone_normalized || '';
  const phoneDigits = rawPhone.replace(/\D/g, '');
  const e164Digits = phoneDigits.length === 11 && phoneDigits.startsWith('1')
    ? phoneDigits
    : `1${phoneDigits.slice(-10)}`;
  if (e164Digits.length !== 11) {
    throw new Error(`Invalid phone number: "${rawPhone}" (need 10+ digits)`);
  }
  const e164Phone = `+${e164Digits}`;

  const response = await fetch('https://api.retellai.com/v2/create-phone-call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RETELL_API_KEY}`,
    },
    body: JSON.stringify({
      agent_id: lead.retell_agent_id || DEFAULT_AGENT_ID,
      from_number: lead.from_number || DEFAULT_FROM_NUMBER || undefined,
      to_number: e164Phone,
      metadata: {
        lead_id: lead.id,
        manual_call: true,
      },
      retell_llm_dynamic_variables: {
        call_direction: 'outbound',
        first_name: lead.first_name || '',
        county: lead.county || '',
        state: lead.state || '',
        acres: String(lead.parcel_acres || ''),
        market_value: String(lead.market_value || ''),
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Retell API error ${response.status}: ${body}`);
  }

  const result = await response.json();

  // Update last_outbound_at on the lead
  await supabase
    .from('leads_cache')
    .update({ last_outbound_at: new Date().toISOString() })
    .eq('id', lead.id);

  return { call_id: result.call_id, status: result.call_status || 'initiated' };
}

// ── Batch Auto-Dial ──

export async function batchDialLeads(
  supabase: SupabaseClient,
  db: Database.Database,
  leadIds: string[],
  batchSize: number = 10,
  delayMs: number = 30000,
  onProgress: (status: any) => void
): Promise<any> {
  if (leadIds.length > 50) throw new Error('Maximum 50 leads per batch');
  if (batchSize > 10) batchSize = 10; // Retell limit

  const sessionId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();
  const totalBatches = Math.ceil(leadIds.length / batchSize);
  const details: any[] = [];
  let dialedCount = 0;
  let errors = 0;
  let skippedDnc = 0;

  // Save batch state
  db.prepare(`
    INSERT INTO dialer_batch_dial_state (id, status, total_leads, batch_size, delay_seconds, lead_ids, started_at)
    VALUES (?, 'running', ?, ?, ?, ?, datetime('now'))
  `).run(sessionId, leadIds.length, batchSize, Math.round(delayMs / 1000), JSON.stringify(leadIds));

  // Get DNC phones for pre-check
  const dncPhones = new Set<string>();
  const dncRows = db.prepare('SELECT phone_normalized FROM dialer_dnc_cache').all() as any[];
  for (const row of dncRows) {
    dncPhones.add(row.phone_normalized);
  }

  // Fetch lead details from local cache
  const placeholders = leadIds.map(() => '?').join(',');
  const leads = db.prepare(`SELECT * FROM dialer_leads_cache WHERE id IN (${placeholders})`).all(...leadIds) as any[];
  const leadMap = new Map(leads.map(l => [l.id, l]));

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * batchSize;
    const batchLeadIds = leadIds.slice(batchStart, batchStart + batchSize);

    // Dial all leads in this batch concurrently
    const promises = batchLeadIds.map(async (leadId) => {
      const lead = leadMap.get(leadId);
      if (!lead) {
        errors++;
        details.push({ leadId, phone: '', status: 'error', error: 'Lead not found in cache' });
        return;
      }

      // DNC pre-check
      if (dncPhones.has(lead.phone_normalized)) {
        skippedDnc++;
        details.push({ leadId, phone: lead.phone_normalized, status: 'dnc_skipped' });
        return;
      }

      try {
        const result = await callLead(supabase, db, {
          id: lead.id,
          phone_normalized: lead.phone_normalized,
          phone_number: lead.phone_number,
          first_name: lead.first_name,
          last_name: lead.last_name,
          county: lead.county,
          state: lead.state,
          parcel_acres: lead.parcel_acres,
          market_value: lead.market_value,
        });
        dialedCount++;
        details.push({ leadId, phone: lead.phone_normalized, status: 'dialed', callId: result.call_id });
      } catch (err: any) {
        errors++;
        details.push({ leadId, phone: lead.phone_normalized, status: 'error', error: err.message });
      }
    });

    await Promise.all(promises);

    // Report progress
    onProgress({
      sessionId,
      status: 'running' as const,
      totalLeads: leadIds.length,
      dialedCount,
      currentBatch: batchIdx + 1,
      totalBatches,
      currentLeadName: null,
      errors,
      skippedDnc,
    });

    // Update batch state
    db.prepare('UPDATE dialer_batch_dial_state SET dialed_count = ?, current_batch = ? WHERE id = ?')
      .run(dialedCount + skippedDnc, batchIdx + 1, sessionId);

    // Wait between batches (except after the last one)
    if (batchIdx < totalBatches - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  const durationSeconds = Math.round((Date.now() - startTime) / 1000);

  // Finalize batch state
  db.prepare("UPDATE dialer_batch_dial_state SET status = 'completed', dialed_count = ?, results = ?, completed_at = datetime('now') WHERE id = ?")
    .run(dialedCount + skippedDnc, JSON.stringify(details), sessionId);

  return {
    sessionId,
    totalLeads: leadIds.length,
    dialed: dialedCount,
    connected: 0, // We don't know yet — calls are async
    failed: errors,
    skippedDnc,
    durationSeconds,
    details,
  };
}

// ── Sync FUB People → DNC (crm_exclusions) ──

export async function syncFubPeopleToDNC(
  supabase: SupabaseClient,
  people: Array<{
    id: number;
    phone_normalized: string;
    first_name?: string;
    last_name?: string;
    stage?: string;
  }>
): Promise<{
  total: number;
  added: number;
  duplicates: number;
  errors: number;
}> {
  let added = 0;
  let duplicates = 0;
  let errors = 0;

  for (const person of people) {
    try {
      const { error } = await supabase
        .from('crm_exclusions')
        .upsert(
          {
            phone_normalized: person.phone_normalized,
            source: 'follow_up_boss',
            status: person.stage || 'active',
            fub_person_id: String(person.id),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'phone_normalized' }
        );

      if (error) {
        if (error.code === '23505') {
          duplicates++;
        } else {
          errors++;
          console.error(`[syncFubDNC] Error for ${person.phone_normalized}:`, error.message);
        }
      } else {
        added++;
      }
    } catch (err: any) {
      errors++;
      console.error(`[syncFubDNC] Exception for ${person.phone_normalized}:`, err.message);
    }
  }

  return { total: people.length, added, duplicates, errors };
}

// ════════════════════════════════════════════════════
// LOCAL SQLITE CACHE — Write-through sync functions
// ════════════════════════════════════════════════════

export function syncCallQueueToLocal(db: Database.Database, leads: any[]): void {
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO dialer_leads_cache (
      id, phone_normalized, phone_number, first_name, last_name, email,
      county, state, parcel_acres, property_address, market_value,
      final_outcome, ai_cadence_on, attempt_count, max_attempts,
      rapport_level, cadence_stage, cadence_sequence, next_call_date,
      callback_requested, callback_datetime, priority_score, priority_reason,
      can_call_now, has_market_value, in_follow_up_boss,
      last_contact_at, last_outbound_at,
      seller_asking_price, our_last_offer, agreed_price,
      synced_at, created_at, updated_at
    ) VALUES (
      @id, @phone_normalized, @phone_number, @first_name, @last_name, @email,
      @county, @state, @parcel_acres, @property_address, @market_value,
      @final_outcome, @ai_cadence_on, @attempt_count, @max_attempts,
      @rapport_level, @cadence_stage, @cadence_sequence, @next_call_date,
      @callback_requested, @callback_datetime, @priority_score, @priority_reason,
      @can_call_now, @has_market_value, @in_follow_up_boss,
      @last_contact_at, @last_outbound_at,
      @seller_asking_price, @our_last_offer, @agreed_price,
      datetime('now'), @created_at, @updated_at
    )
  `);

  const tx = db.transaction(() => {
    for (const lead of leads) {
      upsert.run({
        id: lead.id,
        phone_normalized: lead.phone_normalized || '',
        phone_number: lead.phone_number || null,
        first_name: lead.first_name || null,
        last_name: lead.last_name || null,
        email: lead.email || null,
        county: lead.county || null,
        state: lead.state || null,
        parcel_acres: lead.parcel_acres || null,
        property_address: lead.property_address || null,
        market_value: lead.market_value || null,
        final_outcome: lead.final_outcome || null,
        ai_cadence_on: lead.ai_cadence_on ? 1 : 0,
        attempt_count: lead.attempt_count || 0,
        max_attempts: lead.max_attempts || 14,
        rapport_level: lead.rapport_level || 'cold',
        cadence_stage: lead.cadence_stage ?? null,
        cadence_sequence: lead.cadence_sequence || null,
        next_call_date: lead.next_call_date || null,
        callback_requested: lead.callback_requested ? 1 : 0,
        callback_datetime: lead.callback_datetime || null,
        priority_score: lead.priority_score || 0,
        priority_reason: lead.priority_reason || null,
        can_call_now: lead.can_call_now ? 1 : 0,
        has_market_value: lead.has_market_value ? 1 : 0,
        in_follow_up_boss: lead.in_follow_up_boss ? 1 : 0,
        last_contact_at: lead.last_contact_at || null,
        last_outbound_at: lead.last_outbound_at || null,
        seller_asking_price: lead.seller_asking_price || null,
        our_last_offer: lead.our_last_offer || null,
        agreed_price: lead.agreed_price || null,
        created_at: lead.created_at || null,
        updated_at: lead.updated_at || null,
      });
    }
  });
  tx();
}

export function syncCallHistoryToLocal(db: Database.Database, calls: any[]): void {
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO dialer_call_records (
      id, lead_id, phone_normalized, seller_phone_normalized, our_phone,
      call_direction, retell_call_id, call_started_at, call_ended_at,
      duration_seconds, call_status, call_successful, sentiment,
      disconnection_reason, transcript, summary, custom_analysis,
      extracted_data, cost_cents,
      lead_first_name, lead_last_name, lead_county, lead_state,
      synced_at, created_at
    ) VALUES (
      @id, @lead_id, @phone_normalized, @seller_phone_normalized, @our_phone,
      @call_direction, @retell_call_id, @call_started_at, @call_ended_at,
      @duration_seconds, @call_status, @call_successful, @sentiment,
      @disconnection_reason, @transcript, @summary, @custom_analysis,
      @extracted_data, @cost_cents,
      @lead_first_name, @lead_last_name, @lead_county, @lead_state,
      datetime('now'), @created_at
    )
  `);

  // Prepare lead lookup statements for resolving lead context from local cache
  const leadByIdStmt = db.prepare(
    'SELECT first_name, last_name, county, state FROM dialer_leads_cache WHERE id = ?'
  );
  const leadByPhoneStmt = db.prepare(
    'SELECT first_name, last_name, county, state FROM dialer_leads_cache WHERE phone_normalized = ? LIMIT 1'
  );

  const tx = db.transaction(() => {
    for (const call of calls) {
      // Look up lead context from local SQLite cache (replaces removed PostgREST join)
      let leadCtx: any = null;
      if (call.lead_id) {
        leadCtx = leadByIdStmt.get(call.lead_id);
      }
      if (!leadCtx && call.seller_phone_normalized) {
        leadCtx = leadByPhoneStmt.get(call.seller_phone_normalized);
      }
      if (!leadCtx && call.phone_normalized) {
        leadCtx = leadByPhoneStmt.get(call.phone_normalized);
      }

      upsert.run({
        id: call.id,
        lead_id: call.lead_id || null,
        phone_normalized: call.phone_normalized || null,
        seller_phone_normalized: call.seller_phone_normalized || null,
        our_phone: call.our_phone || null,
        call_direction: call.call_direction || 'outbound',
        retell_call_id: call.retell_call_id || null,
        call_started_at: call.call_started_at || null,
        call_ended_at: call.call_ended_at || null,
        duration_seconds: call.duration_seconds || null,
        call_status: call.call_status || null,
        call_successful: call.call_successful ? 1 : 0,
        sentiment: call.sentiment || null,
        disconnection_reason: call.disconnection_reason || null,
        transcript: call.transcript || null,
        summary: call.summary || null,
        custom_analysis: call.custom_analysis ? JSON.stringify(call.custom_analysis) : null,
        extracted_data: call.extracted_data ? JSON.stringify(call.extracted_data) : null,
        cost_cents: call.cost_cents || null,
        lead_first_name: leadCtx?.first_name || null,
        lead_last_name: leadCtx?.last_name || null,
        lead_county: leadCtx?.county || null,
        lead_state: leadCtx?.state || null,
        created_at: call.created_at || null,
      });
    }

    // Prune to 200 most recent
    db.prepare(`
      DELETE FROM dialer_call_records
      WHERE id NOT IN (
        SELECT id FROM dialer_call_records
        ORDER BY call_started_at DESC
        LIMIT 200
      )
    `).run();
  });
  tx();
}

export function syncDNCToLocal(db: Database.Database, entries: any[]): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM dialer_dnc_cache').run();

    const insert = db.prepare(`
      INSERT OR IGNORE INTO dialer_dnc_cache (
        id, phone_normalized, first_name, last_name,
        source, reason, dnc_type, dnc_expires_at, added_at, synced_at
      ) VALUES (
        @id, @phone_normalized, @first_name, @last_name,
        @source, @reason, @dnc_type, @dnc_expires_at, @added_at, datetime('now')
      )
    `);

    for (const entry of entries) {
      insert.run({
        id: entry.id || `dnc_${entry.phone_normalized}`,
        phone_normalized: entry.phone_normalized,
        first_name: entry.first_name || null,
        last_name: entry.last_name || null,
        source: entry.source || 'Unknown',
        reason: entry.reason || null,
        dnc_type: entry.dnc_type || 'permanent',
        dnc_expires_at: entry.dnc_expires_at || null,
        added_at: entry.added_at || null,
      });
    }
  });
  tx();
}

// ════════════════════════════════════════════════════
// LOCAL SQLITE CACHE — Read functions (instant UI)
// ════════════════════════════════════════════════════

export function getLocalCallQueue(db: Database.Database, limit = 50): any[] {
  return db.prepare(`
    SELECT * FROM dialer_leads_cache
    WHERE can_call_now = 1
    ORDER BY priority_score DESC
    LIMIT ?
  `).all(limit);
}

export function getLocalCallHistory(
  db: Database.Database,
  limit = 100,
  filters?: { status?: string; sentiment?: string; direction?: string }
): any[] {
  let sql = 'SELECT * FROM dialer_call_records';
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.status) { conditions.push('call_status = ?'); params.push(filters.status); }
  if (filters?.sentiment) { conditions.push('sentiment = ?'); params.push(filters.sentiment); }
  if (filters?.direction) { conditions.push('call_direction = ?'); params.push(filters.direction); }

  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY call_started_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

export function getLocalDNCList(db: Database.Database): any[] {
  return db.prepare('SELECT * FROM dialer_dnc_cache ORDER BY added_at DESC').all();
}

export function getLocalDNCStats(db: Database.Database): any {
  const entries = db.prepare('SELECT source FROM dialer_dnc_cache').all() as any[];
  return {
    total: entries.length,
    autoDetected: entries.filter(d => d.source === 'Auto-Detected' || d.source === 'Not Interested').length,
    fub: entries.filter(d => d.source === 'Follow Up Boss').length,
    manual: entries.filter(d => d.source === 'Manually Uploaded').length,
  };
}

export function getLocalInboundCalls(db: Database.Database, limit = 20): any[] {
  return db.prepare(`
    SELECT * FROM dialer_call_records
    WHERE call_direction = 'inbound'
    ORDER BY call_started_at DESC
    LIMIT ?
  `).all(limit);
}
