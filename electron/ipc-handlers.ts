import { ipcMain, app, BrowserWindow } from 'electron';
import { getDb, getDataDir } from './database.js';
import { seedTasksForStage, seedTasksUpToStage } from './rule-engine.js';
import { chunkTextParagraphAware } from './chunker.js';
import { triggerFubSync } from './fub-file-sync.js';
import { registerBrowserSyncHandlers } from './fub-browser-sync.js';
import {
  fetchWeeklyKPIs,
  fetchPreviousWeekKPIs,
  fetchBusinessMetrics,
  fetchPricingRecords,
  fetchHistoricalKPIs,
  aggregateWeeklyKPIs,
  calculateAvgSpeedToPricing,
  calculate6MonthAverages,
  getCurrentWeekTotals,
  getPreviousWeekTotals,
} from './kpi-airtable.js';
import { generateCEOBrief } from './kpi-ceo-brief.js';
import {
  calculateMetrics,
  calculateFourLevers,
  detectBottleneck,
  buildTeamScorecards,
  isTeamWinning,
  analyzeWeekOverWeek,
} from '../lib/kpi/calculations.js';
import { calculateScaleProgress } from '../lib/kpi/scale-calculations.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { semanticSearch, embedChunksForDeal, backfillAllEmbeddings } from './embeddings.js';

// Ensure .env is loaded (backup in case main.ts load timing is off)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function generateUUID(): string {
  return crypto.randomUUID();
}

function parseJsonField(value: any): any {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function serializeJsonField(value: any): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? []);
}

/**
 * Map local deal field changes to FUB API field names for pushing.
 * Only includes fields that actually changed (comparing to currentDeal).
 * Stage is handled separately by push_stage; skip it here.
 */
function localFieldsToFub(
  changedFields: Record<string, any>,
  currentDeal: Record<string, any>
): Record<string, any> {
  const fub: Record<string, any> = {};

  // Local column → FUB field name mapping
  const fieldMap: Record<string, string> = {
    deal_type: 'customDealType',
    purchase_price: 'customPurchasePrice',
    expected_sales_price: 'price',
    county: 'customParcelCounty',
    state: 'customParcelState',
    contract_execution_date: 'customContractExecutionDate',
    contract_end_date: 'customContractEndDate',
    expected_close_date: 'customClosingDate',
    parcel_number: 'customParcelNumber',
    parcel_zip: 'customParcelZip',
    parcel_link: 'customParcelLink',
    lot_acreage: 'customLotAcreage',
    seller_bottom_price: 'customSellerSBottomPrice',
    double_close_offer: 'customDoubleCloseOffer',
    realtor_price_opinion: 'customRealtorPriceOpinion',
    mortgage_on_property: 'customMortgageOnProperty',
    hoa_poa_on_property: 'customHOAPOAOnProperty',
    title_search: 'customTitleSearch',
    title_exam: 'customTitleExam',
    survey: 'customSurvey',
    soil_test: 'customSoilTest',
    title_company_name: 'customTitleCompanyName',
    title_company_phone: 'customTitleCompanyPhone',
    title_company_email: 'customTitleCompanyEmail',
    funder_name: 'customFunderName',
    realtor_name: 'customRealtorName',
    drone_photo_link: 'customDronePhotoLink',
    reference_number: 'customReferenceNumber',
    misc_deal_expenses: 'customMiscellaneousDealExpenses',
  };

  // Deal type needs reverse mapping
  const dealTypeMap: Record<string, string> = {
    'Standard Flip': 'Cash Flip',
    'Double Close': 'Double Close',
    'Subdivide': 'Subdivide',
  };

  for (const [localKey, fubKey] of Object.entries(fieldMap)) {
    if (!(localKey in changedFields)) continue;
    // Skip if value didn't actually change
    if (changedFields[localKey] === currentDeal[localKey]) continue;

    let val = changedFields[localKey];

    // Special: deal_type needs reverse mapping to FUB choice
    if (localKey === 'deal_type') {
      val = dealTypeMap[val] || val;
    }

    fub[fubKey] = val;
  }

  return fub;
}

export function registerIpcHandlers(): void {
  const db = getDb();

  // ===== DEALS =====

  ipcMain.handle('db:deals:getAll', (_event, options?: { orderBy?: string; ascending?: boolean }) => {
    const allowedCols = ['created_at', 'updated_at', 'property_address', 'stage', 'status', 'deal_name', 'purchase_price', 'sale_price'];
    const orderBy = allowedCols.includes(options?.orderBy || '') ? options!.orderBy! : 'created_at';
    const direction = options?.ascending ? 'ASC' : 'DESC';
    const rows = db.prepare(`SELECT * FROM deals ORDER BY ${orderBy} ${direction}`).all();
    return rows.map((row: any) => ({
      ...row,
      assigned_to: parseJsonField(row.assigned_to),
    }));
  });

  ipcMain.handle('db:deals:getById', (_event, id: string) => {
    const row = db.prepare('SELECT * FROM deals WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      ...row,
      assigned_to: parseJsonField(row.assigned_to),
    };
  });

  ipcMain.handle('db:deals:upsert', (_event, deals: any[]) => {
    const upsert = db.prepare(`
      INSERT INTO deals (
        id, airtable_id, deal_name, last_name, deal_type, stage, county, state, notes,
        purchase_price, expected_sales_price, contract_execution_date, expected_close_date,
        close_date, days_to_close, phone_number, assigned_to, due_diligence_link, updated_at
      ) VALUES (
        @id, @airtable_id, @deal_name, @last_name, @deal_type, @stage, @county, @state, @notes,
        @purchase_price, @expected_sales_price, @contract_execution_date, @expected_close_date,
        @close_date, @days_to_close, @phone_number, @assigned_to, @due_diligence_link, datetime('now')
      )
      ON CONFLICT(airtable_id) DO UPDATE SET
        deal_name=excluded.deal_name, last_name=excluded.last_name, deal_type=excluded.deal_type,
        stage=excluded.stage, county=excluded.county, state=excluded.state, notes=excluded.notes,
        purchase_price=excluded.purchase_price, expected_sales_price=excluded.expected_sales_price,
        contract_execution_date=excluded.contract_execution_date, expected_close_date=excluded.expected_close_date,
        close_date=excluded.close_date, days_to_close=excluded.days_to_close,
        phone_number=excluded.phone_number, assigned_to=excluded.assigned_to,
        due_diligence_link=excluded.due_diligence_link,
        updated_at=datetime('now')
    `);

    const insertMany = db.transaction((items: any[]) => {
      for (const deal of items) {
        // Normalize deal_type to match ruleset keys
        let dealType = deal.deal_type || 'Standard Flip';
        if (dealType === 'Standard flip') dealType = 'Standard Flip';
        if (dealType === 'Double close') dealType = 'Double Close';

        upsert.run({
          id: deal.id || generateUUID(),
          airtable_id: deal.airtable_id || null,
          deal_name: deal.deal_name || '',
          last_name: deal.last_name || '',
          deal_type: dealType,
          stage: deal.stage || '',
          county: deal.county || '',
          state: deal.state || '',
          notes: deal.notes || '',
          purchase_price: deal.purchase_price || 0,
          expected_sales_price: deal.expected_sales_price || 0,
          contract_execution_date: deal.contract_execution_date || null,
          expected_close_date: deal.expected_close_date || null,
          close_date: deal.close_date || null,
          days_to_close: deal.days_to_close || null,
          phone_number: deal.phone_number || null,
          assigned_to: serializeJsonField(deal.assigned_to),
          due_diligence_link: deal.due_diligence_link || '',
        });
      }
    });

    insertMany(deals);
    return { success: true };
  });

  ipcMain.handle('db:deals:insert', (_event, deal: any) => {
    const id = deal.id || generateUUID();

    // Normalize deal_type
    let dealType = deal.deal_type || 'Standard Flip';
    if (dealType === 'Standard flip') dealType = 'Standard Flip';
    if (dealType === 'Double close') dealType = 'Double Close';

    db.prepare(`
      INSERT INTO deals (
        id, airtable_id, deal_name, last_name, deal_type, stage, county, state, notes,
        purchase_price, expected_sales_price, contract_execution_date, expected_close_date,
        phone_number, email, assigned_to, due_diligence_link,
        contract_end_date, parcel_number, parcel_zip, parcel_link, lot_acreage,
        seller_bottom_price, double_close_offer, realtor_price_opinion,
        mortgage_on_property, hoa_poa_on_property,
        title_search, title_exam, survey, soil_test,
        title_company_name, title_company_phone, title_company_email,
        funder_name, realtor_name, drone_photo_link,
        reference_number, misc_deal_expenses
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, deal.airtable_id || null, deal.deal_name || '', deal.last_name || '',
      dealType, deal.stage || 'Purchase Agreement Signed', deal.county || '', deal.state || '',
      deal.notes || '', deal.purchase_price || 0, deal.expected_sales_price || 0,
      deal.contract_execution_date || null, deal.expected_close_date || null,
      deal.phone_number || null, deal.email || null, serializeJsonField(deal.assigned_to),
      deal.due_diligence_link || '',
      deal.contract_end_date || null, deal.parcel_number || null,
      deal.parcel_zip || null, deal.parcel_link || null, deal.lot_acreage || null,
      deal.seller_bottom_price || null, deal.double_close_offer || null,
      deal.realtor_price_opinion || null,
      deal.mortgage_on_property || null, deal.hoa_poa_on_property || null,
      deal.title_search || null, deal.title_exam || null,
      deal.survey || null, deal.soil_test || null,
      deal.title_company_name || null, deal.title_company_phone || null,
      deal.title_company_email || null,
      deal.funder_name || null, deal.realtor_name || null,
      deal.drone_photo_link || null,
      deal.reference_number || null, deal.misc_deal_expenses || null
    );

    // Log to audit
    db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
      id, 'deal_created', JSON.stringify({ deal_name: deal.deal_name, stage: deal.stage || 'Purchase Agreement Signed' })
    );

    // Seed initial tasks from rule engine
    const initialStage = deal.stage || 'Purchase Agreement Signed';
    const seededTasks = seedTasksForStage(db, id, dealType, initialStage);
    console.log(`[Deal Created] ${deal.deal_name}: seeded ${seededTasks.length} tasks for ${initialStage}`);

    return { id, ...deal, deal_type: dealType, seeded_tasks: seededTasks };
  });

  ipcMain.handle('db:deals:update', async (_event, id: string, fields: Record<string, any>) => {
    // Get current deal for stage change detection
    const currentDeal = db.prepare('SELECT * FROM deals WHERE id = ?').get(id) as any;

    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'assigned_to') {
        setClauses.push(`${key} = ?`);
        values.push(serializeJsonField(value));
      } else {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }
    setClauses.push("updated_at = datetime('now')");

    // Stage change detection
    if (fields.stage && currentDeal && fields.stage !== currentDeal.stage) {
      setClauses.push("previous_stage = ?");
      values.push(currentDeal.stage);

      // Log stage change to audit
      db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
        id, 'stage_change',
        JSON.stringify({ from: currentDeal.stage, to: fields.stage })
      );
    }

    values.push(id);
    db.prepare(`UPDATE deals SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    // If stage changed, seed tasks via rule engine + push to FUB via outbox
    let fubPush: { queued: boolean; success?: boolean; error?: string } = { queued: false };

    if (fields.stage && currentDeal && fields.stage !== currentDeal.stage) {
      console.log(`[Stage Change] ${currentDeal.deal_name}: ${currentDeal.stage} → ${fields.stage}`);
      const dealType = fields.deal_type || currentDeal.deal_type || 'Standard Flip';
      try {
        const seededTasks = seedTasksForStage(db, id, dealType, fields.stage);
        if (seededTasks.length > 0) {
          console.log(`[Stage Change] Seeded ${seededTasks.length} new tasks for stage ${fields.stage}`);
        }
      } catch (seedErr) {
        // Don't block the stage change response — tasks can be seeded later
        console.error(`[Stage Change] Task seeding failed for ${fields.stage}:`, seedErr);
      }

      // Push stage change to FUB via outbox (durable + immediate attempt)
      try {
        const { enqueueFubPush, attemptImmediatePush } = await import('./fub-outbox.js');

        // 1. Push person-level stage (existing behavior)
        const jobId = enqueueFubPush(db, id, 'push_stage', { stage: fields.stage });
        fubPush.queued = true;

        // 2. Push Deal Pipeline stage (new — skips Cancelled)
        if (fields.stage !== 'Cancelled') {
          const dealPipelineJobId = enqueueFubPush(db, id, 'push_deal_stage', { stage: fields.stage });
          // Fire-and-forget for deal pipeline (person stage push gives UI feedback)
          attemptImmediatePush(dealPipelineJobId).catch(err => {
            console.warn('[Stage Change] FUB Deal Pipeline push failed, will retry:', err);
          });
        }

        // Attempt immediate push with 5s timeout (person stage)
        const pushResult = await Promise.race([
          attemptImmediatePush(jobId),
          new Promise<{ success: false; error: string }>(resolve =>
            setTimeout(() => resolve({ success: false, error: 'timeout' }), 5000)
          ),
        ]);
        fubPush.success = pushResult.success;
        if (!pushResult.success) fubPush.error = pushResult.error;
      } catch (err) {
        fubPush.error = err instanceof Error ? err.message : String(err);
        console.warn('[Stage Change] FUB outbox error:', fubPush.error);
      }
    }

    // Push field changes to FUB (for deals linked to FUB persons)
    if (currentDeal?.fub_person_id) {
      // Build FUB field payload from changed local fields
      const fubFieldPayload = localFieldsToFub(fields, currentDeal);
      if (Object.keys(fubFieldPayload).length > 0) {
        try {
          const { enqueueFubPush, attemptImmediatePush } = await import('./fub-outbox.js');
          const jobId = enqueueFubPush(db, id, 'push_fields', {
            fubFields: fubFieldPayload,
            localFields: fields, // Track which local fields triggered this push
          });

          // Attempt immediate push (fire-and-forget for field syncs)
          attemptImmediatePush(jobId).catch(err => {
            console.warn('[Field Sync] Immediate push failed, will retry:', err);
          });
        } catch (err) {
          console.warn('[Field Sync] FUB outbox error:', err);
        }
      }
    }

    // Invalidate AI summary on stage change (will auto-regenerate on next view)
    if (fields.stage && currentDeal && fields.stage !== currentDeal.stage) {
      try { db.prepare('DELETE FROM deal_summaries WHERE deal_id = ?').run(id); } catch { /* table may not exist yet */ }
    }

    return { success: true, fubPush };
  });

  // Check for incomplete tasks before stage change
  ipcMain.handle('db:deals:checkStageChange', (_event, dealId: string, newStage: string) => {
    const currentDeal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId) as any;
    if (!currentDeal) return { canProceed: false, error: 'Deal not found' };

    if (currentDeal.stage === newStage) return { canProceed: true, incompleteTasks: [] };

    // Check for incomplete tasks in current stage
    const incompleteTasks = db.prepare(
      "SELECT * FROM tasks WHERE deal_id = ? AND status IN ('To Do', 'In Progress') ORDER BY task_order ASC"
    ).all(dealId) as any[];

    return {
      canProceed: incompleteTasks.length === 0,
      incompleteTasks: incompleteTasks.map((t: any) => ({ id: t.id, title: t.title, status: t.status })),
      currentStage: currentDeal.stage,
      newStage,
    };
  });

  ipcMain.handle('db:deals:delete', (_event, id: string) => {
    db.prepare('DELETE FROM deals WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('db:deals:purgeOld', () => {
    const count = (db.prepare('SELECT COUNT(*) as c FROM deals WHERE fub_person_id IS NULL').get() as any).c;
    db.prepare('DELETE FROM deals WHERE fub_person_id IS NULL').run();
    // Clean orphaned sync records
    db.prepare('DELETE FROM fub_file_sync WHERE deal_id NOT IN (SELECT id FROM deals)').run();
    db.prepare('DELETE FROM fub_person_sync WHERE deal_id NOT IN (SELECT id FROM deals)').run();
    console.log(`[PurgeOld] Deleted ${count} old deals (no fub_person_id)`);
    return { purged: count };
  });

  // ===== TASKS =====

  ipcMain.handle('db:tasks:getAll', (_event, options?: { orderBy?: string; ascending?: boolean }) => {
    const allowedCols = ['created_at', 'updated_at', 'due_date', 'title', 'status', 'priority', 'deal_id'];
    const orderBy = allowedCols.includes(options?.orderBy || '') ? options!.orderBy! : 'created_at';
    const direction = options?.ascending ? 'ASC' : 'DESC';
    return db.prepare(`SELECT * FROM tasks ORDER BY ${orderBy} ${direction}`).all();
  });

  ipcMain.handle('db:tasks:getByDealId', (_event, dealId: string) => {
    return db.prepare(
      "SELECT * FROM tasks WHERE deal_id = ? AND status != 'Skipped' ORDER BY task_order ASC, created_at ASC"
    ).all(dealId);
  });

  ipcMain.handle('db:tasks:insert', (_event, task: any) => {
    const id = generateUUID();
    db.prepare(`
      INSERT INTO tasks (id, deal_id, title, description, status, assignee, notes, task_order, airtable_id, source_rule_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, task.deal_id, task.title || task.task_name || '',
      task.description || '', task.status || 'To Do',
      task.assignee || null, task.notes || '',
      task.task_order || null, task.airtable_id || null,
      task.source_rule_key || null
    );

    // Log to audit
    db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
      task.deal_id, 'task_created', JSON.stringify({ task_id: id, title: task.title || task.task_name, source_rule_key: task.source_rule_key })
    );

    return { id, ...task };
  });

  ipcMain.handle('db:tasks:update', (_event, id: string, fields: Record<string, any>) => {
    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(fields)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
    setClauses.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  });

  ipcMain.handle('db:tasks:upsert', (_event, tasks: any[]) => {
    // Build airtable_id → deal.id lookup
    const dealLookup = new Map<string, string>();
    const allDeals = db.prepare('SELECT id, airtable_id FROM deals WHERE airtable_id IS NOT NULL').all() as any[];
    for (const d of allDeals) {
      dealLookup.set(d.airtable_id, d.id);
    }

    const upsert = db.prepare(`
      INSERT INTO tasks (id, deal_id, title, status, notes, assignee, task_order, airtable_id, updated_at)
      VALUES (@id, @deal_id, @title, @status, @notes, @assignee, @task_order, @airtable_id, datetime('now'))
      ON CONFLICT(airtable_id) DO UPDATE SET
        title=excluded.title, status=excluded.status, notes=excluded.notes,
        assignee=excluded.assignee, task_order=excluded.task_order,
        deal_id=excluded.deal_id, updated_at=datetime('now')
    `);

    const insertMany = db.transaction((items: any[]) => {
      for (const task of items) {
        const dealId = task.deal_id || (task.deal_airtable_id ? dealLookup.get(task.deal_airtable_id) : null);
        if (!dealId) {
          console.warn(`[tasks:upsert] Skipping task "${task.task_name || task.title}" — no deal_id`);
          continue;
        }

        // Ensure all values are SQLite-bindable (no objects/arrays)
        const safeStr = (v: any) => (v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));
        upsert.run({
          id: task.id || generateUUID(),
          deal_id: dealId,
          title: task.title || task.task_name || '',
          status: task.status || 'To Do',
          notes: safeStr(task.notes) || '',
          assignee: safeStr(task.assignee),
          task_order: typeof task.task_order === 'number' ? task.task_order : null,
          airtable_id: task.airtable_id || null,
        });
      }
    });

    insertMany(tasks);
    return { success: true };
  });

  // ===== TASK DETAIL HANDLERS =====

  ipcMain.handle('db:tasks:getById', (_event, id: string) => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!task) return null;
    const deal = db.prepare('SELECT id, deal_name, stage, county, state, deal_type FROM deals WHERE id = ?').get(task.deal_id) as any;
    if (deal) task.deal = deal;
    return task;
  });

  ipcMain.handle('db:tasks:getActivity', (_event, taskId: string) => {
    return db.prepare(
      "SELECT * FROM audit_log WHERE json_extract(details, '$.task_id') = ? ORDER BY created_at DESC LIMIT 50"
    ).all(taskId);
  });

  ipcMain.handle('db:tasks:logActivity', (_event, taskId: string, action: string, details?: string) => {
    const task = db.prepare('SELECT deal_id FROM tasks WHERE id = ?').get(taskId) as any;
    db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
      task?.deal_id || null, `task_${action}`,
      JSON.stringify({ task_id: taskId, details: details || null })
    );
    return { success: true };
  });

  ipcMain.handle('db:tasks:updateWithLog', (_event, id: string, fields: Record<string, any>) => {
    const oldTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;

    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(fields)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }

    // Auto-set completed_at
    if (fields.status === 'Done' && oldTask?.status !== 'Done') {
      setClauses.push("completed_at = datetime('now')");
    } else if (fields.status && fields.status !== 'Done') {
      setClauses.push("completed_at = NULL");
    }

    setClauses.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    // Log changes to audit_log
    for (const [key, value] of Object.entries(fields)) {
      if (oldTask && oldTask[key] !== value) {
        db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
          oldTask.deal_id,
          key === 'status' ? 'task_status_changed' : 'task_status_changed',
          JSON.stringify({ task_id: id, field: key, old: oldTask[key], new: value })
        );
      }
    }

    // If task was completed, post note to FUB (async, don't block)
    if (fields.status === 'Done' && oldTask?.status !== 'Done' && oldTask?.deal_id) {
      import('./fub-person-sync.js').then(({ postTaskNoteToFub }) => {
        postTaskNoteToFub(oldTask.deal_id, id).catch(err =>
          console.warn('[Task Complete] Failed to post FUB note:', err)
        );
      }).catch(() => {});
    }

    return { success: true };
  });

  // ===== DAILY LEADS =====

  ipcMain.handle('db:leads:getAll', (_event, options?: { orderBy?: string; ascending?: boolean }) => {
    const allowedCols = ['score', 'created_at', 'county', 'state', 'acreage', 'asking_price', 'action_required', 'is_completed'];
    const orderBy = allowedCols.includes(options?.orderBy || '') ? options!.orderBy! : 'score';
    const direction = options?.ascending ? 'ASC' : 'DESC';
    const rows = db.prepare(`SELECT * FROM daily_leads ORDER BY ${orderBy} ${direction}`).all() as any[];
    return rows.map(r => ({
      ...r,
      action_required: !!r.action_required,
      is_completed: !!r.is_completed,
      motivation_factors: r.motivation_factors ? JSON.parse(r.motivation_factors) : null,
      negotiation_strategy: r.negotiation_strategy ? JSON.parse(r.negotiation_strategy) : null,
    }));
  });

  ipcMain.handle('db:leads:update', (_event, id: number, fields: Record<string, any>) => {
    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(fields)) {
      setClauses.push(`${key} = ?`);
      if (typeof value === 'boolean') {
        values.push(value ? 1 : 0);
      } else if (typeof value === 'object' && value !== null) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
    }
    values.push(id);

    db.prepare(`UPDATE daily_leads SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  });

  ipcMain.handle('leads:fetchAndAnalyze', async () => {
    const { analyzeAllLeads } = await import('./lead-analyzer.js');
    return analyzeAllLeads(db);
  });

  ipcMain.handle('leads:refreshAnalysis', async (_event, leadId: number) => {
    try {
      const { analyzeSingleLead } = await import('./lead-analyzer.js');
      const lead = await analyzeSingleLead(db, leadId);
      return { success: true, lead };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('leads:markContacted', (_event, leadId: number) => {
    const today = new Date().toISOString().split('T')[0];
    db.prepare('UPDATE daily_leads SET contacted_today = ?, updated_at = datetime(\'now\') WHERE id = ?').run(today, leadId);
    return { success: true };
  });

  ipcMain.handle('leads:unmarkContacted', (_event, leadId: number) => {
    db.prepare('UPDATE daily_leads SET contacted_today = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(leadId);
    return { success: true };
  });

  ipcMain.handle('leads:getStats', () => {
    const total = (db.prepare('SELECT COUNT(*) as count FROM daily_leads').get() as any).count;
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const newLeads48h = (db.prepare('SELECT COUNT(*) as count FROM daily_leads WHERE created_at >= ?').get(cutoff48h) as any).count;
    const today = new Date().toISOString().split('T')[0];
    const doneToday = (db.prepare('SELECT COUNT(*) as count FROM daily_leads WHERE contacted_today = ?').get(today) as any).count;
    const highDiscount = (db.prepare('SELECT COUNT(*) as count FROM daily_leads WHERE discount_likelihood >= 8').get() as any).count;
    return { total, newLeads48h, doneToday, highDiscount };
  });

  // ===== MARKET ANALYSIS =====

  ipcMain.handle('db:market:getAll', (_event, options?: { orderBy?: string; ascending?: boolean; limit?: number }) => {
    const allowedCols = ['absorption_rate', 'county', 'state', 'median_price', 'avg_dom', 'created_at', 'updated_at'];
    const orderBy = allowedCols.includes(options?.orderBy || '') ? options!.orderBy! : 'absorption_rate';
    const direction = options?.ascending ? 'ASC' : 'DESC';
    const limit = options?.limit || 100;
    return db.prepare(`SELECT * FROM market_analysis ORDER BY ${orderBy} ${direction} LIMIT ?`).all(limit);
  });

  // ===== FILES =====

  const FILE_STORAGE_DIR = path.join(getDataDir(), 'transaction-docs');

  ipcMain.handle('files:upload', (_event, dealId: string, categoryKey: string, fileName: string, buffer: ArrayBuffer) => {
    const fileBuffer = Buffer.from(buffer);

    // Compute sha256
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Check for duplicate
    const existing = db.prepare('SELECT id FROM files WHERE deal_id = ? AND sha256 = ?').get(dealId, sha256) as any;
    if (existing) {
      console.log(`[Files] Duplicate detected (sha256: ${sha256.slice(0, 12)}...), returning existing`);
      return db.prepare('SELECT * FROM files WHERE id = ?').get(existing.id);
    }

    // Save to disk
    const dir = path.join(FILE_STORAGE_DIR, dealId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}_${fileName}`);
    fs.writeFileSync(filePath, fileBuffer);

    // Insert into files table
    const fileId = generateUUID();
    db.prepare(`
      INSERT INTO files (id, deal_id, file_name, file_path, category, sha256, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(fileId, dealId, fileName, filePath, categoryKey, sha256, fileBuffer.length);

    // Log to audit
    db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
      dealId, 'file_uploaded', JSON.stringify({ file_name: fileName, category: categoryKey, sha256: sha256.slice(0, 12) })
    );

    return { id: fileId, deal_id: dealId, file_name: fileName, file_path: filePath, category: categoryKey, sha256, file_size: fileBuffer.length };
  });

  ipcMain.handle('files:list', (_event, dealId: string, category?: string) => {
    if (category) {
      return db.prepare('SELECT * FROM files WHERE deal_id = ? AND category = ? ORDER BY uploaded_at DESC').all(dealId, category);
    }
    return db.prepare('SELECT * FROM files WHERE deal_id = ? ORDER BY uploaded_at DESC').all(dealId);
  });

  ipcMain.handle('files:delete', (_event, fileId: string) => {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as any;
    if (file) {
      try {
        if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path);
      } catch (e) { console.warn('Could not delete file from disk:', e); }
      db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
    }
    return { success: true };
  });

  ipcMain.handle('files:getPath', (_event, relativePath: string) => {
    return path.join(FILE_STORAGE_DIR, relativePath);
  });

  // Read a PDF file as base64 for the inline viewer (file:// URLs don't work in pdf.js workers)
  ipcMain.handle('files:readPdf', (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { error: 'File not found', data: null };
      }
      const buffer = fs.readFileSync(filePath);
      // Return as base64 data URL that react-pdf can consume
      const base64 = buffer.toString('base64');
      return { data: `data:application/pdf;base64,${base64}`, error: null };
    } catch (e: any) {
      console.error('[files:readPdf] Error reading file:', e);
      return { error: e.message || 'Failed to read file', data: null };
    }
  });

  // ===== AUDIT LOG =====

  ipcMain.handle('audit:getByDeal', (_event, dealId: string, limit?: number) => {
    return db.prepare('SELECT * FROM audit_log WHERE deal_id = ? ORDER BY created_at DESC LIMIT ?').all(dealId, limit || 100);
  });

  ipcMain.handle('audit:log', (_event, dealId: string | null, eventType: string, details: any) => {
    db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
      dealId, eventType, typeof details === 'string' ? details : JSON.stringify(details)
    );
    return { success: true };
  });

  // ===== DEADLINES =====

  ipcMain.handle('deadlines:create', (_event, deadline: any) => {
    const id = deadline.id || generateUUID();

    // Generate default alert schedule if not provided
    const defaultSchedule = JSON.stringify([
      { offset_days: 14, fired: false },
      { offset_days: 7, fired: false },
      { offset_days: 3, fired: false },
      { offset_days: 1, fired: false },
      { offset_days: 0, fired: false },
    ]);

    db.prepare(`
      INSERT INTO deadlines (id, deal_id, label, due_date, alert_schedule, is_acknowledged)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(id, deadline.deal_id, deadline.label, deadline.due_date, deadline.alert_schedule || defaultSchedule);

    return { id, deal_id: deadline.deal_id, label: deadline.label, due_date: deadline.due_date };
  });

  ipcMain.handle('deadlines:update', (_event, id: string, fields: Record<string, any>) => {
    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'alert_schedule') {
        setClauses.push(`${key} = ?`);
        values.push(typeof value === 'string' ? value : JSON.stringify(value));
      } else {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }

    // If due_date changed, regenerate alert schedule
    if (fields.due_date && !fields.alert_schedule) {
      setClauses.push('alert_schedule = ?');
      values.push(JSON.stringify([
        { offset_days: 14, fired: false },
        { offset_days: 7, fired: false },
        { offset_days: 3, fired: false },
        { offset_days: 1, fired: false },
        { offset_days: 0, fired: false },
      ]));
    }

    values.push(id);
    db.prepare(`UPDATE deadlines SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  });

  ipcMain.handle('deadlines:delete', (_event, id: string) => {
    db.prepare('DELETE FROM deadlines WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('deadlines:getByDeal', (_event, dealId: string) => {
    const rows = db.prepare('SELECT * FROM deadlines WHERE deal_id = ? ORDER BY due_date ASC').all(dealId) as any[];
    return rows.map(row => ({
      ...row,
      alert_schedule: parseJsonField(row.alert_schedule),
      is_acknowledged: !!row.is_acknowledged,
    }));
  });

  ipcMain.handle('deadlines:getAll', () => {
    const rows = db.prepare("SELECT d.*, dl.deal_name FROM deadlines d LEFT JOIN deals dl ON d.deal_id = dl.id WHERE d.is_acknowledged = 0 ORDER BY d.due_date ASC").all() as any[];
    return rows.map(row => ({
      ...row,
      alert_schedule: parseJsonField(row.alert_schedule),
      is_acknowledged: !!row.is_acknowledged,
    }));
  });

  ipcMain.handle('deadlines:acknowledge', (_event, id: string) => {
    db.prepare('UPDATE deadlines SET is_acknowledged = 1 WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('deadlines:getUpcoming', (_event, daysAhead?: number) => {
    const days = daysAhead || 30;
    const rows = db.prepare(`
      SELECT d.*, dl.deal_name
      FROM deadlines d
      LEFT JOIN deals dl ON d.deal_id = dl.id
      WHERE d.is_acknowledged = 0
        AND d.due_date <= date('now', '+' || ? || ' days')
      ORDER BY d.due_date ASC
    `).all(days) as any[];
    return rows.map(row => ({
      ...row,
      alert_schedule: parseJsonField(row.alert_schedule),
      is_acknowledged: !!row.is_acknowledged,
    }));
  });

  // ===== SETTINGS =====

  ipcMain.handle('settings:get', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row?.value || null;
  });

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
    `).run(key, value);

    // Update process.env for immediate use
    const envKeyMap: Record<string, string> = {
      'anthropic_api_key': 'ANTHROPIC_API_KEY',
      'fub_api_key': 'FUB_API_KEY',
      'slack_webhook_url': 'SLACK_WEBHOOK_URL',
      'n8n_trigger_webhook': 'N8N_TRIGGER_WEBHOOK',
      'voyage_api_key': 'VOYAGE_API_KEY',
    };
    if (envKeyMap[key]) {
      process.env[envKeyMap[key]] = value;
    }

    return { success: true };
  });

  ipcMain.handle('settings:getAll', () => {
    const rows = db.prepare('SELECT key, updated_at FROM settings').all() as any[];
    return rows.map(r => ({ key: r.key, hasValue: true, updated_at: r.updated_at }));
  });

  ipcMain.handle('settings:testSlackWebhook', async () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'slack_webhook_url'").get() as any;
    const url = row?.value || process.env.SLACK_WEBHOOK_URL || null;
    if (!url) return { success: false, error: 'No Slack webhook URL configured' };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '\ud83d\udd14 Test notification from TC Dashboard — Slack integration is working!' }),
      });
      if (!res.ok) return { success: false, error: `Slack returned ${res.status}: ${res.statusText}` };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ===== FUB FILE SYNC =====

  ipcMain.handle('fub:getFileSyncStatus', (_event, dealId: string) => {
    const row = db.prepare('SELECT * FROM fub_file_sync WHERE deal_id = ?').get(dealId) as any;
    if (!row) return null;
    return {
      ...row,
      mismatched_files: row.mismatched_files ? JSON.parse(row.mismatched_files) : null,
    };
  });

  ipcMain.handle('fub:getAllFileSyncStatuses', () => {
    const rows = db.prepare('SELECT * FROM fub_file_sync ORDER BY updated_at DESC').all() as any[];
    return rows.map(row => ({
      ...row,
      mismatched_files: row.mismatched_files ? JSON.parse(row.mismatched_files) : null,
    }));
  });

  ipcMain.handle('fub:triggerFileSync', async (_event, dealId?: string) => {
    return triggerFubSync(dealId);
  });

  ipcMain.handle('fub:getDealsWithFubLinks', () => {
    const rows = db.prepare(
      "SELECT id, deal_name, fub_person_id FROM deals WHERE fub_person_id IS NOT NULL AND fub_person_id != ''"
    ).all();
    return rows;
  });

  // ===== FUB PERSON SYNC =====

  ipcMain.handle('fub:syncPeople', async () => {
    const { triggerFubPersonSync } = await import('./fub-person-sync.js');
    return triggerFubPersonSync();
  });

  ipcMain.handle('fub:pushStage', async (_event, dealId: string, stage: string) => {
    const { pushStageToFub } = await import('./fub-person-sync.js');
    const success = await pushStageToFub(dealId, stage as any);
    return { success };
  });

  ipcMain.handle('fub:postTaskNote', async (_event, dealId: string, taskId: string) => {
    const { postTaskNoteToFub } = await import('./fub-person-sync.js');
    const success = await postTaskNoteToFub(dealId, taskId);
    return { success };
  });

  ipcMain.handle('fub:getPersonSyncStatus', () => {
    const total = db.prepare('SELECT COUNT(*) as count FROM fub_person_sync').get() as any;
    const synced = db.prepare("SELECT COUNT(*) as count FROM fub_person_sync WHERE status = 'synced'").get() as any;
    const errored = db.prepare("SELECT COUNT(*) as count FROM fub_person_sync WHERE status = 'error'").get() as any;
    const lastSync = db.prepare("SELECT MAX(last_synced_at) as last FROM fub_person_sync").get() as any;
    return {
      total: total?.count || 0,
      synced: synced?.count || 0,
      errors: errored?.count || 0,
      lastSync: lastSync?.last || null,
    };
  });

  ipcMain.handle('fub:getPersonSyncRecords', () => {
    return db.prepare('SELECT * FROM fub_person_sync ORDER BY updated_at DESC').all();
  });

  // ===== FUB ACTIVITIES =====

  ipcMain.handle('fub:getActivities', (_event, dealId: string, activityType?: string) => {
    if (activityType) {
      return db.prepare(
        'SELECT * FROM fub_activities WHERE deal_id = ? AND activity_type = ? ORDER BY activity_date DESC'
      ).all(dealId, activityType);
    }
    return db.prepare(
      'SELECT * FROM fub_activities WHERE deal_id = ? ORDER BY activity_date DESC'
    ).all(dealId);
  });

  ipcMain.handle('fub:syncActivities', async (_event, dealId: string) => {
    const deal = db.prepare('SELECT fub_person_id FROM deals WHERE id = ?').get(dealId) as any;
    if (!deal?.fub_person_id) return { success: false, error: 'Deal has no FUB person link' };

    const { getFubConfig } = await import('./fub-client.js');
    const config = getFubConfig(db);
    if (!config) return { success: false, error: 'FUB not configured' };

    const personId = deal.fub_person_id;
    let synced = 0;

    try {
      // Fetch notes, calls, texts, emails in parallel
      const { fetchPersonNotes, fetchPersonCalls, fetchPersonTexts, fetchPersonEmails } = await import('./fub-client.js');
      const [notes, calls, texts, emails] = await Promise.all([
        fetchPersonNotes(config, personId).catch(() => []),
        fetchPersonCalls(config, personId).catch(() => []),
        fetchPersonTexts(config, personId).catch(() => []),
        fetchPersonEmails(config, personId).catch(() => []),
      ]);

      const upsert = db.prepare(`
        INSERT INTO fub_activities (deal_id, fub_person_id, fub_id, activity_type, direction, subject, body, from_number, to_number, duration, outcome, status, created_by, activity_date, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(fub_person_id, activity_type, fub_id) DO UPDATE SET
          body = excluded.body,
          status = excluded.status,
          outcome = excluded.outcome,
          raw_json = excluded.raw_json
      `);

      const insertAll = db.transaction(() => {
        // Notes
        for (const note of notes) {
          upsert.run(
            dealId, personId, note.id, 'note',
            null, // direction
            note.subject || null,
            note.body || null,
            null, null, // from/to number
            null, // duration
            null, // outcome
            null, // status
            note.createdBy || null,
            note.created || new Date().toISOString(),
            JSON.stringify(note)
          );
          synced++;
        }

        // Calls
        for (const call of calls) {
          upsert.run(
            dealId, personId, call.id, 'call',
            call.isIncoming ? 'inbound' : 'outbound',
            null, // subject
            call.note || null,
            call.fromNumber || null,
            call.toNumber || null,
            call.duration || null,
            call.outcome || null,
            null, // status
            call.userName || null,
            call.startedAt || call.created || new Date().toISOString(),
            JSON.stringify(call)
          );
          synced++;
        }

        // Texts
        for (const text of texts) {
          upsert.run(
            dealId, personId, text.id, 'text',
            text.isIncoming ? 'inbound' : 'outbound',
            null, // subject
            text.message || null,
            text.fromNumber || null,
            text.toNumber || null,
            null, // duration
            null, // outcome
            text.deliveryStatus || text.status || null,
            text.userName || null,
            text.sent || text.created || new Date().toISOString(),
            JSON.stringify(text)
          );
          synced++;
        }

        // Emails
        for (const email of emails) {
          upsert.run(
            dealId, personId, email.id, 'email',
            email.isIncoming ? 'inbound' : 'outbound',
            email.subject || null,
            email.body || null,
            null, null, // from/to number
            null, // duration
            null, // outcome
            null, // status
            null, // created_by
            email.created || new Date().toISOString(),
            JSON.stringify(email)
          );
          synced++;
        }
      });

      insertAll();
      console.log(`[FubActivities] Synced ${synced} activities for deal ${dealId} (${notes.length} notes, ${calls.length} calls, ${texts.length} texts, ${emails.length} emails)`);
      return { success: true, synced, notes: notes.length, calls: calls.length, texts: texts.length, emails: emails.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[FubActivities] Sync error for deal ${dealId}:`, msg);
      return { success: false, error: msg };
    }
  });

  // ===== AI (Claude / Anthropic) =====

  const getAnthropicClient = () => {
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'anthropic_api_key'").get() as any;
    const apiKey = setting?.value || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
    return new Anthropic({ apiKey });
  };

  ipcMain.handle('ai:ask', async (_event, query: string, dealId: string) => {
    let anthropic: Anthropic;
    try {
      anthropic = getAnthropicClient();
    } catch {
      return { answer: "AI is not configured. Please set ANTHROPIC_API_KEY in Settings." };
    }

    let context = '';
    let sources: Array<{ file_name: string; chunk_index: number }> = [];

    if (dealId) {
      // Try semantic search first (if Voyage AI key configured)
      const voyageKey = (db.prepare('SELECT value FROM settings WHERE key = ?').get('voyage_api_key') as any)?.value || '';
      let semanticResults: any[] | null = null;

      if (voyageKey) {
        semanticResults = await semanticSearch(db, dealId, query, voyageKey, 5);
      }

      if (semanticResults && semanticResults.length > 0) {
        // Semantic search succeeded
        context = semanticResults.map(d => {
          const source = d.file_name ? `[Source: ${d.file_name}, chunk ${d.chunk_index}]` : '';
          if (d.file_name) sources.push({ file_name: d.file_name, chunk_index: d.chunk_index });
          return `${source}\n${d.content}`;
        }).join('\n---\n');
      } else {
        // Fall back to keyword search
        const keywords = query.split(/\s+/).filter(w => w.length > 2).slice(0, 5);
        let docs: any[] = [];

        for (const keyword of keywords) {
          const found = db.prepare(
            `SELECT k.content, k.chunk_index, k.file_id, f.file_name
             FROM kb_chunks k
             LEFT JOIN files f ON k.file_id = f.id
             WHERE k.deal_id = ? AND k.content LIKE ?
             LIMIT 3`
          ).all(dealId, `%${keyword}%`) as any[];
          docs.push(...found);
        }

        const seen = new Set<string>();
        docs = docs.filter(d => {
          if (seen.has(d.content)) return false;
          seen.add(d.content);
          return true;
        }).slice(0, 5);

        if (docs.length > 0) {
          context = docs.map(d => {
            const source = d.file_name ? `[Source: ${d.file_name}, chunk ${d.chunk_index}]` : '';
            if (d.file_name) sources.push({ file_name: d.file_name, chunk_index: d.chunk_index });
            return `${source}\n${d.content}`;
          }).join('\n---\n');
        }

        if (!context) {
          const allDocs = db.prepare(
            `SELECT k.content, k.chunk_index, k.file_id, f.file_name
             FROM kb_chunks k
             LEFT JOIN files f ON k.file_id = f.id
             WHERE k.deal_id = ?
             LIMIT 10`
          ).all(dealId) as any[];
          if (allDocs.length > 0) {
            context = allDocs.map(d => {
              const source = d.file_name ? `[Source: ${d.file_name}, chunk ${d.chunk_index}]` : '';
              if (d.file_name) sources.push({ file_name: d.file_name, chunk_index: d.chunk_index });
              return `${source}\n${d.content}`;
            }).join('\n---\n');
          }
        }
      }

      // Add deal metadata and file summaries for cross-document context
      const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId) as any;
      const fileSummaries = db.prepare('SELECT file_name, summary, doc_type, doc_date FROM pdf_extractions WHERE deal_id = ?').all(dealId) as any[];

      let dealContext = '';
      if (deal) {
        dealContext = `\n\nDEAL OVERVIEW:\n- Name: ${deal.deal_name || 'N/A'}\n- Stage: ${deal.stage || 'N/A'}\n- Property: ${deal.property_address || 'N/A'}\n`;
      }
      if (fileSummaries.length > 0) {
        dealContext += '\nDOCUMENT SUMMARIES:\n';
        dealContext += fileSummaries.map(f =>
          `- ${f.file_name}${f.doc_type ? ` (${f.doc_type})` : ''}${f.doc_date ? ` [${f.doc_date}]` : ''}: ${(f.summary || '').slice(0, 200)}`
        ).join('\n');
      }

      if (dealContext) context = dealContext + '\n\nRELEVANT DOCUMENT EXCERPTS:\n' + context;
    }

    if (!context) {
      return { answer: "I couldn't find any relevant documents for this deal. Please ensure files are uploaded and analyzed.", sources: [] };
    }

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are an expert real estate transaction coordinator assistant.

${context}

Question: ${query}

Instructions:
- Answer the question based STRICTLY on the provided context.
- If the answer is not in the context, say "I don't see that information in the provided documents."
- Cite specific details (dates, amounts, clauses) from the text.
- When citing information, mention the source document name.
- Be professional and concise.`
        }],
      });

      const answer = message.content[0]?.type === 'text' ? message.content[0].text : 'Unable to generate response';

      db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
        dealId, 'ai_query', JSON.stringify({ query, answer_length: answer.length, semantic: !!sources.length })
      );

      return { answer, sources };
    } catch (e) {
      console.error('Claude API error:', e);
      return { answer: 'I encountered an error generating a response. Please try again.', sources: [] };
    }
  });

  // ===== PDF ANALYSIS =====

  ipcMain.handle('pdf:analyze', async (_event, dealId: string, filePath: string, fileName: string, category: string) => {
    let anthropic: Anthropic;
    try {
      anthropic = getAnthropicClient();
    } catch {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    let pdfText = '';
    let pageCount = 0;
    try {
      const pdfBuffer = fs.readFileSync(filePath);
      const pdfModule = await import('pdf-parse/lib/pdf-parse.js');
      const pdfParse = (pdfModule as any).default || pdfModule;
      const pdfData = await (pdfParse as any)(pdfBuffer);
      pdfText = pdfData.text;
      pageCount = pdfData.numpages;
    } catch (e) {
      console.error('PDF parse error:', e);
      throw new Error('Failed to extract text from PDF');
    }

    if (!pdfText.trim()) {
      throw new Error('PDF appears to be empty or image-only (no extractable text)');
    }

    // Chunk text using paragraph-aware chunker and store in kb_chunks
    const chunks = chunkTextParagraphAware(pdfText);
    const insertChunk = db.prepare(`
      INSERT OR REPLACE INTO kb_chunks (id, deal_id, file_id, content, chunk_index, token_count, embedding)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `);

    // Look up file_id if this file exists in the files table
    const fileRecord = db.prepare('SELECT id FROM files WHERE deal_id = ? AND file_path = ?').get(dealId, filePath) as any;
    const fileId = fileRecord?.id || null;

    const insertChunks = db.transaction((items: { id: string; content: string; index: number; tokenCount: number }[]) => {
      for (const item of items) {
        insertChunk.run(item.id, dealId, fileId, item.content, item.index, item.tokenCount);
      }
    });

    insertChunks(chunks.map(chunk => ({
      id: `${dealId}-${fileName}-${chunk.index}`,
      content: chunk.content,
      index: chunk.index,
      tokenCount: chunk.tokenCount,
    })));

    // Generate summary, key findings, and deadlines via Claude
    const truncatedText = pdfText.slice(0, 15000);
    let summary = '';
    let keyFindings: string[] = [];
    let extractedDeadlines: Array<{ label: string; due_date: string }> = [];
    let docType = '';
    let docDate = '';

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Analyze this real estate document and provide:

1. Document type classification
2. Document date (the primary date of the document)
3. A concise summary (2-3 paragraphs)
4. Key findings as a JSON array of strings
5. Important deadlines/dates as a JSON array

For document type, classify as exactly one of: Contract, Addendum, Amendment, Title Report, Survey, Deed, Closing Disclosure, Inspection Report, Appraisal, Insurance, HOA, Loan Estimate, Disclosure, Earnest Money, Tax Record, Plat Map, Environmental, Other

For document date, extract the primary effective date or execution date (ISO YYYY-MM-DD). If unclear, use the earliest date mentioned.

For deadlines, extract:
- Closing dates
- Contract expiration dates
- Inspection/contingency deadlines
- Option period end dates
- Due diligence deadlines
- Title commitment deadlines
- Financing contingency deadlines
- Any other time-sensitive obligations

Only include dates that appear to be in the future. Use ISO format YYYY-MM-DD.
If no deadlines are found, return an empty array.

Document text:
${truncatedText}

Respond in this exact format:
DOC_TYPE:
[One of the types listed above]

DOC_DATE:
[YYYY-MM-DD or "unknown"]

SUMMARY:
[Your summary here]

KEY_FINDINGS:
["finding 1", "finding 2", ...]

DEADLINES:
[{"label": "Closing Date", "due_date": "2026-03-15"}, ...]`
        }],
      });

      const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';

      const docTypeMatch = responseText.match(/DOC_TYPE:\s*(.*?)(?=\n|DOC_DATE:|$)/);
      docType = docTypeMatch?.[1]?.trim() || '';

      const docDateMatch = responseText.match(/DOC_DATE:\s*(.*?)(?=\n|SUMMARY:|$)/);
      const rawDocDate = docDateMatch?.[1]?.trim() || '';
      if (rawDocDate && rawDocDate !== 'unknown' && /^\d{4}-\d{2}-\d{2}$/.test(rawDocDate)) {
        docDate = rawDocDate;
      }

      const summaryMatch = responseText.match(/SUMMARY:\s*([\s\S]*?)(?=KEY_FINDINGS:|$)/);
      summary = summaryMatch?.[1]?.trim() || responseText;

      const findingsMatch = responseText.match(/KEY_FINDINGS:\s*(\[[\s\S]*?\])/);
      if (findingsMatch) {
        try { keyFindings = JSON.parse(findingsMatch[1]); } catch { /* ignore */ }
      }

      const deadlinesMatch = responseText.match(/DEADLINES:\s*(\[[\s\S]*?\])/);
      if (deadlinesMatch) {
        try { extractedDeadlines = JSON.parse(deadlinesMatch[1]); } catch { /* ignore */ }
        if (!Array.isArray(extractedDeadlines)) extractedDeadlines = [];
      }
    } catch (e) {
      console.error('Claude analysis error:', e);
      summary = 'Analysis generation failed. Text was extracted and stored for search.';
    }

    // Store in pdf_extractions
    db.prepare(`
      INSERT OR REPLACE INTO pdf_extractions (deal_id, file_name, file_path, category, extracted_text, summary, key_findings, page_count, doc_type, doc_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(dealId, fileName, filePath, category, pdfText, summary, JSON.stringify(keyFindings), pageCount, docType || null, docDate || null);

    // Auto-create/update deadlines from extracted dates (match by label so addendums update dates)
    let deadlinesCreated = 0;
    let deadlinesUpdated = 0;
    const defaultSchedule = JSON.stringify([
      { offset_days: 14, fired: false },
      { offset_days: 7, fired: false },
      { offset_days: 3, fired: false },
      { offset_days: 1, fired: false },
      { offset_days: 0, fired: false },
    ]);

    for (const dl of extractedDeadlines) {
      if (!dl.label || !dl.due_date || !/^\d{4}-\d{2}-\d{2}$/.test(dl.due_date)) continue;

      const existing = db.prepare(
        'SELECT id, due_date FROM deadlines WHERE deal_id = ? AND label = ?'
      ).get(dealId, dl.label) as any;

      if (existing) {
        if (existing.due_date !== dl.due_date) {
          // Addendum changed the date — update and reset alerts
          db.prepare('UPDATE deadlines SET due_date = ?, alert_schedule = ?, is_acknowledged = 0 WHERE id = ?')
            .run(dl.due_date, defaultSchedule, existing.id);
          db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
            dealId, 'deadline_updated_by_scan',
            JSON.stringify({ deadline_id: existing.id, label: dl.label, old_date: existing.due_date, new_date: dl.due_date, source_file: fileName })
          );
          deadlinesUpdated++;
        }
      } else {
        const deadlineId = generateUUID();
        db.prepare(
          'INSERT INTO deadlines (id, deal_id, label, due_date, alert_schedule, is_acknowledged) VALUES (?, ?, ?, ?, ?, 0)'
        ).run(deadlineId, dealId, dl.label, dl.due_date, defaultSchedule);
        db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
          dealId, 'deadline_auto_created',
          JSON.stringify({ deadline_id: deadlineId, label: dl.label, due_date: dl.due_date, source_file: fileName })
        );
        deadlinesCreated++;
      }
    }

    if (deadlinesCreated > 0 || deadlinesUpdated > 0) {
      console.log(`[PDF Analysis] "${fileName}": ${deadlinesCreated} deadline(s) created, ${deadlinesUpdated} updated`);
    }

    // Auto-generate embeddings if Voyage AI key is configured
    const voyageKey = (db.prepare('SELECT value FROM settings WHERE key = ?').get('voyage_api_key') as any)?.value || '';
    if (voyageKey) {
      embedChunksForDeal(db, dealId, voyageKey).catch(e =>
        console.error('[PDF Analysis] Embedding generation failed:', e)
      );
    }

    return { summary, keyFindings, pageCount, wordCount: pdfText.split(/\s+/).length, deadlines: extractedDeadlines, docType, docDate };
  });

  ipcMain.handle('pdf:getAnalysis', (_event, dealId: string, filePath: string) => {
    const row = db.prepare('SELECT * FROM pdf_extractions WHERE deal_id = ? AND file_path = ?').get(dealId, filePath) as any;
    if (row && row.key_findings) {
      row.key_findings = parseJsonField(row.key_findings);
    }
    return row;
  });

  ipcMain.handle('pdf:getAnalysesByDeal', (_event, dealId: string) => {
    const rows = db.prepare('SELECT * FROM pdf_extractions WHERE deal_id = ? ORDER BY analyzed_at DESC').all(dealId) as any[];
    return rows.map(row => {
      if (row.key_findings) row.key_findings = parseJsonField(row.key_findings);
      return row;
    });
  });

  // ===== DEADLINE CRAWLER =====

  /**
   * Core crawl function: reads ALL pdf_extractions for a deal, sends them
   * together to Claude with addendum-aware instructions, and upserts deadlines.
   */
  async function crawlDealDeadlinesCore(dealId: string): Promise<{
    deadlines: Array<{ label: string; due_date: string; source?: string }>;
    created: number;
    updated: number;
    docsScanned: number;
  }> {
    const extractions = db.prepare(
      'SELECT file_name, category, extracted_text FROM pdf_extractions WHERE deal_id = ? ORDER BY analyzed_at ASC'
    ).all(dealId) as Array<{ file_name: string; category: string; extracted_text: string }>;

    if (extractions.length === 0) {
      return { deadlines: [], created: 0, updated: 0, docsScanned: 0 };
    }

    // Build combined document text, labeled by file and ordered chronologically
    let combinedText = '';
    for (const ext of extractions) {
      const label = `\n--- [${ext.category?.toUpperCase() || 'DOCUMENT'}: ${ext.file_name}] ---`;
      const text = (ext.extracted_text || '').slice(0, 8000);
      combinedText += `${label}\n${text}\n`;
    }
    combinedText = combinedText.slice(0, 30000);

    let anthropic: Anthropic;
    try {
      anthropic = getAnthropicClient();
    } catch {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const today = new Date().toISOString().split('T')[0];

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are analyzing all documents for a single land transaction deal. Multiple documents may exist — purchase agreements, addendums, amendments, inspection reports, title commitments, etc.

CRITICAL: Addendums and amendments OVERRIDE earlier documents. If an addendum changes a closing date, use the AMENDED date, not the original. Always use the most recent/authoritative version of each deadline.

Extract ALL important deadlines that are still relevant. For each deadline, provide:
- label: Short descriptive name (e.g. "Closing Date", "Inspection Deadline", "Option Period Ends")
- due_date: ISO format YYYY-MM-DD
- source: Which document it comes from

Only include future dates (after today ${today}).
If an addendum supersedes an earlier date, only include the amended date.
If no deadlines are found, return an empty array.

Documents:
${combinedText}

Respond in this exact JSON format only, no other text:
[{"label": "Closing Date", "due_date": "2026-04-01", "source": "Addendum 1.pdf"}, ...]`,
      }],
    });

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '[]';
    let deadlines: Array<{ label: string; due_date: string; source?: string }> = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) deadlines = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(deadlines)) deadlines = [];
    } catch {
      deadlines = [];
    }

    // Upsert: match by label so addendums update the date rather than create duplicates
    let created = 0;
    let updated = 0;
    const defaultSchedule = JSON.stringify([
      { offset_days: 14, fired: false },
      { offset_days: 7, fired: false },
      { offset_days: 3, fired: false },
      { offset_days: 1, fired: false },
      { offset_days: 0, fired: false },
    ]);

    for (const dl of deadlines) {
      if (!dl.label || !dl.due_date || !/^\d{4}-\d{2}-\d{2}$/.test(dl.due_date)) continue;

      const existing = db.prepare(
        'SELECT id, due_date FROM deadlines WHERE deal_id = ? AND label = ?'
      ).get(dealId, dl.label) as any;

      if (existing) {
        if (existing.due_date !== dl.due_date) {
          db.prepare('UPDATE deadlines SET due_date = ?, alert_schedule = ?, is_acknowledged = 0 WHERE id = ?')
            .run(dl.due_date, defaultSchedule, existing.id);
          db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
            dealId, 'deadline_updated_by_scan',
            JSON.stringify({ deadline_id: existing.id, label: dl.label, old_date: existing.due_date, new_date: dl.due_date, source: dl.source })
          );
          updated++;
        }
      } else {
        const deadlineId = generateUUID();
        db.prepare(
          'INSERT INTO deadlines (id, deal_id, label, due_date, alert_schedule, is_acknowledged) VALUES (?, ?, ?, ?, ?, 0)'
        ).run(deadlineId, dealId, dl.label, dl.due_date, defaultSchedule);
        db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
          dealId, 'deadline_auto_created',
          JSON.stringify({ deadline_id: deadlineId, label: dl.label, due_date: dl.due_date, source: dl.source || 'document_scan' })
        );
        created++;
      }
    }

    if (created > 0 || updated > 0) {
      console.log(`[DeadlineCrawler] Deal ${dealId}: scanned ${extractions.length} docs → ${created} created, ${updated} updated`);
    }

    return { deadlines, created, updated, docsScanned: extractions.length };
  }

  // Crawl deadlines for a single deal
  ipcMain.handle('pdf:crawlDealDeadlines', async (_event, dealId: string) => {
    return crawlDealDeadlinesCore(dealId);
  });

  // Crawl deadlines for ALL deals that have PDF extractions
  ipcMain.handle('pdf:crawlAllDeadlines', async () => {
    const deals = db.prepare(
      'SELECT DISTINCT deal_id FROM pdf_extractions'
    ).all() as Array<{ deal_id: string }>;

    let totalCreated = 0;
    let totalUpdated = 0;
    let errors = 0;

    for (const { deal_id } of deals) {
      try {
        const result = await crawlDealDeadlinesCore(deal_id);
        totalCreated += result.created;
        totalUpdated += result.updated;
      } catch (e) {
        console.error(`[DeadlineCrawler] Failed for deal ${deal_id}:`, e);
        errors++;
      }
    }

    console.log(`[DeadlineCrawler] Bulk scan complete: ${deals.length} deals, ${totalCreated} created, ${totalUpdated} updated, ${errors} errors`);
    return { dealsScanned: deals.length, totalCreated, totalUpdated, errors };
  });

  // ===== AI DEAL ANALYZER =====

  ipcMain.handle('ai:analyzeDeal', async (_event, dealId: string) => {
    let anthropic: Anthropic;
    try {
      anthropic = getAnthropicClient();
    } catch {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId) as any;
    if (!deal) throw new Error('Deal not found');

    const tasks = db.prepare('SELECT * FROM tasks WHERE deal_id = ?').all(dealId) as any[];
    const pdfAnalyses = db.prepare('SELECT file_name, category, summary, key_findings FROM pdf_extractions WHERE deal_id = ?').all(dealId) as any[];

    let marketData: any = null;
    if (deal.county && deal.state) {
      marketData = db.prepare('SELECT * FROM market_analysis WHERE county = ? AND state = ? LIMIT 1').get(deal.county, deal.state);
    }

    const taskSummary = tasks.map(t => `- ${t.title}: ${t.status}`).join('\n') || 'No tasks tracked';
    const docSummary = pdfAnalyses.map(p => {
      const findings = parseJsonField(p.key_findings);
      return `**${p.file_name}** (${p.category}): ${p.summary}\nKey findings: ${Array.isArray(findings) ? findings.join(', ') : 'None'}`;
    }).join('\n\n') || 'No documents analyzed';

    const marketInfo = marketData
      ? `Absorption Rate: ${marketData.absorption_rate}, Active Listings: ${marketData.active_listings}, Sold (1yr): ${marketData.sold_1yr}`
      : 'No market data available';

    const prompt = `You are a senior real estate transaction coordinator. Analyze this deal comprehensively.

## Deal Information
- **Name:** ${deal.deal_name}
- **Type:** ${deal.deal_type}
- **Stage:** ${deal.stage}
- **Location:** ${deal.county}, ${deal.state}
- **Purchase Price:** $${deal.purchase_price}
- **Expected Sales Price:** $${deal.expected_sales_price}
- **Contract Date:** ${deal.contract_execution_date || 'Not set'}
- **Expected Close:** ${deal.expected_close_date || 'Not set'}

## Tasks
${taskSummary}

## Document Analysis
${docSummary}

## Market Data
${marketInfo}

Provide your analysis in JSON format:
{
  "overview": "...",
  "risk_score": <1-100>,
  "risk_factors": [...],
  "timeline_analysis": "...",
  "financial_analysis": "...",
  "task_status": "...",
  "document_review": "...",
  "market_context": "...",
  "recommendations": [...]
}`;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      let analysis: any = {};
      if (jsonMatch) {
        try { analysis = JSON.parse(jsonMatch[0]); } catch { analysis = { overview: responseText, risk_score: 50, recommendations: [] }; }
      } else {
        analysis = { overview: responseText, risk_score: 50, recommendations: [] };
      }

      // Cache (backward compat — check if old table exists)
      const dealAnalysisExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='deal_analysis'"
      ).get();

      if (dealAnalysisExists) {
        db.prepare(`
          INSERT OR REPLACE INTO deal_analysis (deal_id, airtable_id, analysis, risk_score, recommendations, analyzed_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(dealId, deal.airtable_id, JSON.stringify(analysis), analysis.risk_score || 50, JSON.stringify(analysis.recommendations || []));
      }

      return analysis;
    } catch (e) {
      console.error('Deal analysis error:', e);
      throw new Error('Failed to analyze deal');
    }
  });

  ipcMain.handle('ai:getDealAnalysis', (_event, dealId: string) => {
    const dealAnalysisExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='deal_analysis'"
    ).get();

    if (dealAnalysisExists) {
      const row = db.prepare('SELECT * FROM deal_analysis WHERE deal_id = ?').get(dealId) as any;
      if (row) {
        row.analysis = parseJsonField(row.analysis);
        row.recommendations = parseJsonField(row.recommendations);
        return row;
      }
    }
    return null;
  });
  // ── KPI Dashboard handlers ──────────────────────────────────────────
  ipcMain.handle('kpi:getDashboardData', async () => {
    try {
      const currentWeekKPIs = await fetchWeeklyKPIs();
      const currentWeekEnding = currentWeekKPIs[0]?.weekEnding || '';
      const previousWeekKPIs = await fetchPreviousWeekKPIs(currentWeekEnding);

      const [pricingRecords, historicalData] = await Promise.all([
        fetchPricingRecords(),
        fetchHistoricalKPIs(6),
      ]);

      const businessMetrics = await fetchBusinessMetrics(currentWeekEnding);
      const currentWeek = aggregateWeeklyKPIs(currentWeekKPIs, getCurrentWeekTotals());
      const previousWeek = previousWeekKPIs.length > 0
        ? aggregateWeeklyKPIs(previousWeekKPIs, getPreviousWeekTotals())
        : null;

      const sixMonthAverages = calculate6MonthAverages(historicalData);
      const avgSpeedToPricing = calculateAvgSpeedToPricing(pricingRecords);
      const aaronOffers = currentWeek.byTeamMember.aaron?.offersSent || 0;

      const calculatedMetrics = calculateMetrics(
        currentWeek,
        businessMetrics,
        avgSpeedToPricing,
        aaronOffers
      );

      const fourLevers = calculateFourLevers(calculatedMetrics, currentWeek);
      const bottleneck = detectBottleneck(fourLevers);
      const teamScorecards = buildTeamScorecards(currentWeek, calculatedMetrics);
      const winning = isTeamWinning(currentWeek);
      const scaleProgress = calculateScaleProgress(currentWeek, businessMetrics);
      const wowAnalysis = analyzeWeekOverWeek(currentWeek, previousWeek);

      return {
        currentWeek,
        previousWeek,
        businessMetrics,
        calculatedMetrics,
        fourLevers,
        bottleneck,
        ceoBrief: null,
        scaleProgress,
        teamScorecards,
        wowAnalysis,
        isWinning: winning,
        isLoading: false,
        error: null,
        sixMonthAverages,
      };
    } catch (error: any) {
      console.error('[KPI] Error fetching dashboard data:', error);
      return {
        currentWeek: null,
        previousWeek: null,
        businessMetrics: null,
        calculatedMetrics: null,
        fourLevers: null,
        bottleneck: null,
        ceoBrief: null,
        scaleProgress: null,
        teamScorecards: [],
        wowAnalysis: null,
        isWinning: false,
        isLoading: false,
        error: error?.message || 'Failed to fetch KPI data',
        sixMonthAverages: null,
      };
    }
  });

  ipcMain.handle('kpi:getCeoBrief', async (_event, dashboardState: any) => {
    try {
      const setting = db.prepare("SELECT value FROM settings WHERE key = 'anthropic_api_key'").get() as any;
      const apiKey = setting?.value || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured. Set it in Settings.');
      return await generateCEOBrief(dashboardState, apiKey);
    } catch (error: any) {
      console.error('[KPI] Error generating CEO brief:', error);
      throw new Error(error?.message || 'Failed to generate CEO brief');
    }
  });

  // ===== CFO INSIGHTS =====

  ipcMain.handle('cfo:getInsights', async (_event, data: any) => {
    try {
      const { generateCFOInsights } = await import('./cfo-insights.js');
      const setting = db.prepare("SELECT value FROM settings WHERE key = 'anthropic_api_key'").get() as any;
      const apiKey = setting?.value || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured. Set it in Settings.');
      return await generateCFOInsights(data, apiKey);
    } catch (error: any) {
      console.error('[CFO] Error generating insights:', error);
      throw new Error(error?.message || 'Failed to generate CFO insights');
    }
  });

  // ===== MERCURY BANK =====

  ipcMain.handle('mercury:getAccounts', () => {
    const { getAccounts } = require('./mercury-sync.js');
    return getAccounts(db);
  });

  ipcMain.handle('mercury:getTransactions', (_event: any, opts: any) => {
    const { getTransactions } = require('./mercury-sync.js');
    return getTransactions(db, opts);
  });

  ipcMain.handle('mercury:getSummary', () => {
    const { getSummary } = require('./mercury-sync.js');
    return getSummary(db);
  });

  ipcMain.handle('mercury:getMonthlySpend', (_event: any, months?: number) => {
    const { getMonthlySpend } = require('./mercury-sync.js');
    return getMonthlySpend(db, months);
  });

  ipcMain.handle('mercury:getCategoryBreakdown', (_event: any, days?: number) => {
    const { getCategoryBreakdown } = require('./mercury-sync.js');
    return getCategoryBreakdown(db, days);
  });

  ipcMain.handle('mercury:getMonthlyCashflow', () => {
    const { getMonthlySpend } = require('./mercury-sync.js');
    const months = getMonthlySpend(db, 12);
    // Enrich with running balance estimate
    let runningBalance = 0;
    return months.map((m: any, i: number) => {
      const net = (m.income || 0) - (m.expenses || 0);
      runningBalance += net;
      return { ...m, net, runningBalance };
    });
  });

  ipcMain.handle('mercury:syncNow', async () => {
    const { syncNow } = await import('./mercury-sync.js');
    return syncNow();
  });

  ipcMain.handle('mercury:getActiveDealPipeline', async () => {
    const apiKey = process.env.FUB_API_KEY?.trim();
    if (!apiKey) return { active: [], closed: [] };

    const auth = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
    const allDeals: any[] = [];

    try {
      // Fetch all deals (active + closed) in one paginated sweep
      let hasMore = true;
      let nextUrl = 'https://api.followupboss.com/v1/deals?limit=100';

      while (hasMore) {
        const res = await fetch(nextUrl, { headers: { Authorization: auth } });
        if (!res.ok) break;
        const data = await res.json();
        for (const d of data.deals || []) {
          allDeals.push({
            id: d.id,
            name: d.name || '',
            stage: d.stageName || '',
            status: d.status || '',
            buy_price: d.price || 0,
            profit: d.commissionValue || 0,
            close_date: d.projectedCloseDate || null,
            exit_strategy: d.customExitStrategy || '',
            people: (d.people || []).map((p: any) => p.name).join(', '),
          });
        }
        if (data._metadata?.nextLink) {
          nextUrl = data._metadata.nextLink;
        } else {
          hasMore = false;
        }
      }
    } catch (err) {
      console.error('[CFO] Failed to fetch FUB deals:', err);
    }

    const stageOrder: Record<string, number> = {
      'Pending Sale': 1, 'Listed': 2, 'Purchase Closed': 3,
      'Purchase Pending': 4, 'Hold': 5, 'Purchase Contract': 6,
    };

    const active = allDeals
      .filter(d => d.stage !== 'Sale Closed' && d.status !== 'Lost')
      .sort((a, b) => (stageOrder[a.stage] || 99) - (stageOrder[b.stage] || 99));

    const closed = allDeals
      .filter(d => d.stage === 'Sale Closed')
      .sort((a, b) => (b.close_date || '').localeCompare(a.close_date || ''));

    return { active, closed };
  });

  // ===== TASK REMINDERS =====

  ipcMain.handle('reminders:create', (_event, taskId: string, remindAt: string) => {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const id = crypto.randomUUID();
    db.prepare('INSERT INTO task_reminders (id, task_id, remind_at) VALUES (?, ?, ?)').run(id, taskId, remindAt);

    db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
      null, 'reminder_created',
      JSON.stringify({ reminder_id: id, task_id: taskId, remind_at: remindAt })
    );

    console.log(`[Reminders] Created reminder ${id} for task ${taskId} at ${remindAt}`);
    return { id, task_id: taskId, remind_at: remindAt, status: 'pending' };
  });

  ipcMain.handle('reminders:getByTask', (_event, taskId: string) => {
    return db.prepare('SELECT * FROM task_reminders WHERE task_id = ? ORDER BY remind_at ASC').all(taskId);
  });

  ipcMain.handle('reminders:delete', (_event, id: string) => {
    db.prepare('DELETE FROM task_reminders WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('reminders:getPending', () => {
    return db.prepare(`
      SELECT r.*, t.title, t.deal_id, d.deal_name
      FROM task_reminders r
      JOIN tasks t ON r.task_id = t.id
      LEFT JOIN deals d ON t.deal_id = d.id
      WHERE r.status = 'pending'
      ORDER BY r.remind_at ASC
    `).all();
  });

  // ===== AI DIALER (Local SQLite) =====

  ipcMain.handle('dialer:getCallQueue', async (_event, limit?: number, listIds?: string[]) => {
    const { getCallQueue } = await import('./dialer-queries.js');
    return getCallQueue(db, limit, listIds);
  });

  // Keep legacy alias for any UI code still using the old channel name
  ipcMain.handle('dialer:getLocalCallQueue', async (_event, limit?: number, listIds?: string[]) => {
    const { getCallQueue } = await import('./dialer-queries.js');
    return getCallQueue(db, limit, listIds);
  });

  ipcMain.handle('dialer:getLeadsByList', async (_event, listIds: string[], limit?: number) => {
    const { getLeadsByList } = await import('./dialer-queries.js');
    return getLeadsByList(db, listIds, limit);
  });

  ipcMain.handle('dialer:getLists', async () => {
    const { getDialerLists } = await import('./dialer-queries.js');
    return getDialerLists(db);
  });

  ipcMain.handle('dialer:getCallHistory', async (_event, limit?: number, filters?: any) => {
    const { getCallHistory } = await import('./dialer-queries.js');
    return getCallHistory(db, limit, filters);
  });

  ipcMain.handle('dialer:getLocalCallHistory', async (_event, limit?: number, filters?: any) => {
    const { getCallHistory } = await import('./dialer-queries.js');
    return getCallHistory(db, limit, filters);
  });

  ipcMain.handle('dialer:getCallsForLead', async (_event, phoneNormalized: string) => {
    const { getCallsForLead } = await import('./dialer-queries.js');
    return getCallsForLead(db, phoneNormalized);
  });

  ipcMain.handle('dialer:getLeadById', async (_event, id: string) => {
    const { getLeadById } = await import('./dialer-queries.js');
    return getLeadById(db, id);
  });

  ipcMain.handle('dialer:getLeadMemory', async (_event, phoneNormalized: string) => {
    const { getLeadMemory } = await import('./dialer-queries.js');
    return getLeadMemory(db, phoneNormalized);
  });

  ipcMain.handle('dialer:getDNCList', async () => {
    const { getDNCList } = await import('./dialer-queries.js');
    return getDNCList(db);
  });

  ipcMain.handle('dialer:getLocalDNCList', async () => {
    const { getDNCList } = await import('./dialer-queries.js');
    return getDNCList(db);
  });

  ipcMain.handle('dialer:getDNCStats', async () => {
    const { getDNCStats } = await import('./dialer-queries.js');
    return getDNCStats(db);
  });

  ipcMain.handle('dialer:getLocalDNCStats', async () => {
    const { getDNCStats } = await import('./dialer-queries.js');
    return getDNCStats(db);
  });

  ipcMain.handle('dialer:addManualDNC', async (_event, phone: string, reason: string) => {
    const { addManualDNC } = await import('./dialer-queries.js');
    return addManualDNC(db, phone, reason);
  });

  ipcMain.handle('dialer:removeFromDNC', async (_event, phone: string) => {
    const { removeFromDNC } = await import('./dialer-queries.js');
    return removeFromDNC(db, phone);
  });

  ipcMain.handle('dialer:getDailyStats', async (_event, days?: number) => {
    const { getDailyStats } = await import('./dialer-queries.js');
    return getDailyStats(db, days);
  });

  ipcMain.handle('dialer:getHotLeads', async () => {
    const { getHotLeads } = await import('./dialer-queries.js');
    return getHotLeads(db);
  });

  ipcMain.handle('dialer:getCallbacksDue', async () => {
    const { getCallbacksDue } = await import('./dialer-queries.js');
    return getCallbacksDue(db);
  });

  ipcMain.handle('dialer:triggerCadence', async (_event) => {
    const { triggerCadence } = await import('./dialer-queries.js');
    return triggerCadence(db, (progress) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('dialer:batch-dial-progress', progress);
        }
      }
    });
  });

  ipcMain.handle('dialer:reviewCall', async (_event, callId: string) => {
    const { reviewCall } = await import('./call-reviewer.js');
    return reviewCall(db, callId);
  });

  ipcMain.handle('dialer:reviewRecentCalls', async (_event, limit?: number) => {
    const { reviewRecentCalls } = await import('./call-reviewer.js');
    return reviewRecentCalls(db, limit);
  });

  ipcMain.handle('dialer:getTodayCallCount', async () => {
    const { getTodayCallCount } = await import('./dialer-queries.js');
    return getTodayCallCount(db);
  });

  ipcMain.handle('dialer:uploadLeads', async (_event, leads: any[], batchId: string, listName?: string) => {
    const { uploadLeadsBatch } = await import('./dialer-queries.js');
    // Process all at once (local SQLite is fast, no need to chunk)
    const result = uploadLeadsBatch(db, leads, batchId, listName);

    _event.sender.send('dialer:upload-progress', {
      processed: leads.length,
      total: leads.length,
    });

    return result;
  });

  ipcMain.handle('dialer:getUploadBatches', async () => {
    const { getUploadBatches } = await import('./dialer-queries.js');
    return getUploadBatches(db);
  });

  ipcMain.handle('dialer:getUploadBatchLeads', async (_event, batchId: string) => {
    const { getUploadBatchLeads } = await import('./dialer-queries.js');
    return getUploadBatchLeads(db, batchId);
  });

  ipcMain.handle('dialer:deleteUploadBatch', async (_event, batchId: string) => {
    const { deleteUploadBatch } = await import('./dialer-queries.js');
    return deleteUploadBatch(db, batchId);
  });

  ipcMain.handle('dialer:callLead', async (_event, lead: any) => {
    const { callLead } = await import('./dialer-queries.js');
    return callLead(db, lead);
  });

  ipcMain.handle('dialer:syncFubDNC', async (_event) => {
    const { getFubConfig, fetchPeopleByStage } = await import('./fub-client.js');
    const { syncFubPeopleToDNC } = await import('./dialer-queries.js');

    const config = getFubConfig(db);
    if (!config) throw new Error('FUB API key not configured — set it in Settings.');

    const allPeople: Array<{
      id: number;
      phone_normalized: string;
      first_name?: string;
      last_name?: string;
      stage?: string;
    }> = [];

    const seenPhones = new Set<string>();
    let totalFetched = 0;

    const normalizePhone = (raw: string): string => {
      const digits = raw.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
      if (digits.length === 10) return digits;
      return '';
    };

    const fetchStage = async (stage: string) => {
      let offset = 0;
      for (let page = 0; page < 50; page++) {
        const result = await fetchPeopleByStage(config, stage, 100, offset);
        totalFetched += result.people.length;

        for (const person of result.people) {
          const phones = person.phones || [];
          for (const ph of phones) {
            const normalized = normalizePhone(ph.value || '');
            if (normalized && !seenPhones.has(normalized)) {
              seenPhones.add(normalized);
              allPeople.push({
                id: person.id,
                phone_normalized: normalized,
                first_name: person.firstName,
                last_name: person.lastName,
                stage: person.stage,
              });
            }
          }
        }

        _event.sender.send('dialer:fub-sync-progress', {
          stage,
          fetched: totalFetched,
          phones: allPeople.length,
        });

        if (!result.hasMore) break;
        offset += 100;
      }
    };

    const stages = [
      'Lead', 'New Lead', 'Prospect', 'Active Client',
      'Past Client', 'Closed', 'Archived', 'Dead',
      'Trash', 'Unqualified', 'Do Not Contact',
    ];

    for (const stage of stages) {
      try {
        await fetchStage(stage);
      } catch (err: any) {
        console.warn(`[syncFubDNC] Failed stage "${stage}":`, err.message);
      }
    }

    _event.sender.send('dialer:fub-sync-progress', {
      stage: 'Saving to DNC...',
      fetched: totalFetched,
      phones: allPeople.length,
    });

    const result = syncFubPeopleToDNC(db, allPeople);

    return {
      ...result,
      fub_people_fetched: totalFetched,
      unique_phones: allPeople.length,
    };
  });

  ipcMain.handle('dialer:syncFubExceptUnreachedToDNC', async (_event) => {
    const { getFubConfig, fetchAllPeople } = await import('./fub-client.js');
    const { syncFubPeopleToDNC } = await import('./dialer-queries.js');

    const config = getFubConfig(db);
    if (!config) throw new Error('FUB API key not configured — set it in Settings.');

    const allPeople: Array<{
      id: number;
      phone_normalized: string;
      first_name?: string;
      last_name?: string;
      stage?: string;
    }> = [];

    const seenPhones = new Set<string>();
    let totalFetched = 0;
    let skippedUnreached = 0;

    const normalizePhone = (raw: string): string => {
      const digits = raw.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
      if (digits.length === 10) return digits;
      return '';
    };

    // Fetch ALL people from FUB (paginated)
    let offset = 0;
    for (let page = 0; page < 200; page++) {
      const result = await fetchAllPeople(config, 100, offset);
      totalFetched += result.people.length;

      for (const person of result.people) {
        // Skip people in "Unreached" stage (case-insensitive)
        const stage = (person.stage || '').trim();
        if (stage.toLowerCase() === 'unreached') {
          skippedUnreached++;
          continue;
        }

        const phones = person.phones || [];
        for (const ph of phones) {
          const normalized = normalizePhone(ph.value || '');
          if (normalized && !seenPhones.has(normalized)) {
            seenPhones.add(normalized);
            allPeople.push({
              id: person.id,
              phone_normalized: normalized,
              first_name: person.firstName,
              last_name: person.lastName,
              stage: person.stage,
            });
          }
        }
      }

      _event.sender.send('dialer:fub-sync-progress', {
        stage: `All people (excl. Unreached)`,
        fetched: totalFetched,
        phones: allPeople.length,
      });

      if (!result.hasMore) break;
      offset += 100;
    }

    _event.sender.send('dialer:fub-sync-progress', {
      stage: 'Saving to DNC...',
      fetched: totalFetched,
      phones: allPeople.length,
    });

    const result = syncFubPeopleToDNC(db, allPeople);

    return {
      ...result,
      fub_people_fetched: totalFetched,
      unique_phones: allPeople.length,
      skippedUnreached,
    };
  });

  ipcMain.handle('dialer:getInboundCalls', async (_event, limit?: number) => {
    const { getInboundCalls } = await import('./dialer-queries.js');
    return getInboundCalls(db, limit);
  });

  ipcMain.handle('dialer:getLocalInboundCalls', async (_event, limit?: number) => {
    const { getInboundCalls } = await import('./dialer-queries.js');
    return getInboundCalls(db, limit);
  });

  ipcMain.handle('dialer:batchDial', async (_event, leadIds: string[], fromNumbers?: string | string[]) => {
    const { batchDialLeads } = await import('./dialer-queries.js');
    // Support both legacy single string and new array format
    const numbersArray = fromNumbers
      ? (Array.isArray(fromNumbers) ? fromNumbers : [fromNumbers])
      : [];
    return batchDialLeads(db, leadIds, 10, 30000, (progress) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('dialer:batch-dial-progress', progress);
        }
      }
    }, false, numbersArray);
  });

  ipcMain.handle('dialer:getNumberHealth', async (_event, fromNumbers: string[]) => {
    const { getNumberHealthStats } = await import('./dialer-queries.js');
    return getNumberHealthStats(db, fromNumbers);
  });

  ipcMain.handle('dialer:getNumberThrottle', async (_event, fromNumbers: string[]) => {
    const { getNumberThrottleStatus } = await import('./dialer-queries.js');
    return getNumberThrottleStatus(db, fromNumbers);
  });

  ipcMain.handle('dialer:setNumberLimits', async (_event, phone: string, dailyLimit?: number, hourlyLimit?: number) => {
    const { setNumberLimits } = await import('./dialer-queries.js');
    setNumberLimits(db, phone, dailyLimit, hourlyLimit);
    return { success: true };
  });

  ipcMain.handle('dialer:setNumberPaused', async (_event, phone: string, paused: boolean, reason?: string) => {
    const { setNumberPaused } = await import('./dialer-queries.js');
    setNumberPaused(db, phone, paused, reason);
    return { success: true };
  });

  ipcMain.handle('dialer:getCampaignCapacity', async (_event, fromNumbers: string[]) => {
    const { getCampaignCapacity } = await import('./dialer-queries.js');
    return getCampaignCapacity(db, fromNumbers);
  });

  ipcMain.handle('dialer:forceSync', async () => {
    const { fullSync } = await import('./dialer-sync.js');
    await fullSync();
    return { success: true };
  });

  ipcMain.handle('dialer:getRetellPhoneNumbers', async () => {
    const { fetchRetellPhoneNumbers } = await import('./dialer-queries.js');
    return fetchRetellPhoneNumbers(db);
  });

  ipcMain.handle('dialer:forcePollRetell', async () => {
    const { pollRetellCalls } = await import('./retell-call-poller.js');
    return pollRetellCalls();
  });

  ipcMain.handle('dialer:backfillRetell', async (_event, daysBack: number) => {
    const { backfillRetellCalls } = await import('./retell-call-poller.js');
    return backfillRetellCalls(daysBack, (progress) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('dialer:backfill-progress', progress);
        }
      }
    });
  });

  ipcMain.handle('dialer:syncStatus', async () => {
    const { getSyncStatus } = await import('./dialer-sync.js');
    const syncStatus = getSyncStatus();

    let retellConfigured = false;
    try {
      const retellKey = db.prepare("SELECT value FROM settings WHERE key = 'retell_api_key'").get() as any;
      const retellAgent = db.prepare("SELECT value FROM settings WHERE key = 'retell_agent_id'").get() as any;
      retellConfigured = !!(retellKey?.value && retellAgent?.value);
    } catch { /* ignore */ }

    return {
      ...syncStatus,
      retellConfigured,
    };
  });

  // ── Call Guard audit log ──

  ipcMain.handle('dialer:getGuardLog', async (_event, limit?: number) => {
    return db.prepare(`
      SELECT * FROM dialer_call_guard_log
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit || 50);
  });

  // ── Campaign Pause/Resume ──

  ipcMain.handle('dialer:pauseBatchDial', async () => {
    const { pauseBatchDial } = await import('./dialer-queries.js');
    pauseBatchDial();
    return { success: true };
  });

  ipcMain.handle('dialer:resumeBatchDial', async () => {
    const { resumeBatchDial } = await import('./dialer-queries.js');
    resumeBatchDial();
    return { success: true };
  });

  ipcMain.handle('dialer:isBatchPaused', async () => {
    const { isBatchPaused } = await import('./dialer-queries.js');
    return isBatchPaused();
  });

  // ── Lead Actions ──

  ipcMain.handle('dialer:setLeadOutcome', async (_event, phoneNormalized: string, outcome: string, reason?: string) => {
    const { setLeadOutcome } = await import('./dialer-queries.js');
    setLeadOutcome(db, phoneNormalized, outcome, reason);
    return { success: true };
  });

  ipcMain.handle('dialer:clearLeadOutcome', async (_event, phoneNormalized: string) => {
    const { clearLeadOutcome } = await import('./dialer-queries.js');
    clearLeadOutcome(db, phoneNormalized);
    return { success: true };
  });

  ipcMain.handle('dialer:setLeadCallback', async (_event, phoneNormalized: string, callbackDatetime: string | null) => {
    const { setLeadCallback } = await import('./dialer-queries.js');
    setLeadCallback(db, phoneNormalized, callbackDatetime);
    return { success: true };
  });

  ipcMain.handle('dialer:addLeadNote', async (_event, phoneNormalized: string, note: string) => {
    const { addLeadNote } = await import('./dialer-queries.js');
    return addLeadNote(db, phoneNormalized, note);
  });

  ipcMain.handle('dialer:getLeadNotes', async (_event, phoneNormalized: string) => {
    const { getLeadNotes } = await import('./dialer-queries.js');
    return getLeadNotes(db, phoneNormalized);
  });

  ipcMain.handle('dialer:deleteLeadNote', async (_event, noteId: string) => {
    const { deleteLeadNote } = await import('./dialer-queries.js');
    deleteLeadNote(db, noteId);
    return { success: true };
  });

  // ── Lead Search ──

  ipcMain.handle('dialer:searchLeads', async (_event, query: string, limit?: number) => {
    const { searchLeads } = await import('./dialer-queries.js');
    return searchLeads(db, query, limit);
  });

  // ── Paginated Call History ──

  ipcMain.handle('dialer:getCallHistoryPaginated', async (_event, limit?: number, offset?: number, filters?: any) => {
    const { getCallHistoryPaginated } = await import('./dialer-queries.js');
    return getCallHistoryPaginated(db, limit, offset, filters);
  });

  // ── RAG: Transcript search + conversation memory ──

  ipcMain.handle('dialer:searchTranscripts', async (_event, query: string, options?: any) => {
    const { searchTranscripts } = await import('./dialer-memory.js');
    return searchTranscripts(db, query, undefined, options);
  });

  ipcMain.handle('dialer:getPreCallContext', async (_event, phoneNormalized: string) => {
    const { getPreCallContext } = await import('./dialer-memory.js');
    return getPreCallContext(db, phoneNormalized);
  });

  ipcMain.handle('dialer:backfillEmbeddings', async (_event) => {
    const { backfillTranscriptEmbeddings } = await import('./dialer-memory.js');
    const mainWindow = BrowserWindow.getAllWindows()[0];
    return backfillTranscriptEmbeddings(db, undefined, (progress) => {
      mainWindow?.webContents.send('dialer:embedding-progress', progress);
    });
  });

  // ===== DEAL SUMMARIES (AI-generated) =====

  ipcMain.handle('deal:generateSummary', async (_event, dealId: string) => {
    let anthropic: Anthropic;
    try {
      anthropic = getAnthropicClient();
    } catch {
      return { success: false, error: 'AI not configured' };
    }

    try {
      // Gather deal data
      const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId) as any;
      if (!deal) return { success: false, error: 'Deal not found' };

      // Top 3 deadlines
      const deadlines = db.prepare(
        `SELECT label, due_date FROM deadlines WHERE deal_id = ? ORDER BY due_date ASC LIMIT 3`
      ).all(dealId) as any[];

      // PDF summaries
      const pdfSummaries = db.prepare(
        `SELECT file_name, summary FROM pdf_extractions WHERE deal_id = ? AND summary IS NOT NULL LIMIT 5`
      ).all(dealId) as any[];

      const spread = (deal.expected_sales_price || 0) - (deal.purchase_price || 0);
      const margin = deal.expected_sales_price > 0
        ? Math.round((spread / deal.expected_sales_price) * 100)
        : 0;

      const prompt = `You are an expert real estate transaction coordinator. Generate a concise 2-3 sentence deal status summary.

Deal: ${deal.deal_name}
Stage: ${deal.stage}
Type: ${deal.deal_type || 'Standard Flip'}
County/State: ${[deal.county, deal.state].filter(Boolean).join(', ')}
Purchase Price: $${(deal.purchase_price || 0).toLocaleString()}
Expected Sales Price: $${(deal.expected_sales_price || 0).toLocaleString()}
Spread: $${spread.toLocaleString()} (${margin}% margin)
Contract Execution: ${deal.contract_execution_date || 'N/A'}
Expected Close: ${deal.expected_close_date || 'N/A'}
Title Company: ${deal.title_company_name || 'N/A'}

${deadlines.length > 0 ? `Upcoming Deadlines:\n${deadlines.map(d => `- ${d.label}: ${d.due_date}`).join('\n')}` : 'No deadlines set.'}

${pdfSummaries.length > 0 ? `Document Summaries:\n${pdfSummaries.map(p => `- ${p.file_name}: ${p.summary}`).join('\n')}` : ''}

Instructions:
- Line 1: Current status (stage, title company, closing date)
- Line 2: Key risk or next action needed (deadline urgency, missing docs)
- Line 3: Financial snapshot (spread, margin)
- Be extremely concise. No headers or labels.`;

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });

      const summary = message.content[0]?.type === 'text' ? message.content[0].text : '';
      if (!summary) return { success: false, error: 'Empty response' };

      // Upsert into deal_summaries
      db.prepare(`
        INSERT INTO deal_summaries (deal_id, summary, generated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(deal_id) DO UPDATE SET summary = excluded.summary, generated_at = excluded.generated_at
      `).run(dealId, summary);

      return { success: true, summary };
    } catch (e: any) {
      console.error('[DealSummary] Generation failed:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('deal:getSummary', (_event, dealId: string) => {
    return db.prepare('SELECT * FROM deal_summaries WHERE deal_id = ?').get(dealId) || null;
  });

  // ===== EMBEDDING BACKFILL =====

  ipcMain.handle('ai:backfillEmbeddings', async (_event) => {
    const voyageKey = (db.prepare('SELECT value FROM settings WHERE key = ?').get('voyage_api_key') as any)?.value || '';
    if (!voyageKey) {
      return { embedded: 0, errors: 0, total: 0, error: 'Voyage AI API key not configured. Set voyage_api_key in Settings.' };
    }

    const mainWindow = BrowserWindow.getAllWindows()[0];
    const result = await backfillAllEmbeddings(db, voyageKey, (progress) => {
      mainWindow?.webContents.send('ai:backfill-progress', progress);
    });

    return result;
  });

  // ===== DEAL NOTES =====

  ipcMain.handle('notes:create', async (_event, dealId: string, content: string, pushToFub: boolean) => {
    const result = db.prepare(
      `INSERT INTO deal_notes (deal_id, content, pushed_to_fub) VALUES (?, ?, ?)`
    ).run(dealId, content, pushToFub ? 0 : 0); // pushed_to_fub is set to 1 after FUB push succeeds

    const noteId = result.lastInsertRowid;

    // If push to FUB requested, enqueue post_note in fub_outbox
    if (pushToFub) {
      const deal = db.prepare('SELECT fub_person_id FROM deals WHERE id = ?').get(dealId) as any;
      if (deal?.fub_person_id) {
        try {
          db.prepare(`
            INSERT INTO fub_outbox (deal_id, action, payload, status)
            VALUES (?, 'post_note', ?, 'pending')
          `).run(dealId, JSON.stringify({
            fub_person_id: deal.fub_person_id,
            note: content,
            note_id: noteId,
          }));
        } catch (e) {
          console.error('[Notes] Failed to enqueue FUB push:', e);
        }
      }
    }

    // Audit log
    db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
      dealId, 'note_created', JSON.stringify({ note_id: noteId, pushed_to_fub: pushToFub })
    );

    return { success: true, id: noteId };
  });

  ipcMain.handle('notes:list', (_event, dealId: string) => {
    return db.prepare(
      `SELECT * FROM deal_notes WHERE deal_id = ? ORDER BY created_at DESC`
    ).all(dealId);
  });

  // ===== CHAT MESSAGE PERSISTENCE =====

  ipcMain.handle('chat:saveMessage', (_event, dealId: string, role: string, content: string, sources?: string) => {
    return db.prepare(
      `INSERT INTO deal_chat_messages (deal_id, role, content, sources) VALUES (?, ?, ?, ?)`
    ).run(dealId, role, content, sources || null);
  });

  ipcMain.handle('chat:getMessages', (_event, dealId: string) => {
    return db.prepare(
      `SELECT * FROM deal_chat_messages WHERE deal_id = ? ORDER BY created_at ASC`
    ).all(dealId);
  });

  // ===== FUB BROWSER SYNC =====
  registerBrowserSyncHandlers();
}

// Old chunkText removed — replaced by paragraph-aware chunker in electron/chunker.ts
