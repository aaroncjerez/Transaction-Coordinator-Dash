/**
 * Retell Call Poller — Replaces n8n webhook entirely
 *
 * Polls Retell's List Calls API every 30 seconds to fetch completed calls,
 * then writes them to Supabase call_records + local SQLite cache.
 *
 * Uses POST /v2/list-calls with filter_criteria to fetch only new calls
 * since the last poll timestamp (stored in SQLite settings for persistence).
 *
 * Cost: ~2 API calls/min. Zero external infrastructure.
 */

import { BrowserWindow } from 'electron';
import { getDb } from './database.js';
import { isSupabaseConfigured, getSupabaseClient } from './supabase-client.js';
import { syncCallHistoryToLocal } from './dialer-queries.js';
import crypto from 'crypto';

const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

let intervalId: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

// ── Helpers ──

function getSetting(db: any, key: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  return (row?.value || '').trim();
}

function setSetting(db: any, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

function notifyRenderer(channel: string, data: any): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

// ── Retell → Supabase field mapping ──

function mapRetellCallToRecord(call: any): Record<string, any> {
  const direction = call.direction || 'outbound';
  const isOutbound = direction === 'outbound';

  // Determine seller phone (the person we're calling / who called us)
  const sellerPhone = isOutbound ? call.to_number : call.from_number;
  const ourPhone = isOutbound ? call.from_number : call.to_number;

  // Duration
  const durationMs = call.duration_ms || 0;
  const durationSeconds = Math.round(durationMs / 1000);

  // Sentiment — MUST be lowercase (Supabase check constraint)
  const rawSentiment = call.call_analysis?.user_sentiment || 'unknown';
  const sentiment = rawSentiment.toLowerCase();
  // Validate against allowed values
  const validSentiments = ['positive', 'neutral', 'negative', 'unknown'];
  const safeSentiment = validSentiments.includes(sentiment) ? sentiment : 'unknown';

  // Call success
  const successReasons = ['agent_hangup', 'user_hangup', 'call_transfer'];
  const callSuccessful = successReasons.includes(call.disconnection_reason) && durationSeconds > 10;

  // Cost
  const costCents = call.cost?.total_cost
    ? Math.round(call.cost.total_cost * 100)
    : Math.max(Math.round(durationSeconds / 60 * 7), durationSeconds > 0 ? 1 : 0);

  // Lead ID from metadata (may be null — FK constraint to leads_cache)
  const leadId = call.metadata?.lead_id || null;

  return {
    id: crypto.randomUUID(),
    retell_call_id: call.call_id,
    lead_id: leadId,
    phone_number: sellerPhone || null,
    seller_phone: sellerPhone || null,
    from_number: call.from_number || null,
    to_number: call.to_number || null,
    our_phone: ourPhone || null,
    call_direction: direction,
    call_status: 'completed',
    call_type: 'manual', // HARDCODED — Supabase check constraint only allows 'manual'
    call_successful: callSuccessful,
    call_started_at: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
    call_ended_at: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null,
    duration_seconds: durationSeconds,
    cost_cents: costCents,
    transcript: call.transcript || '',
    summary: call.call_analysis?.call_summary || '',
    sentiment: safeSentiment,
    disconnection_reason: call.disconnection_reason || null,
    end_reason: call.disconnection_reason || null,
    session_status: 'ended',
    extracted_data: call.call_analysis || {},
    raw_webhook: call, // Store full Retell response for debugging
  };
}

// ── Supabase insert helper (excludes generated columns, handles FK errors) ──

async function insertCallToSupabase(supabase: any, record: Record<string, any>, logPrefix: string): Promise<boolean> {
  try {
    const { error: insertError } = await supabase
      .from('call_records')
      .insert({
        id: record.id,
        retell_call_id: record.retell_call_id,
        lead_id: record.lead_id,
        phone_number: record.phone_number,
        seller_phone: record.seller_phone,
        from_number: record.from_number,
        to_number: record.to_number,
        our_phone: record.our_phone,
        call_direction: record.call_direction,
        call_status: record.call_status,
        call_type: record.call_type,
        call_successful: record.call_successful,
        call_started_at: record.call_started_at,
        call_ended_at: record.call_ended_at,
        duration_seconds: record.duration_seconds,
        cost_cents: record.cost_cents,
        transcript: record.transcript,
        summary: record.summary,
        sentiment: record.sentiment,
        disconnection_reason: record.disconnection_reason,
        end_reason: record.end_reason,
        session_status: record.session_status,
        extracted_data: record.extracted_data,
        raw_webhook: record.raw_webhook,
      });

    if (insertError) {
      if (insertError.message?.includes('foreign key') || insertError.code === '23503') {
        console.warn(`${logPrefix} FK error for ${record.retell_call_id}, retrying without lead_id`);
        const { error: retryError } = await supabase
          .from('call_records')
          .insert({
            ...record,
            lead_id: null,
            raw_webhook: record.raw_webhook,
          });
        if (retryError) {
          console.error(`${logPrefix} Insert retry failed for ${record.retell_call_id}: ${retryError.message}`);
          return false;
        }
      } else {
        console.error(`${logPrefix} Insert failed for ${record.retell_call_id}: ${insertError.message}`);
        return false;
      }
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${logPrefix} Error inserting ${record.retell_call_id}: ${msg}`);
    return false;
  }
}

// ── Core poll function ──

export async function pollRetellCalls(): Promise<{ fetched: number; newRecords: number; errors: number }> {
  if (isPolling) return { fetched: 0, newRecords: 0, errors: 0 };
  isPolling = true;

  try {
    const db = getDb();

    // Check prerequisites
    const retellApiKey = getSetting(db, 'retell_api_key') || process.env.RETELL_API_KEY || '';
    const retellAgentId = getSetting(db, 'retell_agent_id') || process.env.RETELL_AGENT_ID || '';

    if (!retellApiKey) {
      console.log('[RetellPoller] No Retell API key configured, skipping');
      return { fetched: 0, newRecords: 0, errors: 0 };
    }
    if (!retellAgentId) {
      console.log('[RetellPoller] No Retell Agent ID configured, skipping');
      return { fetched: 0, newRecords: 0, errors: 0 };
    }
    if (!isSupabaseConfigured(db)) {
      console.log('[RetellPoller] Supabase not configured, skipping');
      return { fetched: 0, newRecords: 0, errors: 0 };
    }

    // Get last poll timestamp (default: 7 days ago)
    const lastPollStr = getSetting(db, 'retell_last_poll_ts');
    const defaultTs = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const lastPollTs = lastPollStr ? parseInt(lastPollStr, 10) : defaultTs;

    console.log(`[RetellPoller] Polling calls since ${new Date(lastPollTs).toISOString()}`);

    // POST /v2/list-calls
    const response = await fetch('https://api.retellai.com/v2/list-calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${retellApiKey}`,
      },
      body: JSON.stringify({
        filter_criteria: {
          agent_id: [retellAgentId],
          call_status: ['ended', 'error', 'not_connected'],
          start_timestamp: {
            lower_threshold: lastPollTs,
          },
        },
        sort_order: 'ascending',
        limit: 100,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[RetellPoller] Retell API error ${response.status}: ${body}`);
      return { fetched: 0, newRecords: 0, errors: 1 };
    }

    const calls: any[] = await response.json();
    console.log(`[RetellPoller] Fetched ${calls.length} calls from Retell`);

    if (calls.length === 0) {
      return { fetched: 0, newRecords: 0, errors: 0 };
    }

    // Check which calls we already have in Supabase (by retell_call_id)
    const supabase = getSupabaseClient(db);
    const retellCallIds = calls.map(c => c.call_id);

    const { data: existingRecords } = await supabase
      .from('call_records')
      .select('retell_call_id')
      .in('retell_call_id', retellCallIds);

    const existingIds = new Set((existingRecords || []).map((r: any) => r.retell_call_id));
    const newCalls = calls.filter(c => !existingIds.has(c.call_id));

    console.log(`[RetellPoller] ${newCalls.length} new calls to insert (${existingIds.size} already exist)`);

    let newRecords = 0;
    let errors = 0;

    for (const call of newCalls) {
      const record = mapRetellCallToRecord(call);
      const ok = await insertCallToSupabase(supabase, record, '[RetellPoller]');
      if (ok) {
        newRecords++;
        console.log(`[RetellPoller] Inserted call ${record.retell_call_id} (${record.call_direction}, ${record.duration_seconds}s, ${record.sentiment})`);
      } else {
        errors++;
      }
    }

    // Update last poll timestamp to the latest START_timestamp we saw.
    // IMPORTANT: We filter on start_timestamp, so we must advance by start_timestamp.
    // Using end_timestamp would skip calls that started before a long-running call ended.
    if (calls.length > 0) {
      const latestStartTs = Math.max(...calls.map(c => c.start_timestamp || 0));
      if (latestStartTs > 0) {
        // Add 1ms to avoid re-fetching the same call
        setSetting(db, 'retell_last_poll_ts', String(latestStartTs + 1));
      }
    }

    // Sync ALL recent calls from Supabase to local SQLite (not just the new ones)
    // This ensures consistency and picks up any records written by other sources
    if (newRecords > 0) {
      try {
        const { data: recentCalls } = await supabase
          .from('call_records')
          .select('*')
          .order('call_started_at', { ascending: false })
          .limit(200);

        if (recentCalls && recentCalls.length > 0) {
          syncCallHistoryToLocal(db, recentCalls);
          console.log(`[RetellPoller] Synced ${recentCalls.length} records to local SQLite`);
        }
      } catch (err) {
        console.error('[RetellPoller] Local sync error:', err instanceof Error ? err.message : err);
      }

      notifyRenderer('dialer:cache-updated', { type: 'history' });
      notifyRenderer('dialer:new-calls', { count: newRecords });
    }

    return { fetched: calls.length, newRecords, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[RetellPoller] Error:', msg);
    return { fetched: 0, newRecords: 0, errors: 1 };
  } finally {
    isPolling = false;
  }
}

// ── Backfill — one-time bulk import of historical calls ──

export async function backfillRetellCalls(
  daysBack: number,
  onProgress?: (data: { fetched: number; inserted: number; page: number }) => void
): Promise<{ fetched: number; newRecords: number; errors: number }> {
  const db = getDb();

  const retellApiKey = getSetting(db, 'retell_api_key') || process.env.RETELL_API_KEY || '';
  const retellAgentId = getSetting(db, 'retell_agent_id') || process.env.RETELL_AGENT_ID || '';

  if (!retellApiKey || !retellAgentId) {
    throw new Error('Retell API key and Agent ID must be configured');
  }
  if (!isSupabaseConfigured(db)) {
    throw new Error('Supabase must be configured');
  }

  const supabase = getSupabaseClient(db);
  const sinceTs = Date.now() - (daysBack * 24 * 60 * 60 * 1000);

  console.log(`[RetellBackfill] Starting backfill: ${daysBack} days (since ${new Date(sinceTs).toISOString()})`);

  let totalFetched = 0;
  let totalNew = 0;
  let totalErrors = 0;
  let page = 0;
  let paginationKey: string | undefined = undefined;

  while (true) {
    page++;
    const body: any = {
      filter_criteria: {
        agent_id: [retellAgentId],
        call_status: ['ended', 'error', 'not_connected'],
        start_timestamp: { lower_threshold: sinceTs },
      },
      sort_order: 'ascending',
      limit: 1000,
    };
    if (paginationKey) {
      body.pagination_key = paginationKey;
    }

    console.log(`[RetellBackfill] Page ${page} (pagination_key: ${paginationKey || 'none'})...`);

    const response = await fetch('https://api.retellai.com/v2/list-calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${retellApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[RetellBackfill] API error ${response.status}: ${errBody}`);
      totalErrors++;
      break;
    }

    const calls: any[] = await response.json();
    console.log(`[RetellBackfill] Page ${page}: ${calls.length} calls`);
    totalFetched += calls.length;

    if (calls.length === 0) break;

    // Batch dedup check against Supabase
    const retellCallIds = calls.map(c => c.call_id);
    const { data: existing } = await supabase
      .from('call_records')
      .select('retell_call_id')
      .in('retell_call_id', retellCallIds);

    const existingSet = new Set((existing || []).map((r: any) => r.retell_call_id));
    const newCalls = calls.filter(c => !existingSet.has(c.call_id));

    console.log(`[RetellBackfill] Page ${page}: ${newCalls.length} new, ${existingSet.size} already exist`);

    for (const call of newCalls) {
      const record = mapRetellCallToRecord(call);
      const ok = await insertCallToSupabase(supabase, record, '[RetellBackfill]');
      if (ok) {
        totalNew++;
      } else {
        totalErrors++;
      }
    }

    // Progress callback
    if (onProgress) {
      onProgress({ fetched: totalFetched, inserted: totalNew, page });
    }
    notifyRenderer('dialer:backfill-progress', { fetched: totalFetched, inserted: totalNew, page });

    // Pagination: if we got fewer than 1000, we're done
    if (calls.length < 1000) break;

    // Use the last call_id as pagination_key for next page
    paginationKey = calls[calls.length - 1].call_id;
  }

  // Sync all recent records to local SQLite
  console.log(`[RetellBackfill] Complete: ${totalFetched} fetched, ${totalNew} new, ${totalErrors} errors`);
  console.log(`[RetellBackfill] Syncing to local SQLite...`);

  try {
    const { data: recentCalls } = await supabase
      .from('call_records')
      .select('*')
      .order('call_started_at', { ascending: false })
      .limit(500);

    if (recentCalls && recentCalls.length > 0) {
      syncCallHistoryToLocal(db, recentCalls);
      console.log(`[RetellBackfill] Synced ${recentCalls.length} records to local SQLite`);
    }
  } catch (err) {
    console.error('[RetellBackfill] Local sync error:', err instanceof Error ? err.message : err);
  }

  notifyRenderer('dialer:cache-updated', { type: 'history' });
  notifyRenderer('dialer:new-calls', { count: totalNew });

  return { fetched: totalFetched, newRecords: totalNew, errors: totalErrors };
}

// ── Start / Stop ──

export function startRetellPoller(): void {
  if (intervalId) {
    console.log('[RetellPoller] Already running');
    return;
  }

  console.log('[RetellPoller] Starting (30s interval)');

  // Initial poll after 10s (let Supabase sync establish first)
  setTimeout(() => {
    pollRetellCalls().catch(err => console.error('[RetellPoller] Initial poll error:', err));
  }, 10000);

  intervalId = setInterval(() => {
    pollRetellCalls().catch(err => console.error('[RetellPoller] Poll error:', err));
  }, POLL_INTERVAL_MS);
}

export function stopRetellPoller(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log('[RetellPoller] Stopped');
}
