import { ipcMain, app } from 'electron';
import { getDb } from './database.js';
import { seedTasksForStage, seedTasksUpToStage } from './rule-engine.js';
import { chunkTextParagraphAware } from './chunker.js';
import { triggerFubSync } from './fub-file-sync.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

// Ensure .env is loaded (backup in case main.ts load timing is off)
const __ipc_filename = fileURLToPath(import.meta.url);
const __ipc_dirname = path.dirname(__ipc_filename);
dotenv.config({ path: path.join(__ipc_dirname, '..', '.env') });

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

export function registerIpcHandlers(): void {
  const db = getDb();

  // ===== DEALS =====

  ipcMain.handle('db:deals:getAll', (_event, options?: { orderBy?: string; ascending?: boolean }) => {
    const orderBy = options?.orderBy || 'created_at';
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
        phone_number, assigned_to, due_diligence_link
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, deal.airtable_id || null, deal.deal_name || '', deal.last_name || '',
      dealType, deal.stage || 'Offer accepted', deal.county || '', deal.state || '',
      deal.notes || '', deal.purchase_price || 0, deal.expected_sales_price || 0,
      deal.contract_execution_date || null, deal.expected_close_date || null,
      deal.phone_number || null, serializeJsonField(deal.assigned_to),
      deal.due_diligence_link || ''
    );

    // Log to audit
    db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
      id, 'deal_created', JSON.stringify({ deal_name: deal.deal_name, stage: deal.stage || 'Offer accepted' })
    );

    // Seed initial tasks from rule engine
    const initialStage = deal.stage || 'Offer accepted';
    const seededTasks = seedTasksForStage(db, id, dealType, initialStage);
    console.log(`[Deal Created] ${deal.deal_name}: seeded ${seededTasks.length} tasks for ${initialStage}`);

    return { id, ...deal, deal_type: dealType, seeded_tasks: seededTasks };
  });

  ipcMain.handle('db:deals:update', (_event, id: string, fields: Record<string, any>) => {
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

    // If stage changed, seed tasks via rule engine
    if (fields.stage && currentDeal && fields.stage !== currentDeal.stage) {
      console.log(`[Stage Change] ${currentDeal.deal_name}: ${currentDeal.stage} → ${fields.stage}`);
      const dealType = fields.deal_type || currentDeal.deal_type || 'Standard Flip';
      const seededTasks = seedTasksForStage(db, id, dealType, fields.stage);
      if (seededTasks.length > 0) {
        console.log(`[Stage Change] Seeded ${seededTasks.length} new tasks for stage ${fields.stage}`);
      }
    }

    return { success: true };
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

  ipcMain.handle('db:deals:deleteByAirtableIds', (_event, ids: string[]) => {
    if (ids.length === 0) return { success: true };
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM deals WHERE airtable_id IN (${placeholders})`).run(...ids);
    return { success: true };
  });

  ipcMain.handle('db:deals:getAirtableIds', () => {
    const rows = db.prepare("SELECT airtable_id FROM deals WHERE airtable_id IS NOT NULL").all() as any[];
    return rows.map(r => r.airtable_id);
  });

  // ===== TASKS =====

  ipcMain.handle('db:tasks:getAll', (_event, options?: { orderBy?: string; ascending?: boolean }) => {
    const orderBy = options?.orderBy || 'created_at';
    const direction = options?.ascending ? 'ASC' : 'DESC';
    return db.prepare(`SELECT * FROM tasks ORDER BY ${orderBy} ${direction}`).all();
  });

  ipcMain.handle('db:tasks:getByDealId', (_event, dealId: string) => {
    return db.prepare(
      "SELECT * FROM tasks WHERE deal_id = ? AND status != 'Skipped' ORDER BY task_order ASC, created_at ASC"
    ).all(dealId);
  });

  // Legacy: support lookup by airtable_id for backward compat during transition
  ipcMain.handle('db:tasks:getByDealAirtableId', (_event, dealAirtableId: string) => {
    const deal = db.prepare('SELECT id FROM deals WHERE airtable_id = ?').get(dealAirtableId) as any;
    if (!deal) return [];
    return db.prepare(
      "SELECT * FROM tasks WHERE deal_id = ? AND status != 'Skipped' ORDER BY task_order ASC, created_at ASC"
    ).all(deal.id);
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

        upsert.run({
          id: task.id || generateUUID(),
          deal_id: dealId,
          title: task.title || task.task_name || '',
          status: task.status || 'To Do',
          notes: task.notes || '',
          assignee: task.assignee || null,
          task_order: task.task_order || null,
          airtable_id: task.airtable_id || null,
        });
      }
    });

    insertMany(tasks);
    return { success: true };
  });

  ipcMain.handle('db:tasks:getAirtableIds', () => {
    const rows = db.prepare("SELECT airtable_id FROM tasks WHERE airtable_id IS NOT NULL AND airtable_id NOT LIKE 'temp-%'").all() as any[];
    return rows.map(r => r.airtable_id);
  });

  ipcMain.handle('db:tasks:deleteByAirtableIds', (_event, ids: string[]) => {
    if (ids.length === 0) return { success: true };
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM tasks WHERE airtable_id IN (${placeholders})`).run(...ids);
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

    return { success: true };
  });

  // ===== DAILY LEADS =====

  ipcMain.handle('db:leads:getAll', (_event, options?: { orderBy?: string; ascending?: boolean }) => {
    const orderBy = options?.orderBy || 'score';
    const direction = options?.ascending ? 'ASC' : 'DESC';
    const rows = db.prepare(`SELECT * FROM daily_leads ORDER BY ${orderBy} ${direction}`).all() as any[];
    return rows.map(r => ({
      ...r,
      action_required: !!r.action_required,
      is_completed: !!r.is_completed,
    }));
  });

  ipcMain.handle('db:leads:update', (_event, id: number, fields: Record<string, any>) => {
    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(fields)) {
      setClauses.push(`${key} = ?`);
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
    }
    values.push(id);

    db.prepare(`UPDATE daily_leads SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  });

  // ===== MARKET ANALYSIS =====

  ipcMain.handle('db:market:getAll', (_event, options?: { orderBy?: string; ascending?: boolean; limit?: number }) => {
    const orderBy = options?.orderBy || 'absorption_rate';
    const direction = options?.ascending ? 'ASC' : 'DESC';
    const limit = options?.limit || 100;
    return db.prepare(`SELECT * FROM market_analysis ORDER BY ${orderBy} ${direction} LIMIT ?`).all(limit);
  });

  // ===== FILES =====

  const FILE_STORAGE_DIR = path.join(app.getPath('userData'), 'transaction-docs');

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
      'airtable_api_key': 'AIRTABLE_PAT',
      'airtable_base_id': 'AIRTABLE_BASE_ID',
      'anthropic_api_key': 'ANTHROPIC_API_KEY',
      'fub_api_key': 'FUB_API_KEY',
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

  // ===== SYNC JOBS =====

  ipcMain.handle('sync:getQueueStatus', () => {
    const pending = db.prepare("SELECT COUNT(*) as count FROM sync_jobs WHERE status = 'pending'").get() as any;
    const failed = db.prepare("SELECT COUNT(*) as count FROM sync_jobs WHERE status = 'failed'").get() as any;
    const lastCompleted = db.prepare("SELECT completed_at FROM sync_jobs WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1").get() as any;
    return {
      pending: pending?.count || 0,
      failed: failed?.count || 0,
      lastSync: lastCompleted?.completed_at || null,
    };
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

  // ===== AIRTABLE =====

  const getAirtableConfig = () => {
    // Check settings table first, then env vars
    const patSetting = db.prepare("SELECT value FROM settings WHERE key = 'airtable_api_key'").get() as any;
    const baseSetting = db.prepare("SELECT value FROM settings WHERE key = 'airtable_base_id'").get() as any;

    const pat = patSetting?.value || process.env.AIRTABLE_PAT || process.env.VITE_AIRTABLE_PAT;
    const baseId = baseSetting?.value || process.env.AIRTABLE_BASE_ID || process.env.VITE_AIRTABLE_BASE_ID;
    if (!pat || !baseId) throw new Error('Missing Airtable configuration');
    return { pat, baseId };
  };

  ipcMain.handle('airtable:fetchDeals', async () => {
    const { pat, baseId } = getAirtableConfig();
    let allRecords: any[] = [];
    let offset = '';

    do {
      const url = `https://api.airtable.com/v0/${baseId}/Deals${offset ? `?offset=${offset}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
      if (!res.ok) throw new Error(`Airtable fetch failed: ${res.statusText}`);
      const data = await res.json();
      allRecords = [...allRecords, ...data.records];
      offset = data.offset || '';
    } while (offset);

    return allRecords;
  });

  ipcMain.handle('airtable:createRecord', async (_event, fields: Record<string, any>) => {
    const { pat, baseId } = getAirtableConfig();
    const url = `https://api.airtable.com/v0/${baseId}/Deals`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Airtable create failed: ${txt}`);
    }
    return await res.json();
  });

  ipcMain.handle('airtable:updateRecord', async (_event, recordId: string, fields: Record<string, any>) => {
    const { pat, baseId } = getAirtableConfig();
    const url = `https://api.airtable.com/v0/${baseId}/Deals/${recordId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Airtable update failed: ${txt}`);
    }
    return await res.json();
  });

  ipcMain.handle('airtable:deleteRecord', async (_event, recordId: string) => {
    const { pat, baseId } = getAirtableConfig();
    const url = `https://api.airtable.com/v0/${baseId}/Deals/${recordId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!res.ok) throw new Error(`Airtable delete failed: ${res.statusText}`);
    return await res.json();
  });

  ipcMain.handle('airtable:fetchTasks', async () => {
    const { pat, baseId } = getAirtableConfig();
    let allRecords: any[] = [];
    let offset = '';

    do {
      const url = `https://api.airtable.com/v0/${baseId}/Tasks${offset ? `?offset=${offset}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
      if (!res.ok) throw new Error(`Airtable tasks fetch failed: ${res.statusText}`);
      const data = await res.json();
      allRecords = [...allRecords, ...data.records];
      offset = data.offset || '';
    } while (offset);

    return allRecords;
  });

  ipcMain.handle('airtable:updateTask', async (_event, recordId: string, fields: Record<string, any>) => {
    const { pat, baseId } = getAirtableConfig();
    const url = `https://api.airtable.com/v0/${baseId}/Tasks/${recordId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      console.warn(`Airtable task update failed: ${res.statusText}`);
      return null;
    }
    return await res.json();
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
    if (dealId) {
      const keywords = query.split(/\s+/).filter(w => w.length > 2).slice(0, 5);
      let docs: any[] = [];

      // Search with keyword matching, include file source info
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
            return `${source}\n${d.content}`;
          }).join('\n---\n');
        }
      }
    }

    if (!context) {
      return { answer: "I couldn't find any relevant documents for this deal. Please ensure files are uploaded and analyzed." };
    }

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are an expert real estate transaction coordinator assistant.

Context from documents:
${context}

Question: ${query}

Instructions:
- Answer the question based STRICTLY on the provided context.
- If the answer is not in the context, say "I don't see that information in the provided documents."
- Cite specific details (dates, amounts, clauses) from the text.
- Be professional and concise.`
        }],
      });

      const answer = message.content[0]?.type === 'text' ? message.content[0].text : 'Unable to generate response';

      db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
        dealId, 'ai_query', JSON.stringify({ query, answer_length: answer.length })
      );

      return { answer };
    } catch (e) {
      console.error('Claude API error:', e);
      return { answer: 'I encountered an error generating a response. Please try again.' };
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

    // Generate summary via Claude
    const truncatedText = pdfText.slice(0, 15000);
    let summary = '';
    let keyFindings: string[] = [];

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Analyze this real estate document and provide:

1. A concise summary (2-3 paragraphs)
2. Key findings as a JSON array of strings

Document text:
${truncatedText}

Respond in this exact format:
SUMMARY:
[Your summary here]

KEY_FINDINGS:
["finding 1", "finding 2", ...]`
        }],
      });

      const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';

      const summaryMatch = responseText.match(/SUMMARY:\s*([\s\S]*?)(?=KEY_FINDINGS:|$)/);
      summary = summaryMatch?.[1]?.trim() || responseText;

      const findingsMatch = responseText.match(/KEY_FINDINGS:\s*(\[[\s\S]*?\])/);
      if (findingsMatch) {
        try { keyFindings = JSON.parse(findingsMatch[1]); } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('Claude analysis error:', e);
      summary = 'Analysis generation failed. Text was extracted and stored for search.';
    }

    // Store in pdf_extractions
    db.prepare(`
      INSERT OR REPLACE INTO pdf_extractions (deal_id, file_name, file_path, category, extracted_text, summary, key_findings, page_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(dealId, fileName, filePath, category, pdfText, summary, JSON.stringify(keyFindings), pageCount);

    return { summary, keyFindings, pageCount, wordCount: pdfText.split(/\s+/).length };
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
}

// Old chunkText removed — replaced by paragraph-aware chunker in electron/chunker.ts
