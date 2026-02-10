/**
 * FUB File Sync Runner — Background Attachment Synchronization
 *
 * Runs every 5 minutes. For each deal with a fub_person_id:
 * 1. Discovers attachment IDs by scanning FUB events + notes
 * 2. Downloads any attachments not already synced locally
 * 3. Deduplicates via SHA256 (claims existing manual uploads)
 * 4. Reconciles file counts between local and FUB
 * 5. Updates fub_file_sync status per deal
 *
 * Follows the same start/stop pattern as sync-runner.ts and alert-scheduler.ts.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getDb, getDataDir } from './database.js';
import {
  getFubConfig,
  discoverAttachments,
  downloadAttachment,
  type FubConfig,
} from './fub-client.js';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DELAY_BETWEEN_DEALS_MS = 1500;    // 1.5s between API bursts per deal (avoid 429s)
let intervalId: ReturnType<typeof setInterval> | null = null;

function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Start the FUB file sync background runner.
 * Called from main.ts on app startup.
 */
export function startFubFileSync(): void {
  if (intervalId) {
    console.log('[FubFileSync] Already running');
    return;
  }

  console.log('[FubFileSync] Starting (5-min interval)...');

  // Run once after a short delay (let DB and other systems init)
  setTimeout(() => {
    runSync().catch(err => console.error('[FubFileSync] Initial sync error:', err));
  }, 15_000);

  // Then run on interval
  intervalId = setInterval(() => {
    runSync().catch(err => console.error('[FubFileSync] Sync error:', err));
  }, SYNC_INTERVAL_MS);
}

/**
 * Stop the FUB file sync runner.
 */
export function stopFubFileSync(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[FubFileSync] Stopped');
  }
}

/**
 * Manually trigger sync for one deal or all deals.
 * Called from IPC handler.
 */
export async function triggerFubSync(dealId?: string): Promise<{ success: boolean; synced: number; errors: number }> {
  return runSync(dealId);
}

/**
 * Core sync logic. Processes all deals with fub_person_id (or a single deal).
 */
async function runSync(targetDealId?: string): Promise<{ success: boolean; synced: number; errors: number }> {
  const db = getDb();
  if (!db) {
    console.warn('[FubFileSync] No database available');
    return { success: false, synced: 0, errors: 0 };
  }

  const config = getFubConfig(db);
  if (!config) {
    // No FUB API key configured — silently skip
    return { success: true, synced: 0, errors: 0 };
  }

  // Get deals with FUB person IDs
  let deals: any[];
  if (targetDealId) {
    deals = db.prepare(
      'SELECT id, deal_name, fub_person_id FROM deals WHERE id = ? AND fub_person_id IS NOT NULL AND fub_person_id != ?'
    ).all(targetDealId, '') as any[];
  } else {
    deals = db.prepare(
      "SELECT id, deal_name, fub_person_id FROM deals WHERE fub_person_id IS NOT NULL AND fub_person_id != ''"
    ).all() as any[];
  }

  if (deals.length === 0) {
    return { success: true, synced: 0, errors: 0 };
  }

  console.log(`[FubFileSync] Processing ${deals.length} deal(s) with FUB links`);

  let totalSynced = 0;
  let totalErrors = 0;

  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];

    // Rate limit: pause between deals to avoid FUB 429 Too Many Requests
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_DEALS_MS));
    }

    try {
      const result = await syncDealFiles(db, config, deal);
      totalSynced += result.newFiles;
    } catch (err) {
      totalErrors++;
      const errorMsg = err instanceof Error ? err.message : String(err);

      // If rate-limited, stop processing remaining deals — retry next cycle
      if (errorMsg.includes('429')) {
        console.warn(`[FubFileSync] Rate-limited at deal ${i + 1}/${deals.length} — stopping this cycle`);
        break;
      }

      console.error(`[FubFileSync] Error syncing deal ${deal.id} (${deal.deal_name}):`, errorMsg);

      // Update fub_file_sync with error status
      updateFubSyncRecord(db, deal.id, deal.fub_person_id, {
        last_status: 'error',
        last_error: errorMsg,
      });

      // Log to audit
      db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
        deal.id,
        'fub_file_sync_error',
        JSON.stringify({ error: errorMsg })
      );
    }
  }

  if (totalSynced > 0 || totalErrors > 0) {
    console.log(`[FubFileSync] Complete: ${totalSynced} new files synced, ${totalErrors} errors`);
  }

  return { success: totalErrors === 0, synced: totalSynced, errors: totalErrors };
}

/**
 * Sync files for a single deal.
 */
async function syncDealFiles(
  db: any,
  config: FubConfig,
  deal: { id: string; deal_name: string; fub_person_id: string }
): Promise<{ newFiles: number; totalFub: number; totalLocal: number }> {
  const { id: dealId, fub_person_id: personId } = deal;

  // Update status to syncing
  updateFubSyncRecord(db, dealId, personId, { last_status: 'syncing' });

  // 1. Discover all attachment IDs from FUB
  const discovered = await discoverAttachments(config, personId);
  const fubAttachmentIds = discovered.map(d => d.id);

  // 2. Check which attachments are already synced locally
  const localFubFiles = db.prepare(
    'SELECT fub_attachment_id FROM files WHERE deal_id = ? AND fub_attachment_id IS NOT NULL'
  ).all(dealId) as any[];
  const localFubIdSet = new Set(localFubFiles.map((f: any) => parseInt(f.fub_attachment_id, 10)));

  // 3. Find new attachments to download
  const newAttachmentIds = fubAttachmentIds.filter(id => !localFubIdSet.has(id));

  let newFileCount = 0;
  const FILE_STORAGE_DIR = path.join(getDataDir(), 'transaction-docs');
  const dealDir = path.join(FILE_STORAGE_DIR, dealId);

  for (const attachmentId of newAttachmentIds) {
    try {
      const result = await downloadAttachment(config, attachmentId);
      if (!result) {
        console.warn(`[FubFileSync] Skipping attachment ${attachmentId} (not accessible)`);
        continue;
      }

      const { buffer, fileName } = result;

      // Compute SHA256 for dedup
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      // Check if this SHA256 already exists locally for this deal (manual upload match)
      const existingBySha = db.prepare(
        'SELECT id, fub_attachment_id FROM files WHERE deal_id = ? AND sha256 = ?'
      ).get(dealId, sha256) as any;

      if (existingBySha) {
        // SHA256 match — claim the existing file (link it to FUB attachment)
        if (!existingBySha.fub_attachment_id) {
          db.prepare('UPDATE files SET fub_attachment_id = ?, source = ? WHERE id = ?').run(
            String(attachmentId), 'local', existingBySha.id
          );
          console.log(`[FubFileSync] Claimed local file ${existingBySha.id} → FUB attachment ${attachmentId} (SHA256 match)`);
        }
        // Either way, it's accounted for
        continue;
      }

      // New file — save to disk
      fs.mkdirSync(dealDir, { recursive: true });
      const diskPath = path.join(dealDir, `${Date.now()}_fub_${attachmentId}_${fileName}`);
      fs.writeFileSync(diskPath, buffer);

      // Insert into files table
      const fileId = generateUUID();
      db.prepare(`
        INSERT INTO files (id, deal_id, file_name, file_path, category, sha256, file_size, source, fub_attachment_id)
        VALUES (?, ?, ?, ?, 'other', ?, ?, 'fub', ?)
      `).run(fileId, dealId, fileName, diskPath, sha256, buffer.length, String(attachmentId));

      newFileCount++;
      console.log(`[FubFileSync] Downloaded FUB attachment ${attachmentId} → ${fileName} (${buffer.length} bytes)`);
    } catch (err) {
      console.warn(`[FubFileSync] Failed to download attachment ${attachmentId}:`, err);
    }
  }

  // 4. Reconcile counts
  const totalLocalFiles = (db.prepare(
    'SELECT COUNT(*) as count FROM files WHERE deal_id = ?'
  ).get(dealId) as any).count;

  const totalFubAttachments = fubAttachmentIds.length;

  // Check for mismatches (files in FUB not in local, or vice versa)
  const localFubLinked = (db.prepare(
    'SELECT COUNT(*) as count FROM files WHERE deal_id = ? AND fub_attachment_id IS NOT NULL'
  ).get(dealId) as any).count;

  const unlinkedLocal = totalLocalFiles - localFubLinked;
  const status = totalFubAttachments === localFubLinked ? 'synced' : 'mismatch';

  // Build mismatch info
  let mismatchedFiles: string | null = null;
  if (status === 'mismatch') {
    const mismatches: string[] = [];
    if (totalFubAttachments > localFubLinked) {
      mismatches.push(`${totalFubAttachments - localFubLinked} FUB files not downloaded`);
    }
    if (unlinkedLocal > 0) {
      mismatches.push(`${unlinkedLocal} local files not linked to FUB`);
    }
    mismatchedFiles = JSON.stringify(mismatches);
  }

  // 5. Update fub_file_sync record
  updateFubSyncRecord(db, dealId, personId, {
    last_status: status,
    last_error: null,
    local_file_count: totalLocalFiles,
    fub_file_count: totalFubAttachments,
    mismatched_files: mismatchedFiles,
  });

  // 6. Audit log if we synced new files
  if (newFileCount > 0) {
    db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
      dealId,
      'fub_file_sync_completed',
      JSON.stringify({
        new_files: newFileCount,
        total_local: totalLocalFiles,
        total_fub: totalFubAttachments,
      })
    );
  }

  return { newFiles: newFileCount, totalFub: totalFubAttachments, totalLocal: totalLocalFiles };
}

/**
 * Insert or update the fub_file_sync record for a deal.
 */
function updateFubSyncRecord(
  db: any,
  dealId: string,
  fubPersonId: string,
  fields: {
    last_status?: string;
    last_error?: string | null;
    local_file_count?: number;
    fub_file_count?: number;
    mismatched_files?: string | null;
  }
): void {
  // Upsert: try INSERT first, then UPDATE on conflict
  db.prepare(`
    INSERT INTO fub_file_sync (deal_id, fub_person_id, last_synced_at, last_status, last_error, local_file_count, fub_file_count, mismatched_files, updated_at)
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(deal_id) DO UPDATE SET
      fub_person_id = excluded.fub_person_id,
      last_synced_at = datetime('now'),
      last_status = COALESCE(excluded.last_status, last_status),
      last_error = excluded.last_error,
      local_file_count = COALESCE(excluded.local_file_count, local_file_count),
      fub_file_count = COALESCE(excluded.fub_file_count, fub_file_count),
      mismatched_files = excluded.mismatched_files,
      updated_at = datetime('now')
  `).run(
    dealId,
    fubPersonId,
    fields.last_status || 'pending',
    fields.last_error || null,
    fields.local_file_count ?? 0,
    fields.fub_file_count ?? 0,
    fields.mismatched_files || null
  );
}
