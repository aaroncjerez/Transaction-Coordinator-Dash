/**
 * FUB Person Sync Runner — Background Deal Discovery & Stage Sync
 *
 * Runs every 30 seconds. Polls FUB for people in qualifying stages,
 * creates/updates local deals, and seeds tasks via the rule engine.
 *
 * Bidirectional:
 * - FUB → App: Discovers new people, detects stage changes
 * - App → FUB: pushStageToFub() called by IPC when user changes stage in app
 *
 * Follows the same start/stop pattern as fub-file-sync.ts.
 */

import { BrowserWindow } from 'electron';
import crypto from 'crypto';
import { getDb } from './database.js';
import {
  getFubConfig,
  fetchPeopleByStages,
  updatePersonStage,
  createNote,
  type FubConfig,
  type FubPerson,
} from './fub-client.js';
import { seedTasksForStage, seedTasksUpToStage } from './rule-engine.js';
import {
  QUALIFYING_FUB_STAGES,
  resolveFubStage,
  STAGE_ORDER,
  type DealStage,
} from './stage-constants.js';

const SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds
let intervalId: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Start the FUB person sync background runner.
 * Called from main.ts on app startup.
 */
export function startFubPersonSync(): void {
  if (intervalId) {
    console.log('[FubPersonSync] Already running');
    return;
  }

  console.log('[FubPersonSync] Starting (30s interval)...');

  // Run once after a short delay (let DB and other systems init)
  setTimeout(() => {
    runSync().catch(err => console.error('[FubPersonSync] Initial sync error:', err));
  }, 10_000);

  // Then run on interval
  intervalId = setInterval(() => {
    runSync().catch(err => console.error('[FubPersonSync] Sync error:', err));
  }, SYNC_INTERVAL_MS);
}

/**
 * Stop the FUB person sync runner.
 */
export function stopFubPersonSync(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[FubPersonSync] Stopped');
  }
}

/**
 * Manually trigger a person sync.
 * Called from IPC handler.
 */
export async function triggerFubPersonSync(): Promise<{
  success: boolean;
  newDeals: number;
  updatedDeals: number;
  errors: number;
}> {
  return runSync();
}

/**
 * Push a deal's stage change to FUB.
 * Called when user changes stage in the app.
 */
export async function pushStageToFub(dealId: string, appStage: DealStage): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const config = getFubConfig(db);
  if (!config) return false;

  const deal = db.prepare('SELECT fub_person_id FROM deals WHERE id = ?').get(dealId) as any;
  if (!deal?.fub_person_id) {
    console.warn(`[FubPersonSync] Cannot push stage — deal ${dealId} has no fub_person_id`);
    return false;
  }

  const personId = parseInt(deal.fub_person_id, 10);
  if (isNaN(personId)) return false;

  // Push the same stage name to FUB (stages are now identical)
  const success = await updatePersonStage(config, personId, appStage);
  if (success) {
    console.log(`[FubPersonSync] Pushed stage "${appStage}" to FUB person ${personId}`);

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
    `).run(String(personId), dealId, appStage);
  }

  return success;
}

/**
 * Post a task completion note to FUB person timeline.
 */
export async function postTaskNoteToFub(dealId: string, taskId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const config = getFubConfig(db);
  if (!config) return false;

  const deal = db.prepare('SELECT fub_person_id, deal_name FROM deals WHERE id = ?').get(dealId) as any;
  if (!deal?.fub_person_id) return false;

  const task = db.prepare('SELECT title, status FROM tasks WHERE id = ?').get(taskId) as any;
  if (!task) return false;

  const personId = parseInt(deal.fub_person_id, 10);
  if (isNaN(personId)) return false;

  const subject = `Task Completed: ${task.title}`;
  const body = `Task "${task.title}" has been marked as ${task.status} for deal "${deal.deal_name}".`;

  const note = await createNote(config, personId, subject, body);
  if (note) {
    console.log(`[FubPersonSync] Posted task note to FUB person ${personId}: ${task.title}`);
  }

  return !!note;
}

/**
 * Core sync logic. Fetches people from FUB, creates/updates local deals.
 */
async function runSync(): Promise<{
  success: boolean;
  newDeals: number;
  updatedDeals: number;
  errors: number;
}> {
  if (isSyncing) {
    return { success: true, newDeals: 0, updatedDeals: 0, errors: 0 };
  }

  const db = getDb();
  if (!db) {
    return { success: false, newDeals: 0, updatedDeals: 0, errors: 0 };
  }

  const config = getFubConfig(db);
  if (!config) {
    // No FUB API key configured — silently skip
    return { success: true, newDeals: 0, updatedDeals: 0, errors: 0 };
  }

  isSyncing = true;
  let newDeals = 0;
  let updatedDeals = 0;
  let errors = 0;

  try {
    // Fetch all people from qualifying FUB stages
    const people = await fetchPeopleByStages(config, QUALIFYING_FUB_STAGES);

    if (people.length === 0) {
      isSyncing = false;
      return { success: true, newDeals: 0, updatedDeals: 0, errors: 0 };
    }

    for (const person of people) {
      try {
        const result = processPerson(db, person);
        if (result === 'new') newDeals++;
        else if (result === 'updated') updatedDeals++;
      } catch (err) {
        errors++;
        console.error(`[FubPersonSync] Error processing person ${person.id}:`, err);

        // Update fub_person_sync with error
        try {
          db.prepare(`
            INSERT INTO fub_person_sync (fub_person_id, fub_stage, last_synced_at, status, error, updated_at)
            VALUES (?, ?, datetime('now'), 'error', ?, datetime('now'))
            ON CONFLICT(fub_person_id) DO UPDATE SET
              last_synced_at = datetime('now'),
              status = 'error',
              error = excluded.error,
              updated_at = datetime('now')
          `).run(String(person.id), person.stage || '', err instanceof Error ? err.message : String(err));
        } catch { /* ignore tracking error */ }
      }
    }

    if (newDeals > 0 || updatedDeals > 0) {
      console.log(`[FubPersonSync] Sync complete: ${newDeals} new, ${updatedDeals} updated, ${errors} errors (${people.length} people checked)`);

      // Notify renderer to refresh
      notifyRenderer('fub:person-sync-complete', { newDeals, updatedDeals, errors });
    }
  } catch (err) {
    console.error('[FubPersonSync] Sync failed:', err);
    errors++;
  } finally {
    isSyncing = false;
  }

  return { success: errors === 0, newDeals, updatedDeals, errors };
}

/**
 * Process a single FUB person — create or update local deal.
 * Returns 'new', 'updated', or 'unchanged'.
 */
function processPerson(db: any, person: FubPerson): 'new' | 'updated' | 'unchanged' {
  const personId = String(person.id);
  const fubStage = person.stage || '';

  // Resolve FUB stage → app stage
  const appStage = resolveFubStage(fubStage);
  if (!appStage) {
    // Trash or unknown stage — skip
    return 'unchanged';
  }

  // Extract deal info from FUB person
  const dealName = buildDealName(person);
  const email = person.emails?.[0]?.value || null;
  const phone = person.phones?.[0]?.value || null;

  // Check if deal already exists
  const existingDeal = db.prepare(
    'SELECT id, stage, deal_type FROM deals WHERE fub_person_id = ?'
  ).get(personId) as any;

  if (existingDeal) {
    // Deal exists — check for stage change
    if (existingDeal.stage !== appStage) {
      // Stage changed in FUB → update local deal
      const oldStage = existingDeal.stage;

      db.prepare(`
        UPDATE deals SET stage = ?, previous_stage = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(appStage, oldStage, existingDeal.id);

      // Log stage change
      db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
        existingDeal.id, 'stage_change',
        JSON.stringify({ from: oldStage, to: appStage, source: 'fub_sync' })
      );

      // Seed tasks for the new stage
      const dealType = existingDeal.deal_type || 'Standard Flip';
      const seededTasks = seedTasksForStage(db, existingDeal.id, dealType, appStage);
      if (seededTasks.length > 0) {
        console.log(`[FubPersonSync] Stage change ${oldStage} → ${appStage}: seeded ${seededTasks.length} tasks for deal ${existingDeal.id}`);
      }

      // Update sync record
      updateSyncRecord(db, personId, existingDeal.id, fubStage, 'synced');

      return 'updated';
    }

    // Update sync record (no stage change)
    updateSyncRecord(db, personId, existingDeal.id, fubStage, 'synced');
    return 'unchanged';
  }

  // New person — create deal
  const dealId = generateUUID();
  const dealType = 'Standard Flip'; // Default deal type for new deals from FUB

  db.prepare(`
    INSERT INTO deals (
      id, fub_person_id, deal_name, last_name, deal_type, stage, phone_number,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    dealId, personId, dealName, person.lastName || '',
    dealType, appStage, phone
  );

  // Log deal creation
  db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
    dealId, 'deal_created',
    JSON.stringify({ deal_name: dealName, stage: appStage, source: 'fub_sync', fub_person_id: personId })
  );

  // Seed tasks up to the current stage
  const seededTasks = seedTasksUpToStage(db, dealId, dealType, appStage);
  console.log(`[FubPersonSync] New deal "${dealName}" (person ${personId}): stage=${appStage}, seeded ${seededTasks.length} tasks`);

  // Create sync record
  updateSyncRecord(db, personId, dealId, fubStage, 'synced');

  return 'new';
}

/**
 * Build a deal name from FUB person fields.
 */
function buildDealName(person: FubPerson): string {
  const parts = [person.firstName, person.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  // Fallback to email or ID
  const email = person.emails?.[0]?.value;
  if (email) return email;
  return `FUB Person ${person.id}`;
}

/**
 * Insert or update fub_person_sync record.
 */
function updateSyncRecord(
  db: any,
  fubPersonId: string,
  dealId: string,
  fubStage: string,
  status: string,
  error?: string
): void {
  db.prepare(`
    INSERT INTO fub_person_sync (fub_person_id, deal_id, fub_stage, last_synced_at, status, error, updated_at)
    VALUES (?, ?, ?, datetime('now'), ?, ?, datetime('now'))
    ON CONFLICT(fub_person_id) DO UPDATE SET
      deal_id = excluded.deal_id,
      fub_stage = excluded.fub_stage,
      last_synced_at = datetime('now'),
      status = excluded.status,
      error = excluded.error,
      updated_at = datetime('now')
  `).run(fubPersonId, dealId, fubStage, status, error || null);
}

/**
 * Notify renderer process of sync events.
 */
function notifyRenderer(channel: string, data: any): void {
  try {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  } catch {
    // Ignore — window may not exist yet
  }
}
