/**
 * Sync Queue — Enqueue helper for local-first sync
 *
 * After every local write, enqueue a sync job so the background runner
 * can push changes to Airtable asynchronously.
 */

import type Database from 'better-sqlite3';

/**
 * Enqueue a sync job for background processing.
 *
 * @param db - Database instance
 * @param entityType - 'deal' or 'task'
 * @param entityId - The local entity ID
 * @param action - 'create', 'update', or 'delete'
 * @param payload - The fields to sync (for create/update)
 */
export function enqueueSync(
  db: Database.Database,
  entityType: 'deal' | 'task',
  entityId: string,
  action: 'create' | 'update' | 'delete',
  payload?: Record<string, any>
): void {
  db.prepare(`
    INSERT INTO sync_jobs (entity_type, entity_id, action, payload, status, attempts, max_attempts)
    VALUES (?, ?, ?, ?, 'pending', 0, 3)
  `).run(
    entityType,
    entityId,
    action,
    payload ? JSON.stringify(payload) : null
  );

  console.log(`[SyncQueue] Enqueued: ${action} ${entityType} ${entityId}`);
}

/**
 * Reset any in-progress jobs back to pending.
 * Called on app startup to recover from crashes.
 */
export function resetInProgressJobs(db: Database.Database): void {
  const result = db.prepare(
    "UPDATE sync_jobs SET status = 'pending' WHERE status = 'in_progress'"
  ).run();

  if (result.changes > 0) {
    console.log(`[SyncQueue] Reset ${result.changes} in-progress jobs back to pending`);
  }
}
