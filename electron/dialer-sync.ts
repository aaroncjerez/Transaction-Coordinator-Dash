/**
 * Dialer Sync Runner — Background poll + AI call reviewer
 *
 * Runs every 60 seconds:
 * 1. Checks Supabase for new call_records since last check
 * 2. Identifies calls with transcripts but no AI review
 * 3. Auto-queues them for Claude review (call-reviewer.ts)
 * 4. Sends IPC event to renderer for live UI updates
 *
 * Pattern: follows fub-person-sync.ts (start/stop, interval, guard)
 */

import { BrowserWindow } from 'electron';
import { getDb } from './database.js';
import { isSupabaseConfigured, getSupabaseClient } from './supabase-client.js';
import { getUnreviewedCalls, getTodayCallCount } from './dialer-queries.js';
import { reviewRecentCalls } from './call-reviewer.js';

const SYNC_INTERVAL_MS = 60 * 1000; // 60 seconds
let intervalId: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let lastCallCount = 0;

function notifyRenderer(channel: string, data: any): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

/**
 * Single sync cycle.
 */
async function syncOnce(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const db = getDb();
    if (!isSupabaseConfigured(db)) return;

    const supabase = getSupabaseClient(db);

    // Check for new calls
    const currentCount = await getTodayCallCount(supabase);
    if (currentCount > lastCallCount && lastCallCount > 0) {
      const newCalls = currentCount - lastCallCount;
      console.log(`[DialerSync] ${newCalls} new call(s) detected today`);
      notifyRenderer('dialer:new-calls', { count: newCalls });
    }
    lastCallCount = currentCount;

    // Check for un-reviewed calls and auto-review them
    const unreviewedCalls = await getUnreviewedCalls(supabase, 5);
    if (unreviewedCalls.length > 0) {
      console.log(`[DialerSync] Found ${unreviewedCalls.length} un-reviewed call(s), starting AI review...`);

      // Check that Anthropic key is configured before reviewing
      const anthropicKey = db.prepare(
        "SELECT value FROM settings WHERE key = 'anthropic_api_key'"
      ).get() as any;

      if (anthropicKey?.value || process.env.ANTHROPIC_API_KEY) {
        const result = await reviewRecentCalls(db, 5);
        if (result.reviewed > 0) {
          console.log(`[DialerSync] AI review complete: ${result.reviewed} reviewed, ${result.dncDetected} DNC, ${result.hotLeadsFound} hot leads`);
          // Notify renderer to refresh
          notifyRenderer('dialer:new-calls', { count: result.reviewed });
        }
      } else {
        console.log('[DialerSync] Skipping AI review — Anthropic API key not configured');
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't spam logs for expected config-missing errors
    if (!msg.includes('not configured') && !msg.includes('Missing')) {
      console.error('[DialerSync] Error:', msg);
    }
  } finally {
    isSyncing = false;
  }
}

/**
 * Start the dialer sync background runner.
 * Called from main.ts on app startup.
 */
export function startDialerSync(): void {
  if (intervalId) {
    console.log('[DialerSync] Already running');
    return;
  }

  console.log('[DialerSync] Starting background sync (60s interval)');

  // Initial sync after a short delay (let the app finish loading)
  setTimeout(() => {
    syncOnce();
  }, 5000);

  intervalId = setInterval(syncOnce, SYNC_INTERVAL_MS);
}

/**
 * Stop the dialer sync runner.
 */
export function stopDialerSync(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[DialerSync] Stopped');
  }
}
