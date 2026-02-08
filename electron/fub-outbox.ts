/**
 * FUB Write Outbox — durable queue for app→FUB mutations.
 *
 * Pattern:
 * 1. Insert job into fub_outbox table (durable, survives crashes)
 * 2. Attempt immediate push (best-effort)
 * 3. Background processor sweeps pending/failed jobs every sync cycle
 * 4. Exponential backoff: 0s, 30s, 2min, 10min, 30min
 * 5. After max_attempts (5), mark as dead_letter
 */

import type Database from 'better-sqlite3';
import { getDb } from './database.js';
import { getFubConfig, updatePersonStage, updatePerson, createNote } from './fub-client.js';
import { toFubStageName } from './stage-constants.js';

const BACKOFF_SECONDS = [0, 30, 120, 600, 1800]; // 0s, 30s, 2m, 10m, 30m

export interface OutboxJob {
  id: number;
  deal_id: string;
  action: string;
  payload: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string;
  created_at: string;
  completed_at: string | null;
}

/**
 * Enqueue a FUB push job. Returns the job ID.
 * Deduplicates: if a pending/in_flight job for the same deal+action exists,
 * updates its payload instead of creating a duplicate.
 */
export function enqueueFubPush(
  db: Database.Database,
  dealId: string,
  action: string,
  payload: Record<string, any>
): number {
  // Deduplicate: collapse pending jobs for the same deal+action
  const existing = db.prepare(
    `SELECT id FROM fub_outbox
     WHERE deal_id = ? AND action = ? AND status IN ('pending', 'in_flight')
     ORDER BY created_at DESC LIMIT 1`
  ).get(dealId, action) as any;

  if (existing) {
    // Update payload of existing job (user changed stage again before push completed)
    db.prepare(
      `UPDATE fub_outbox SET payload = ?, next_retry_at = datetime('now'), attempts = 0, status = 'pending'
       WHERE id = ?`
    ).run(JSON.stringify(payload), existing.id);
    console.log(`[FubOutbox] Deduped job ${existing.id} for ${action} on deal ${dealId}`);
    return existing.id;
  }

  const result = db.prepare(
    `INSERT INTO fub_outbox (deal_id, action, payload, status, next_retry_at)
     VALUES (?, ?, ?, 'pending', datetime('now'))`
  ).run(dealId, action, JSON.stringify(payload));

  const jobId = Number(result.lastInsertRowid);
  console.log(`[FubOutbox] Enqueued job ${jobId}: ${action} for deal ${dealId}`);
  return jobId;
}

/**
 * Process a single outbox job. Returns true if succeeded.
 */
export async function processOutboxJob(db: Database.Database, job: OutboxJob): Promise<boolean> {
  // Mark as in_flight
  db.prepare(`UPDATE fub_outbox SET status = 'in_flight' WHERE id = ?`).run(job.id);

  try {
    const config = getFubConfig(db);
    if (!config) throw new Error('FUB not configured (missing API key or account name)');

    const payload = JSON.parse(job.payload);

    if (job.action === 'push_stage') {
      const deal = db.prepare('SELECT fub_person_id, deal_name FROM deals WHERE id = ?').get(job.deal_id) as any;
      if (!deal?.fub_person_id) throw new Error('Deal has no fub_person_id');

      const personId = parseInt(deal.fub_person_id, 10);
      if (isNaN(personId)) throw new Error(`Invalid fub_person_id: ${deal.fub_person_id}`);

      // Translate app stage → FUB stage name (FUB silently ignores unrecognized names)
      const fubStage = toFubStageName(payload.stage);
      console.log(`[FubOutbox] Pushing stage "${payload.stage}" → FUB "${fubStage}" for person ${personId} (${deal.deal_name})`);

      const success = await updatePersonStage(config, personId, fubStage);
      if (!success) throw new Error('FUB API returned false for stage update');

      // Update fub_person_sync record
      db.prepare(`
        INSERT INTO fub_person_sync (fub_person_id, deal_id, fub_stage, last_synced_at, status, updated_at)
        VALUES (?, ?, ?, datetime('now'), 'synced', datetime('now'))
        ON CONFLICT(fub_person_id) DO UPDATE SET
          fub_stage = excluded.fub_stage,
          last_synced_at = datetime('now'),
          status = 'synced',
          error = NULL,
          updated_at = datetime('now')
      `).run(String(personId), job.deal_id, fubStage);

      console.log(`[FubOutbox] Pushed stage "${payload.stage}" to FUB person ${personId} (${deal.deal_name})`);
    } else if (job.action === 'push_fields') {
      // Push custom field changes to FUB
      const deal = db.prepare('SELECT fub_person_id, deal_name FROM deals WHERE id = ?').get(job.deal_id) as any;
      if (!deal?.fub_person_id) throw new Error('Deal has no fub_person_id');

      const personId = parseInt(deal.fub_person_id, 10);
      if (isNaN(personId)) throw new Error(`Invalid fub_person_id: ${deal.fub_person_id}`);

      // payload.fubFields contains the FUB API field names + values
      const fubFields = payload.fubFields || {};
      if (Object.keys(fubFields).length === 0) throw new Error('No FUB fields to push');

      console.log(`[FubOutbox] Pushing ${Object.keys(fubFields).length} fields to FUB person ${personId} (${deal.deal_name})`);
      const success = await updatePerson(config, personId, fubFields);
      if (!success) throw new Error('FUB API returned false for field update');

      console.log(`[FubOutbox] Pushed fields to FUB person ${personId}: ${Object.keys(fubFields).join(', ')}`);
    } else if (job.action === 'post_note') {
      const deal = db.prepare('SELECT fub_person_id FROM deals WHERE id = ?').get(job.deal_id) as any;
      if (!deal?.fub_person_id) throw new Error('Deal has no fub_person_id');

      const personId = parseInt(deal.fub_person_id, 10);
      if (isNaN(personId)) throw new Error(`Invalid fub_person_id`);

      await createNote(config, personId, payload.subject, payload.body);
      console.log(`[FubOutbox] Posted note to FUB person ${personId}`);
    }

    // Mark succeeded
    db.prepare(
      `UPDATE fub_outbox SET status = 'succeeded', completed_at = datetime('now'), last_error = NULL WHERE id = ?`
    ).run(job.id);

    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;

    if (attempts >= job.max_attempts) {
      // Dead letter
      db.prepare(
        `UPDATE fub_outbox SET status = 'dead_letter', attempts = ?, last_error = ? WHERE id = ?`
      ).run(attempts, errMsg, job.id);
      console.warn(`[FubOutbox] Job ${job.id} dead-lettered after ${attempts} attempts: ${errMsg}`);
    } else {
      // Schedule retry with backoff
      const backoffSec = BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length - 1)];
      db.prepare(
        `UPDATE fub_outbox SET status = 'pending', attempts = ?, last_error = ?,
         next_retry_at = datetime('now', '+' || ? || ' seconds')
         WHERE id = ?`
      ).run(attempts, errMsg, backoffSec, job.id);
      console.log(`[FubOutbox] Job ${job.id} retry #${attempts} scheduled in ${backoffSec}s: ${errMsg}`);
    }

    return false;
  }
}

/**
 * Process all ready outbox jobs. Called from the background sync loop.
 */
export async function processOutboxQueue(): Promise<{
  processed: number; succeeded: number; failed: number;
}> {
  const db = getDb();
  if (!db) return { processed: 0, succeeded: 0, failed: 0 };

  const jobs = db.prepare(
    `SELECT * FROM fub_outbox
     WHERE status = 'pending' AND next_retry_at <= datetime('now')
     ORDER BY created_at ASC LIMIT 10`
  ).all() as OutboxJob[];

  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    const ok = await processOutboxJob(db, job);
    if (ok) succeeded++;
    else failed++;
  }

  if (jobs.length > 0) {
    console.log(`[FubOutbox] Sweep: ${succeeded}/${jobs.length} succeeded, ${failed} failed`);
  }

  return { processed: jobs.length, succeeded, failed };
}

/**
 * Attempt immediate push of a specific job. Returns result for UI feedback.
 */
export async function attemptImmediatePush(jobId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = getDb();
  if (!db) return { success: false, error: 'No database' };

  const job = db.prepare('SELECT * FROM fub_outbox WHERE id = ?').get(jobId) as OutboxJob | undefined;
  if (!job) return { success: false, error: 'Job not found' };

  const ok = await processOutboxJob(db, job);

  if (ok) {
    return { success: true };
  }

  // Re-read job to get updated last_error
  const updated = db.prepare('SELECT last_error FROM fub_outbox WHERE id = ?').get(jobId) as any;
  return { success: false, error: updated?.last_error || 'Unknown error' };
}

/**
 * Recover any in_flight jobs that were interrupted (e.g. app crash).
 * Called on startup.
 */
export function recoverStaleJobs(): void {
  const db = getDb();
  if (!db) return;

  const stale = db.prepare(
    `UPDATE fub_outbox SET status = 'pending', next_retry_at = datetime('now')
     WHERE status = 'in_flight'`
  ).run();

  if (stale.changes > 0) {
    console.log(`[FubOutbox] Recovered ${stale.changes} stale in_flight jobs`);
  }
}
