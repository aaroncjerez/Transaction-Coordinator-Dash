/**
 * Retell Call Poller — Polls Retell API, writes directly to local SQLite
 *
 * Polls Retell's List Calls API every 30 seconds to fetch completed calls,
 * then inserts them directly into local dialer_call_records table.
 *
 * No Supabase dependency — SQLite is the sole source of truth.
 */

import { BrowserWindow } from 'electron';
import { getDb } from './database.js';
import { upsertCallRecord, getExistingRetellCallIds } from './dialer-queries.js';
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

// ── Retell → local record field mapping ──

function mapRetellCallToRecord(call: any): Record<string, any> {
  const direction = call.direction || 'outbound';
  const isOutbound = direction === 'outbound';

  const sellerPhone = isOutbound ? call.to_number : call.from_number;
  const ourPhone = isOutbound ? call.from_number : call.to_number;

  const durationMs = call.duration_ms || 0;
  const durationSeconds = Math.round(durationMs / 1000);

  // Sentiment — lowercase
  const rawSentiment = call.call_analysis?.user_sentiment || 'unknown';
  const sentiment = rawSentiment.toLowerCase();
  const validSentiments = ['positive', 'neutral', 'negative', 'unknown'];
  const safeSentiment = validSentiments.includes(sentiment) ? sentiment : 'unknown';

  // Call success — prefer Retell's own analysis, fall back to heuristic
  const callSuccessful = call.call_analysis?.call_successful
    ?? ((['agent_hangup', 'user_hangup', 'call_transfer'].includes(call.disconnection_reason)) && durationSeconds > 10);

  // Cost — Retell returns call_cost.combined_cost in cents (float)
  const costCents = call.call_cost?.combined_cost != null
    ? Math.round(call.call_cost.combined_cost)
    : Math.max(Math.round(durationSeconds / 60 * 7), durationSeconds > 0 ? 1 : 0);

  const leadId = call.metadata?.lead_id || null;

  return {
    id: crypto.randomUUID(),
    retell_call_id: call.call_id,
    lead_id: leadId,
    phone_normalized: sellerPhone || null,
    seller_phone_normalized: sellerPhone || null,
    our_phone: ourPhone || null,
    call_direction: direction,
    call_status: 'completed',
    call_successful: callSuccessful,
    call_started_at: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
    call_ended_at: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null,
    duration_seconds: durationSeconds,
    cost_cents: costCents,
    transcript: call.transcript || '',
    summary: call.call_analysis?.call_summary || '',
    sentiment: safeSentiment,
    disconnection_reason: call.disconnection_reason || null,
    extracted_data: call.call_analysis || {},
  };
}

// ── Core poll function ──

export async function pollRetellCalls(): Promise<{ fetched: number; newRecords: number; errors: number }> {
  if (isPolling) return { fetched: 0, newRecords: 0, errors: 0 };
  isPolling = true;

  try {
    const db = getDb();

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

    // Get last poll timestamp (default: 7 days ago)
    const lastPollStr = getSetting(db, 'retell_last_poll_ts');
    const defaultTs = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const lastPollTs = lastPollStr ? parseInt(lastPollStr, 10) : defaultTs;

    console.log(`[RetellPoller] Polling calls since ${new Date(lastPollTs).toISOString()}`);

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

    // Dedup against local SQLite
    const retellCallIds = calls.map(c => c.call_id);
    const existingIds = getExistingRetellCallIds(db, retellCallIds);
    const newCalls = calls.filter(c => !existingIds.has(c.call_id));

    console.log(`[RetellPoller] ${newCalls.length} new calls to insert (${existingIds.size} already exist)`);

    let newRecords = 0;
    let errors = 0;

    for (const call of newCalls) {
      try {
        const record = mapRetellCallToRecord(call);
        upsertCallRecord(db, record);
        newRecords++;
        console.log(`[RetellPoller] Inserted call ${record.retell_call_id} (${record.call_direction}, ${record.duration_seconds}s, ${record.sentiment})`);
      } catch (err) {
        errors++;
        console.error(`[RetellPoller] Insert error for ${call.call_id}:`, err instanceof Error ? err.message : err);
      }
    }

    // Update last poll timestamp
    if (calls.length > 0) {
      const latestStartTs = Math.max(...calls.map(c => c.start_timestamp || 0));
      if (latestStartTs > 0) {
        setSetting(db, 'retell_last_poll_ts', String(latestStartTs + 1));
      }
    }

    if (newRecords > 0) {
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

    console.log(`[RetellBackfill] Page ${page}...`);

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

    // Batch dedup against local SQLite
    const retellCallIds = calls.map(c => c.call_id);
    const existingSet = getExistingRetellCallIds(db, retellCallIds);
    const newCalls = calls.filter(c => !existingSet.has(c.call_id));

    console.log(`[RetellBackfill] Page ${page}: ${newCalls.length} new, ${existingSet.size} already exist`);

    for (const call of newCalls) {
      try {
        const record = mapRetellCallToRecord(call);
        upsertCallRecord(db, record);
        totalNew++;
      } catch (err) {
        totalErrors++;
        console.error(`[RetellBackfill] Insert error for ${call.call_id}:`, err instanceof Error ? err.message : err);
      }
    }

    if (onProgress) {
      onProgress({ fetched: totalFetched, inserted: totalNew, page });
    }
    notifyRenderer('dialer:backfill-progress', { fetched: totalFetched, inserted: totalNew, page });

    if (calls.length < 1000) break;
    paginationKey = calls[calls.length - 1].call_id;
  }

  console.log(`[RetellBackfill] Complete: ${totalFetched} fetched, ${totalNew} new, ${totalErrors} errors`);

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

  // Initial poll after 5s
  setTimeout(() => {
    pollRetellCalls().catch(err => console.error('[RetellPoller] Initial poll error:', err));
  }, 5000);

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
