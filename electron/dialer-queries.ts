/**
 * Dialer Queries — All Supabase query functions for the AI Dialer feature.
 * Ported from /Autodialer/dashboard/lib/supabase/queries.ts
 * Called by IPC handlers in ipc-handlers.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';

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
  filters?: { search?: string; status?: string; sentiment?: string }
) {
  let query = supabase
    .from('call_records')
    .select(`
      *,
      leads_cache!left (
        first_name,
        last_name,
        county,
        state
      )
    `)
    .order('call_started_at', { ascending: false })
    .limit(limit);

  if (filters?.status) {
    query = query.eq('call_status', filters.status);
  }
  if (filters?.sentiment) {
    query = query.eq('sentiment', filters.sentiment);
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

// ── DNC Stats ──

export async function getDNCStats(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('v_dashboard_dnc_list')
    .select('source');

  if (error) throw error;

  const entries = data || [];
  return {
    total: entries.length,
    autoDetected: entries.filter((d: any) => d.source === 'Auto-Detected').length,
    airtable: entries.filter((d: any) => d.source === 'Airtable DNC').length,
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

export async function triggerCadence(webhookUrl: string) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'tc-dash', timestamp: new Date().toISOString() }),
  });

  if (!response.ok) {
    throw new Error(`n8n webhook failed: ${response.status} ${response.statusText}`);
  }

  return { success: true };
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
      // Use the existing sync_lead_from_airtable RPC which handles:
      // - Phone normalization & E.164 formatting
      // - Duplicate detection by phone_normalized
      // - Skipping finalized leads (DNC, Deal Made, etc.)
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

      // RPC returns { lead_id, action, reason }
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
  // batch_id is embedded in airtable_record_id as: csv_upload_{batchId}_{rowIndex}
  // batchId format: {timestamp}_{random6} e.g. "1707123456789_abc123"
  // So we extract parts 3 and 4 (0-indexed: csv=0, upload=1, timestamp=2, random=3)
  const { data, error } = await supabase.rpc('get_upload_batches');

  // If RPC doesn't exist, fall back to raw query
  if (error && error.code === 'PGRST202') {
    // Fallback: query leads_cache directly
    const { data: leads, error: err2 } = await supabase
      .from('leads_cache')
      .select('airtable_record_id, created_at')
      .like('airtable_record_id', 'csv_upload_%');

    if (err2) throw err2;

    // Group by batch_id in JS
    const batches = new Map<string, { batch_id: string; lead_count: number; uploaded_at: string }>();
    for (const lead of (leads || [])) {
      const parts = (lead.airtable_record_id as string).split('_');
      // csv_upload_{timestamp}_{random}_{rowIndex}
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

// ── Call a specific lead via Retell API ──

export async function callLead(
  supabase: SupabaseClient,
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
  const RETELL_API_KEY = 'key_1e62391fcbf2609d742c6df304ab';
  const DEFAULT_AGENT_ID = 'agent_156846b4f169b260d362066666';
  const DEFAULT_FROM_NUMBER = '+16402320908';

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
      from_number: lead.from_number || DEFAULT_FROM_NUMBER,
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
      // Upsert into crm_exclusions — skip if phone already exists
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
          // Unique constraint violation — already exists
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
