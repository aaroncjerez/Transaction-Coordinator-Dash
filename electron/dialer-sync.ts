/**
 * Dialer Sync Runner — Local background processor
 *
 * No Supabase — all data lives in SQLite.
 * Runs periodic background tasks:
 *   - AI call review (unreviewed transcripts)
 *   - Conversation memory updates (for reviewed calls)
 *   - Transcript embedding backfill
 *   - Inbound call detection
 */

import { BrowserWindow, Notification } from 'electron';
import { getDb } from './database.js';
import {
  getUnreviewedCalls,
  getTodayCallCount,
  getInboundCalls,
} from './dialer-queries.js';
import { reviewRecentCalls } from './call-reviewer.js';
import {
  chunkAndEmbedTranscript,
  updateLeadMemory,
} from './dialer-memory.js';

// Track sync health
let lastSyncOk = false;
let lastSyncError: string | null = null;
let lastSyncTime: string | null = null;

const SYNC_INTERVAL_MS = 60 * 1000;  // 60 seconds
const INBOUND_CHECK_MS = 10 * 1000;  // 10 seconds

let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let inboundIntervalId: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
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
 * Inbound call check — lightweight, runs every 10s
 */
async function checkInbound(): Promise<void> {
  try {
    const db = getDb();

    // Check for new calls today
    const currentCount = getTodayCallCount(db);
    if (currentCount > lastCallCount && lastCallCount > 0) {
      const newCalls = currentCount - lastCallCount;
      notifyRenderer('dialer:new-calls', { count: newCalls });
      notifyRenderer('dialer:cache-updated', { type: 'history' });
    }
    lastCallCount = currentCount;

    // Check for new inbound calls
    const inboundCalls = getInboundCalls(db, 5);
    if (inboundCalls.length > 0) {
      const newCall = inboundCalls[0] as any;
      if (newCall.id !== lastInboundCallId) {
        if (lastInboundCallId !== null) {
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
          } catch { /* ignore */ }

          notifyRenderer('dialer:inbound-call', {
            callId: newCall.id,
            phone,
            leadName,
            leadId: newCall.lead_id,
            timestamp: newCall.call_started_at,
          });

          // Native OS notification
          if (Notification.isSupported()) {
            const notif = new Notification({
              title: 'Inbound Call',
              body: leadName ? `${leadName} (${phone})` : phone || 'Unknown caller',
              silent: false,
            });
            notif.show();
          }
        }
        lastInboundCallId = newCall.id;
      }
    }
  } catch (err) {
    // Inbound check is non-critical, don't spam logs
  }
}

/**
 * Main sync cycle — runs every 60s
 * 1. AI call review
 * 2. Transcript embedding
 * 3. Conversation memory updates
 */
export async function fullSync(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const db = getDb();

    // 1. AI review of unreviewed calls
    const reviewedPhones: string[] = [];
    try {
      const unreviewedCalls = getUnreviewedCalls(db, 5);
      if (unreviewedCalls.length > 0) {
        const anthropicKey = db.prepare(
          "SELECT value FROM settings WHERE key = 'anthropic_api_key'"
        ).get() as any;

        if (anthropicKey?.value || process.env.ANTHROPIC_API_KEY) {
          console.log(`[DialerSync] Found ${unreviewedCalls.length} un-reviewed call(s), starting AI review...`);
          const result = await reviewRecentCalls(db, 5);
          if (result.reviewed > 0) {
            console.log(`[DialerSync] AI review: ${result.reviewed} reviewed, ${result.dncDetected} DNC, ${result.hotLeadsFound} hot leads`);
            notifyRenderer('dialer:cache-updated', { type: 'history' });

            // Collect phones from reviewed calls for memory update
            for (const call of unreviewedCalls as any[]) {
              const phone = call.seller_phone_normalized || call.phone_normalized;
              if (phone && !reviewedPhones.includes(phone)) {
                reviewedPhones.push(phone);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[DialerSync] AI review error:', err instanceof Error ? err.message : err);
    }

    // 2. Transcript embedding for calls without chunks
    try {
      const voyageKey = (db.prepare(
        "SELECT value FROM settings WHERE key = 'voyage_api_key'"
      ).get() as any)?.value?.trim() || process.env.VOYAGE_API_KEY;

      if (voyageKey) {
        const unembeddedCalls = db.prepare(`
          SELECT id FROM dialer_call_records
          WHERE transcript IS NOT NULL AND transcript != ''
            AND id NOT IN (SELECT DISTINCT call_id FROM dialer_transcript_chunks)
          ORDER BY call_started_at DESC
          LIMIT 5
        `).all() as any[];

        for (const call of unembeddedCalls) {
          try {
            await chunkAndEmbedTranscript(db, call.id, voyageKey);
          } catch (err) {
            console.error(`[DialerSync] Embedding error for call ${call.id}:`, err instanceof Error ? err.message : err);
          }
        }
      }
    } catch (err) {
      console.error('[DialerSync] Embedding backfill error:', err instanceof Error ? err.message : err);
    }

    // 3. Update conversation memory for leads with newly reviewed calls
    if (reviewedPhones.length > 0) {
      try {
        const anthropicKey = (db.prepare(
          "SELECT value FROM settings WHERE key = 'anthropic_api_key'"
        ).get() as any)?.value?.trim() || process.env.ANTHROPIC_API_KEY;

        if (anthropicKey) {
          for (const phone of reviewedPhones) {
            try {
              await updateLeadMemory(db, phone, anthropicKey);
            } catch (err) {
              console.error(`[DialerSync] Memory update error for ${phone}:`, err instanceof Error ? err.message : err);
            }
          }
        }
      } catch (err) {
        console.error('[DialerSync] Memory update error:', err instanceof Error ? err.message : err);
      }
    }

    lastSyncOk = true;
    lastSyncError = null;
    lastSyncTime = new Date().toISOString();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('not configured') && !msg.includes('Missing')) {
      console.error('[DialerSync] Error:', msg);
    }
    lastSyncOk = false;
    lastSyncError = msg;
    lastSyncTime = new Date().toISOString();
  } finally {
    isSyncing = false;
  }
}

/**
 * Start the background processor.
 */
export function startDialerSync(): void {
  if (syncIntervalId || inboundIntervalId) {
    console.log('[DialerSync] Already running');
    return;
  }

  console.log('[DialerSync] Starting background processor (10s inbound check / 60s full sync)');

  // Initial sync after short delay
  setTimeout(() => {
    fullSync().catch(err => console.error('[DialerSync] Initial sync error:', err));
  }, 8000);

  inboundIntervalId = setInterval(() => {
    checkInbound().catch(() => {});
  }, INBOUND_CHECK_MS);

  syncIntervalId = setInterval(() => {
    fullSync().catch(err => console.error('[DialerSync] Sync error:', err));
  }, SYNC_INTERVAL_MS);
}

/**
 * Stop the background processor.
 */
export function stopDialerSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  if (inboundIntervalId) {
    clearInterval(inboundIntervalId);
    inboundIntervalId = null;
  }
  console.log('[DialerSync] Stopped');
}

/**
 * Get sync health status.
 */
export function getSyncStatus(): {
  running: boolean;
  sync: { ok: boolean; error: string | null; lastRun: string | null };
} {
  return {
    running: !!(syncIntervalId || inboundIntervalId),
    sync: { ok: lastSyncOk, error: lastSyncError, lastRun: lastSyncTime },
  };
}
