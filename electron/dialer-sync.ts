/**
 * Dialer Sync Runner — Two-tier background polling + local SQLite cache
 *
 * Fast sync (5s): Poll Supabase for new call_records, update local cache, detect inbound calls
 * Full sync (60s): Refresh call queue + DNC list, run AI reviewer, send cache-updated events
 *
 * Pattern: follows fub-person-sync.ts (start/stop, interval, guard)
 */

import { BrowserWindow } from 'electron';
import { getDb } from './database.js';
import { isSupabaseConfigured, getSupabaseClient } from './supabase-client.js';
import {
  getCallQueue,
  getCallHistory,
  getDNCList,
  getUnreviewedCalls,
  getTodayCallCount,
  getInboundCalls,
  syncCallQueueToLocal,
  syncCallHistoryToLocal,
  syncDNCToLocal,
} from './dialer-queries.js';
import { reviewRecentCalls } from './call-reviewer.js';

// Track sync health for status reporting
let lastFastSyncOk = false;
let lastFullSyncOk = false;
let lastFastSyncError: string | null = null;
let lastFullSyncError: string | null = null;
let lastFastSyncTime: string | null = null;
let lastFullSyncTime: string | null = null;

const FAST_SYNC_INTERVAL_MS = 5 * 1000;   // 5 seconds — call records
const FULL_SYNC_INTERVAL_MS = 60 * 1000;  // 60 seconds — queue + DNC + AI review

let fastIntervalId: ReturnType<typeof setInterval> | null = null;
let fullIntervalId: ReturnType<typeof setInterval> | null = null;
let isFastSyncing = false;
let isFullSyncing = false;
let lastCallCount = 0;
let lastInboundCallId: string | null = null;

function notifyRenderer(channel: string, data: any): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

/**
 * Fast sync — poll for new call records, update local cache (every 5 seconds)
 */
async function fastSync(): Promise<void> {
  if (isFastSyncing) return;
  isFastSyncing = true;

  try {
    const db = getDb();
    if (!isSupabaseConfigured(db)) {
      console.log('[DialerSync:fast] Supabase not configured, skipping');
      return;
    }

    const supabase = getSupabaseClient(db);
    console.log('[DialerSync:fast] Fetching call history...');

    // Fetch recent call history from Supabase and sync to local
    const calls = await getCallHistory(supabase, 200);
    console.log(`[DialerSync:fast] Fetched ${calls.length} call records from Supabase`);
    if (calls.length > 0) {
      syncCallHistoryToLocal(db, calls);
    }

    // Check for new calls today
    const currentCount = await getTodayCallCount(supabase);
    if (currentCount > lastCallCount && lastCallCount > 0) {
      const newCalls = currentCount - lastCallCount;
      console.log(`[DialerSync:fast] ${newCalls} new call(s) detected`);
      notifyRenderer('dialer:new-calls', { count: newCalls });
    }
    lastCallCount = currentCount;

    // Check for new inbound calls
    const inboundCalls = await getInboundCalls(supabase, 5);
    if (inboundCalls.length > 0 && inboundCalls[0].id !== lastInboundCallId) {
      const newCall = inboundCalls[0];
      if (lastInboundCallId !== null) {
        // Look up lead name from local SQLite cache
        const phone = newCall.seller_phone_normalized || newCall.phone_normalized;
        let leadName: string | null = null;
        try {
          if (newCall.lead_id) {
            const lead = db.prepare(
              'SELECT first_name, last_name FROM dialer_leads_cache WHERE id = ?'
            ).get(newCall.lead_id) as any;
            if (lead) leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null;
          }
          if (!leadName && phone) {
            const lead = db.prepare(
              'SELECT first_name, last_name FROM dialer_leads_cache WHERE phone_normalized = ? LIMIT 1'
            ).get(phone) as any;
            if (lead) leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null;
          }
        } catch { /* ignore lookup errors */ }

        notifyRenderer('dialer:inbound-call', {
          callId: newCall.id,
          phone,
          leadName,
          leadId: newCall.lead_id,
          timestamp: newCall.call_started_at,
        });
      }
      lastInboundCallId = inboundCalls[0].id;
    }

    // Notify that call history cache was updated
    notifyRenderer('dialer:cache-updated', { type: 'history' });

    lastFastSyncOk = true;
    lastFastSyncError = null;
    lastFastSyncTime = new Date().toISOString();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DialerSync:fast] Error:', msg);
    lastFastSyncOk = false;
    lastFastSyncError = msg;
    lastFastSyncTime = new Date().toISOString();
  } finally {
    isFastSyncing = false;
  }
}

/**
 * Full sync — refresh queue, DNC list, run AI reviewer (every 60 seconds)
 */
export async function fullSync(): Promise<void> {
  if (isFullSyncing) return;
  isFullSyncing = true;

  try {
    const db = getDb();
    if (!isSupabaseConfigured(db)) return;

    const supabase = getSupabaseClient(db);

    // 1. Sync call queue to local cache
    try {
      const queue = await getCallQueue(supabase, 100);
      syncCallQueueToLocal(db, queue);
      notifyRenderer('dialer:cache-updated', { type: 'queue' });
    } catch (err) {
      console.error('[DialerSync:full] Queue sync error:', err instanceof Error ? err.message : err);
    }

    // 2. Sync DNC list to local cache
    try {
      const dnc = await getDNCList(supabase);
      syncDNCToLocal(db, dnc);
      notifyRenderer('dialer:cache-updated', { type: 'dnc' });
    } catch (err) {
      console.error('[DialerSync:full] DNC sync error:', err instanceof Error ? err.message : err);
    }

    // 3. Auto-review unreviewed calls
    try {
      const unreviewedCalls = await getUnreviewedCalls(supabase, 5);
      if (unreviewedCalls.length > 0) {
        console.log(`[DialerSync:full] Found ${unreviewedCalls.length} un-reviewed call(s), starting AI review...`);

        const anthropicKey = db.prepare(
          "SELECT value FROM settings WHERE key = 'anthropic_api_key'"
        ).get() as any;

        if (anthropicKey?.value || process.env.ANTHROPIC_API_KEY) {
          const result = await reviewRecentCalls(db, 5);
          if (result.reviewed > 0) {
            console.log(`[DialerSync:full] AI review complete: ${result.reviewed} reviewed, ${result.dncDetected} DNC, ${result.hotLeadsFound} hot leads`);
            notifyRenderer('dialer:new-calls', { count: result.reviewed });
          }
        } else {
          console.log('[DialerSync:full] Skipping AI review — Anthropic API key not configured');
        }
      }
    } catch (err) {
      console.error('[DialerSync:full] AI review error:', err instanceof Error ? err.message : err);
    }

    lastFullSyncOk = true;
    lastFullSyncError = null;
    lastFullSyncTime = new Date().toISOString();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('not configured') && !msg.includes('Missing')) {
      console.error('[DialerSync:full] Error:', msg);
    }
    lastFullSyncOk = false;
    lastFullSyncError = msg;
    lastFullSyncTime = new Date().toISOString();
  } finally {
    isFullSyncing = false;
  }
}

/**
 * Start the dialer sync background runner.
 * Called from main.ts on app startup.
 */
export function startDialerSync(): void {
  if (fastIntervalId || fullIntervalId) {
    console.log('[DialerSync] Already running');
    return;
  }

  // Startup diagnostics
  try {
    const db = getDb();
    const configured = isSupabaseConfigured(db);
    console.log(`[DialerSync] Starting background sync (5s fast / 60s full) | Supabase configured: ${configured}`);
    if (!configured) {
      console.warn('[DialerSync] WARNING: Supabase not configured — sync will be a no-op until credentials are set in Settings');
    }
  } catch (err) {
    console.error('[DialerSync] Startup diagnostics error:', err instanceof Error ? err.message : err);
  }

  // Initial sync after a short delay (let the app finish loading)
  // Wrapped with .catch() to surface unhandled promise rejections
  setTimeout(() => {
    fullSync().catch(err => console.error('[DialerSync] Initial fullSync error:', err));
    fastSync().catch(err => console.error('[DialerSync] Initial fastSync error:', err));
  }, 5000);

  fastIntervalId = setInterval(() => {
    fastSync().catch(err => console.error('[DialerSync] fastSync interval error:', err));
  }, FAST_SYNC_INTERVAL_MS);

  fullIntervalId = setInterval(() => {
    fullSync().catch(err => console.error('[DialerSync] fullSync interval error:', err));
  }, FULL_SYNC_INTERVAL_MS);
}

/**
 * Stop the dialer sync runner.
 */
export function stopDialerSync(): void {
  if (fastIntervalId) {
    clearInterval(fastIntervalId);
    fastIntervalId = null;
  }
  if (fullIntervalId) {
    clearInterval(fullIntervalId);
    fullIntervalId = null;
  }
  console.log('[DialerSync] Stopped');
}

/**
 * Get sync health status for UI display.
 */
export function getSyncStatus(): {
  running: boolean;
  supabaseConfigured: boolean;
  fastSync: { ok: boolean; error: string | null; lastRun: string | null };
  fullSync: { ok: boolean; error: string | null; lastRun: string | null };
} {
  let supabaseConfigured = false;
  try {
    const db = getDb();
    supabaseConfigured = isSupabaseConfigured(db);
  } catch { /* ignore */ }

  return {
    running: !!(fastIntervalId || fullIntervalId),
    supabaseConfigured,
    fastSync: { ok: lastFastSyncOk, error: lastFastSyncError, lastRun: lastFastSyncTime },
    fullSync: { ok: lastFullSyncOk, error: lastFullSyncError, lastRun: lastFullSyncTime },
  };
}
