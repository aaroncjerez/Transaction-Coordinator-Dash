/**
 * Sync Runner — Background Airtable Sync
 *
 * Runs every 30 seconds. Picks up pending sync jobs from the queue
 * and pushes changes to Airtable. Handles retries and dead jobs.
 */

import type Database from 'better-sqlite3';
import { getDb } from './database.js';
import { resetInProgressJobs } from './sync-queue.js';

let intervalId: ReturnType<typeof setInterval> | null = null;

interface SyncJobRow {
  id: number;
  entity_type: 'deal' | 'task';
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  payload: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  error: string | null;
  created_at: string;
}

/**
 * Get Airtable configuration from settings table or env vars.
 */
function getAirtableConfig(db: Database.Database): { pat: string; baseId: string } | null {
  const patSetting = db.prepare("SELECT value FROM settings WHERE key = 'airtable_api_key'").get() as any;
  const baseSetting = db.prepare("SELECT value FROM settings WHERE key = 'airtable_base_id'").get() as any;

  const pat = patSetting?.value || process.env.AIRTABLE_PAT || process.env.VITE_AIRTABLE_PAT;
  const baseId = baseSetting?.value || process.env.AIRTABLE_BASE_ID || process.env.VITE_AIRTABLE_BASE_ID;

  if (!pat || !baseId) return null;
  return { pat, baseId };
}

/**
 * Map local deal fields to Airtable field names.
 */
function mapDealToAirtableFields(payload: Record<string, any>): Record<string, any> {
  const fieldMap: Record<string, string> = {
    deal_name: 'Deal Name',
    deal_type: 'Deal type',
    stage: 'Stage',
    county: 'County',
    state: 'State',
    notes: 'Notes',
    purchase_price: 'Purchase Price',
    expected_sales_price: 'Expected sales price',
    contract_execution_date: 'Contract Execution date',
    expected_close_date: 'Expected close date',
    close_date: 'Close date',
    due_diligence_link: 'Due Diligence link',
  };

  const airtableFields: Record<string, any> = {};
  for (const [localKey, value] of Object.entries(payload)) {
    if (fieldMap[localKey]) {
      airtableFields[fieldMap[localKey]] = value;
    }
  }
  return airtableFields;
}

/**
 * Map local task fields to Airtable field names.
 */
function mapTaskToAirtableFields(payload: Record<string, any>): Record<string, any> {
  const fieldMap: Record<string, string> = {
    title: 'Task Name',
    status: 'Status',
    notes: 'Notes',
    assignee: 'Assignee',
    task_order: 'Order',
  };

  const airtableFields: Record<string, any> = {};
  for (const [localKey, value] of Object.entries(payload)) {
    if (fieldMap[localKey]) {
      airtableFields[fieldMap[localKey]] = value;
    }
  }
  return airtableFields;
}

/**
 * Process a single sync job.
 */
async function processJob(
  db: Database.Database,
  job: SyncJobRow,
  config: { pat: string; baseId: string }
): Promise<void> {
  const tableName = job.entity_type === 'deal' ? 'Deals' : 'Tasks';
  const entity = db.prepare(
    `SELECT * FROM ${job.entity_type === 'deal' ? 'deals' : 'tasks'} WHERE id = ?`
  ).get(job.entity_id) as any;

  if (job.action === 'delete') {
    // For delete, we need the airtable_id from the payload (entity may already be deleted locally)
    const payload = job.payload ? JSON.parse(job.payload) : {};
    const airtableId = payload.airtable_id;

    if (!airtableId) {
      console.warn(`[SyncRunner] Delete job ${job.id}: no airtable_id, marking completed`);
      return;
    }

    const url = `https://api.airtable.com/v0/${config.baseId}/${tableName}/${airtableId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.pat}` },
    });

    if (!res.ok && res.status !== 404) {
      throw new Error(`Airtable delete failed: ${res.statusText}`);
    }
    return;
  }

  if (!entity) {
    console.warn(`[SyncRunner] Job ${job.id}: entity ${job.entity_id} not found locally, skipping`);
    return;
  }

  const payload = job.payload ? JSON.parse(job.payload) : entity;
  const airtableFields = job.entity_type === 'deal'
    ? mapDealToAirtableFields(payload)
    : mapTaskToAirtableFields(payload);

  if (job.action === 'create' && !entity.airtable_id) {
    // Create new record in Airtable
    const url = `https://api.airtable.com/v0/${config.baseId}/${tableName}`;

    // For tasks, we need to link to deal via airtable_id
    if (job.entity_type === 'task' && entity.deal_id) {
      const deal = db.prepare('SELECT airtable_id FROM deals WHERE id = ?').get(entity.deal_id) as any;
      if (deal?.airtable_id) {
        airtableFields['Deal'] = [deal.airtable_id];
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: airtableFields }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Airtable create failed: ${errText}`);
    }

    const data = await res.json();

    // Update local record with new airtable_id
    const updateTable = job.entity_type === 'deal' ? 'deals' : 'tasks';
    db.prepare(`UPDATE ${updateTable} SET airtable_id = ? WHERE id = ?`).run(data.id, job.entity_id);

  } else if (entity.airtable_id) {
    // Update existing record in Airtable
    const url = `https://api.airtable.com/v0/${config.baseId}/${tableName}/${entity.airtable_id}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${config.pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: airtableFields }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Airtable update failed: ${errText}`);
    }
  }
}

/**
 * Process pending sync jobs in the queue.
 */
async function processSyncQueue(db: Database.Database): Promise<void> {
  const config = getAirtableConfig(db);
  if (!config) {
    // Airtable not configured — skip silently
    return;
  }

  // Pick up pending jobs (oldest first, max 5 per batch)
  const jobs = db.prepare(
    "SELECT * FROM sync_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5"
  ).all() as SyncJobRow[];

  if (jobs.length === 0) return;

  console.log(`[SyncRunner] Processing ${jobs.length} sync jobs...`);

  for (const job of jobs) {
    // Mark as in_progress
    db.prepare("UPDATE sync_jobs SET status = 'in_progress', attempts = attempts + 1 WHERE id = ?").run(job.id);

    try {
      await processJob(db, job, config);

      // Mark completed
      db.prepare("UPDATE sync_jobs SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(job.id);

      // Log to audit
      db.prepare('INSERT INTO audit_log (event_type, details) VALUES (?, ?)').run(
        'sync_completed',
        JSON.stringify({ job_id: job.id, entity_type: job.entity_type, entity_id: job.entity_id, action: job.action })
      );

    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      console.error(`[SyncRunner] Job ${job.id} failed:`, errorMsg);

      if (job.attempts + 1 >= job.max_attempts) {
        // Max retries reached — mark as failed
        db.prepare("UPDATE sync_jobs SET status = 'failed', error = ? WHERE id = ?").run(errorMsg, job.id);
        console.warn(`[SyncRunner] Job ${job.id} permanently failed after ${job.max_attempts} attempts`);
      } else {
        // Reset to pending for retry
        db.prepare("UPDATE sync_jobs SET status = 'pending', error = ? WHERE id = ?").run(errorMsg, job.id);
      }
    }
  }
}

/**
 * Start the sync runner. Runs every 30 seconds.
 */
export function startSyncRunner(): void {
  const INTERVAL_MS = 30 * 1000; // 30 seconds

  console.log('[SyncRunner] Starting background sync runner (30s interval)');

  // On startup, reset any in-progress jobs (crashed during previous run)
  try {
    const db = getDb();
    resetInProgressJobs(db);
  } catch (e) {
    console.warn('[SyncRunner] Could not reset in-progress jobs:', e);
  }

  // Schedule recurring processing
  intervalId = setInterval(async () => {
    try {
      const db = getDb();
      await processSyncQueue(db);
    } catch (e) {
      console.error('[SyncRunner] Queue processing failed:', e);
    }
  }, INTERVAL_MS);

  // Also run once immediately (with a small delay to let everything initialize)
  setTimeout(async () => {
    try {
      const db = getDb();
      await processSyncQueue(db);
    } catch (e) {
      console.warn('[SyncRunner] Initial queue processing failed:', e);
    }
  }, 5000);
}

/**
 * Stop the sync runner.
 */
export function stopSyncRunner(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[SyncRunner] Stopped');
  }
}
