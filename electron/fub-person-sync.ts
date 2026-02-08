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
  updatePerson,
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
import { processOutboxQueue, recoverStaleJobs } from './fub-outbox.js';

const SYNC_INTERVAL_MS = 10 * 1000; // 10 seconds (faster for outbox retry catch-up)
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

  console.log('[FubPersonSync] Starting (10s interval)...');

  // Recover any in_flight outbox jobs from a previous crash
  try { recoverStaleJobs(); } catch (err) {
    console.warn('[FubPersonSync] Stale job recovery error:', err);
  }

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
  }

  // Sweep FUB write outbox — retries any pending/failed pushes
  try {
    await processOutboxQueue();
  } catch (err) {
    console.warn('[FubPersonSync] Outbox sweep error:', err);
  }

  isSyncing = false;
  return { success: errors === 0, newDeals, updatedDeals, errors };
}

/**
 * Map FUB customDealType values to app DealType.
 * FUB has: "Double Close", "Cash Flip", "Subdivide"
 * App has:  "Standard Flip", "Double Close", "Subdivide"
 */
function resolveDealType(fubDealType: string | null | undefined): string {
  if (!fubDealType) return 'Standard Flip';
  if (fubDealType === 'Cash Flip') return 'Standard Flip';
  if (fubDealType === 'Double Close' || fubDealType === 'Subdivide') return fubDealType;
  return 'Standard Flip';
}

/**
 * Reverse map: app DealType → FUB customDealType value.
 */
function toFubDealType(appDealType: string): string | null {
  if (appDealType === 'Standard Flip') return 'Cash Flip';
  if (appDealType === 'Double Close') return 'Double Close';
  if (appDealType === 'Subdivide') return 'Subdivide';
  return null;
}

/** Export for use by outbox pushes */
export { toFubDealType };

/**
 * Extract all custom fields from a FUB person into a flat object
 * matching local deals table column names.
 */
function extractFubFields(person: FubPerson): Record<string, any> {
  const fields: Record<string, any> = {};

  // Top-level FUB fields
  fields.email = person.emails?.[0]?.value || null;
  fields.phone_number = person.phones?.[0]?.value || null;
  fields.expected_sales_price = person.price ?? null; // FUB "Price" = Zillow price
  fields.deal_type = resolveDealType(person.customDealType);

  // Custom fields → local column mapping
  // customPurchasePrice is the primary source; fall back to customCashOffer
  const rawPurchasePrice = person.customPurchasePrice ?? person.customCashOffer;
  fields.purchase_price = rawPurchasePrice ? parseFloat(rawPurchasePrice) || 0 : null;
  fields.double_close_offer = person.customDoubleCloseOffer ? parseFloat(person.customDoubleCloseOffer) || null : null;
  fields.county = person.customParcelCounty || null;
  fields.state = person.customParcelState || null;
  fields.contract_execution_date = person.customContractExecutionDate || null;
  fields.contract_end_date = person.customContractEndDate || null;
  fields.expected_close_date = person.customClosingDate || null;
  fields.parcel_number = person.customParcelNumber || null;
  fields.parcel_zip = person.customParcelZip || null;
  fields.parcel_link = person.customParcelLink || null;
  fields.lot_acreage = person.customLotAcreage || null;
  fields.seller_bottom_price = person.customSellerSBottomPrice ? parseFloat(person.customSellerSBottomPrice) || null : null;
  fields.realtor_price_opinion = person.customRealtorPriceOpinion ? parseFloat(person.customRealtorPriceOpinion) || null : null;
  fields.mortgage_on_property = person.customMortgageOnProperty || null;
  fields.hoa_poa_on_property = person.customHOAPOAOnProperty || null;
  fields.title_search = person.customTitleSearch || null;
  fields.title_exam = person.customTitleExam || null;
  fields.survey = person.customSurvey || null;
  fields.soil_test = person.customSoilTest || null;
  fields.title_company_name = person.customTitleCompanyName || null;
  fields.title_company_phone = person.customTitleCompanyPhone || null;
  fields.title_company_email = person.customTitleCompanyEmail || null;
  fields.funder_name = person.customFunderName || null;
  fields.realtor_name = person.customRealtorName || null;
  fields.drone_photo_link = person.customDronePhotoLink || null;
  fields.reference_number = person.customReferenceNumber || null;
  fields.misc_deal_expenses = person.customMiscellaneousDealExpenses || null;

  return fields;
}

/**
 * Build SET clause + values for updating a deal with FUB fields.
 * Only includes fields that have non-null values from FUB (don't blank out local data).
 * For fields with pending outbox pushes, skip them (local wins).
 */
function buildFieldUpdateSql(
  db: any,
  dealId: string,
  fubFields: Record<string, any>,
  existingDeal: any
): { setClauses: string[]; values: any[] } {
  const setClauses: string[] = [];
  const values: any[] = [];

  // Check for pending field pushes
  const pendingFieldPush = db.prepare(
    `SELECT payload FROM fub_outbox
     WHERE deal_id = ? AND action = 'push_fields' AND status IN ('pending', 'in_flight')
     LIMIT 1`
  ).get(dealId) as any;

  let pendingFieldNames = new Set<string>();
  if (pendingFieldPush) {
    try {
      const payload = JSON.parse(pendingFieldPush.payload);
      pendingFieldNames = new Set(Object.keys(payload.localFields || {}));
    } catch { /* ignore parse error */ }
  }

  for (const [col, val] of Object.entries(fubFields)) {
    // Skip nulls — don't overwrite existing local data with null
    if (val === null || val === undefined) continue;

    // Skip fields that have a pending local→FUB push
    if (pendingFieldNames.has(col)) continue;

    // Only update if value actually differs
    if (existingDeal[col] !== val) {
      setClauses.push(`${col} = ?`);
      values.push(val);
    }
  }

  return { setClauses, values };
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

  // Extract all fields from FUB person
  const dealName = buildDealName(person);
  const fubFields = extractFubFields(person);

  // Check if deal already exists
  const existingDeal = db.prepare(
    'SELECT * FROM deals WHERE fub_person_id = ?'
  ).get(personId) as any;

  if (existingDeal) {
    let changed = false;

    // Stage change handling (with outbox guard)
    if (existingDeal.stage !== appStage) {
      const pendingPush = db.prepare(
        `SELECT id FROM fub_outbox
         WHERE deal_id = ? AND action = 'push_stage' AND status IN ('pending', 'in_flight')
         LIMIT 1`
      ).get(existingDeal.id) as any;

      if (pendingPush) {
        console.log(`[FubPersonSync] Skipping FUB→local stage overwrite for deal ${existingDeal.id} — outbox job ${pendingPush.id} pending`);
      } else {
        const oldStage = existingDeal.stage;
        db.prepare(`
          UPDATE deals SET stage = ?, previous_stage = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(appStage, oldStage, existingDeal.id);

        db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
          existingDeal.id, 'stage_change',
          JSON.stringify({ from: oldStage, to: appStage, source: 'fub_sync' })
        );

        const dealType = fubFields.deal_type || existingDeal.deal_type || 'Standard Flip';
        const seededTasks = seedTasksForStage(db, existingDeal.id, dealType, appStage);
        if (seededTasks.length > 0) {
          console.log(`[FubPersonSync] Stage change ${oldStage} → ${appStage}: seeded ${seededTasks.length} tasks for deal ${existingDeal.id}`);
        }
        changed = true;
      }
    }

    // Update custom fields (merge FUB data into local deal)
    const { setClauses, values } = buildFieldUpdateSql(db, existingDeal.id, fubFields, existingDeal);
    if (setClauses.length > 0) {
      setClauses.push("updated_at = datetime('now')");
      values.push(existingDeal.id);
      db.prepare(`UPDATE deals SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      changed = true;
    }

    updateSyncRecord(db, personId, existingDeal.id, fubStage, 'synced');
    return changed ? 'updated' : 'unchanged';
  }

  // New person — create deal with ALL FUB fields
  const dealId = generateUUID();
  const dealType = fubFields.deal_type || 'Standard Flip';

  db.prepare(`
    INSERT INTO deals (
      id, fub_person_id, deal_name, last_name, deal_type, stage,
      phone_number, email, county, state,
      purchase_price, expected_sales_price,
      contract_execution_date, contract_end_date, expected_close_date,
      parcel_number, parcel_zip, parcel_link, lot_acreage,
      seller_bottom_price, double_close_offer, realtor_price_opinion,
      mortgage_on_property, hoa_poa_on_property,
      title_search, title_exam, survey, soil_test,
      title_company_name, title_company_phone, title_company_email,
      funder_name, realtor_name, drone_photo_link,
      reference_number, misc_deal_expenses,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      datetime('now'), datetime('now')
    )
  `).run(
    dealId, personId, dealName, person.lastName || '', dealType, appStage,
    fubFields.phone_number, fubFields.email, fubFields.county || '', fubFields.state || '',
    fubFields.purchase_price || 0, fubFields.expected_sales_price || 0,
    fubFields.contract_execution_date, fubFields.contract_end_date, fubFields.expected_close_date,
    fubFields.parcel_number, fubFields.parcel_zip, fubFields.parcel_link, fubFields.lot_acreage,
    fubFields.seller_bottom_price, fubFields.double_close_offer, fubFields.realtor_price_opinion,
    fubFields.mortgage_on_property, fubFields.hoa_poa_on_property,
    fubFields.title_search, fubFields.title_exam, fubFields.survey, fubFields.soil_test,
    fubFields.title_company_name, fubFields.title_company_phone, fubFields.title_company_email,
    fubFields.funder_name, fubFields.realtor_name, fubFields.drone_photo_link,
    fubFields.reference_number, fubFields.misc_deal_expenses
  );

  // Log deal creation
  db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
    dealId, 'deal_created',
    JSON.stringify({ deal_name: dealName, stage: appStage, source: 'fub_sync', fub_person_id: personId })
  );

  // Seed tasks up to the current stage
  const seededTasks = seedTasksUpToStage(db, dealId, dealType, appStage);
  console.log(`[FubPersonSync] New deal "${dealName}" (person ${personId}): stage=${appStage}, type=${dealType}, seeded ${seededTasks.length} tasks`);

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
