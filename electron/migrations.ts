import Database from 'better-sqlite3';
import crypto from 'crypto';

/**
 * Versioned schema migration system.
 * Each migration runs exactly once, tracked in `schema_version` table.
 */

interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

function generateUUID(): string {
  return crypto.randomUUID();
}

const migrations: Migration[] = [
  {
    version: 1,
    description: 'Baseline — mark existing schema as v1',
    up: (_db) => {
      // No-op: the old createTables() already ran. This just marks existing DBs as v1.
    },
  },
  {
    version: 2,
    description: 'Overhaul: deals, tasks, deadlines, files, audit_log, sync_jobs, settings',
    up: (db) => {
      // ── 1. Create new tables ──

      db.exec(`
        CREATE TABLE IF NOT EXISTS deals (
          id TEXT PRIMARY KEY,
          airtable_id TEXT UNIQUE,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          deal_name TEXT,
          last_name TEXT,
          deal_type TEXT DEFAULT 'Standard Flip',
          stage TEXT DEFAULT 'Purchase Agreement Signed',
          previous_stage TEXT,
          county TEXT,
          state TEXT,
          notes TEXT,
          purchase_price REAL DEFAULT 0,
          expected_sales_price REAL DEFAULT 0,
          contract_execution_date TEXT,
          expected_close_date TEXT,
          close_date TEXT,
          days_to_close TEXT,
          phone_number TEXT,
          assigned_to TEXT,
          due_diligence_link TEXT,
          fub_person_id TEXT
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
          source_rule_key TEXT,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'To Do',
          assignee TEXT,
          notes TEXT,
          task_order REAL,
          completed_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          airtable_id TEXT,
          UNIQUE(deal_id, source_rule_key)
        );

        CREATE TABLE IF NOT EXISTS deadlines (
          id TEXT PRIMARY KEY,
          deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
          label TEXT NOT NULL,
          due_date TEXT NOT NULL,
          alert_schedule TEXT DEFAULT '[]',
          is_acknowledged INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          category TEXT,
          sha256 TEXT,
          file_size INTEGER,
          uploaded_at TEXT DEFAULT (datetime('now')),
          UNIQUE(deal_id, sha256)
        );

        CREATE TABLE IF NOT EXISTS pdf_extractions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deal_id TEXT NOT NULL,
          file_id TEXT REFERENCES files(id),
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          category TEXT,
          extracted_text TEXT,
          summary TEXT,
          key_findings TEXT,
          page_count INTEGER DEFAULT 0,
          analyzed_at TEXT DEFAULT (datetime('now')),
          UNIQUE(deal_id, file_path)
        );

        CREATE TABLE IF NOT EXISTS kb_chunks (
          id TEXT PRIMARY KEY,
          deal_id TEXT,
          file_id TEXT REFERENCES files(id),
          content TEXT NOT NULL,
          chunk_index INTEGER DEFAULT 0,
          token_count INTEGER,
          embedding TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deal_id TEXT,
          event_type TEXT NOT NULL,
          details TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sync_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          payload TEXT,
          status TEXT DEFAULT 'pending',
          attempts INTEGER DEFAULT 0,
          max_attempts INTEGER DEFAULT 3,
          error TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // ── 2. Migrate data from old tables ──

      // Check if old tables exist
      const oldTablesExist = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='deal_vault'"
      ).get();

      if (oldTablesExist) {
        // 2a. Migrate deal_vault → deals
        const oldDeals = db.prepare('SELECT * FROM deal_vault').all() as any[];
        if (oldDeals.length > 0) {
          const insertDeal = db.prepare(`
            INSERT OR IGNORE INTO deals (
              id, airtable_id, created_at, updated_at, deal_name, last_name,
              deal_type, stage, county, state, notes, purchase_price,
              expected_sales_price, contract_execution_date, expected_close_date,
              close_date, days_to_close, phone_number, assigned_to, due_diligence_link
            ) VALUES (
              @id, @airtable_id, @created_at, @updated_at, @deal_name, @last_name,
              @deal_type, @stage, @county, @state, @notes, @purchase_price,
              @expected_sales_price, @contract_execution_date, @expected_close_date,
              @close_date, @days_to_close, @phone_number, @assigned_to, @due_diligence_link
            )
          `);

          const insertFile = db.prepare(`
            INSERT OR IGNORE INTO files (id, deal_id, file_name, file_path, category, uploaded_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
          `);

          const migrateDeals = db.transaction(() => {
            for (const deal of oldDeals) {
              // Normalize deal_type to match ruleset keys
              let dealType = deal.deal_type || 'Standard Flip';
              if (dealType === 'Standard flip') dealType = 'Standard Flip';
              if (dealType === 'Double close') dealType = 'Double Close';

              insertDeal.run({
                id: deal.id,
                airtable_id: deal.airtable_id || null,
                created_at: deal.created_at,
                updated_at: deal.updated_at,
                deal_name: deal.deal_name || '',
                last_name: deal.last_name || '',
                deal_type: dealType,
                stage: deal.stage || 'Purchase Agreement Signed',
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
                assigned_to: deal.assigned_to || null,
                due_diligence_link: deal.due_diligence_link || '',
              });

              // 2c. Extract file JSON arrays into files table
              const fileCategories = [
                'purchase_agreement_files', 'funding_agreement_files', 'deed_files',
                'plat_files', 'soil_test_files', 'hud_files', 'sale_contract_files',
              ];

              const categoryMap: Record<string, string> = {
                purchase_agreement_files: 'purchase_agreement',
                funding_agreement_files: 'funding_agreement',
                deed_files: 'deed',
                plat_files: 'plat',
                soil_test_files: 'soil_test',
                hud_files: 'hud',
                sale_contract_files: 'sale_contract',
              };

              for (const catKey of fileCategories) {
                let files: any[] = [];
                try {
                  const raw = deal[catKey];
                  if (typeof raw === 'string' && raw.trim()) {
                    files = JSON.parse(raw);
                  } else if (Array.isArray(raw)) {
                    files = raw;
                  }
                } catch { /* skip unparseable */ }

                for (const f of files) {
                  if (f && (f.name || f.url)) {
                    insertFile.run(
                      generateUUID(),
                      deal.id,
                      f.name || f.filename || 'unknown',
                      f.url || f.path || '',
                      categoryMap[catKey] || 'other'
                    );
                  }
                }
              }
            }
          });

          migrateDeals();
          console.log(`[Migration v2] Migrated ${oldDeals.length} deals`);
        }

        // 2b. Migrate tasks_vault → tasks
        const oldTasksExist = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_vault'"
        ).get();

        if (oldTasksExist) {
          const oldTasks = db.prepare('SELECT * FROM tasks_vault').all() as any[];
          if (oldTasks.length > 0) {
            const insertTask = db.prepare(`
              INSERT OR IGNORE INTO tasks (
                id, deal_id, title, description, status, assignee, notes,
                task_order, completed_at, created_at, updated_at, airtable_id
              ) VALUES (
                @id, @deal_id, @title, @description, @status, @assignee, @notes,
                @task_order, @completed_at, @created_at, @updated_at, @airtable_id
              )
            `);

            // Build airtable_id → deal.id lookup
            const dealLookup = new Map<string, string>();
            const allNewDeals = db.prepare('SELECT id, airtable_id FROM deals WHERE airtable_id IS NOT NULL').all() as any[];
            for (const d of allNewDeals) {
              dealLookup.set(d.airtable_id, d.id);
            }

            const migrateTasks = db.transaction(() => {
              for (const task of oldTasks) {
                const dealId = task.deal_airtable_id ? dealLookup.get(task.deal_airtable_id) : null;
                if (!dealId) {
                  console.warn(`[Migration v2] Skipping task "${task.task_name}" — no matching deal for airtable_id ${task.deal_airtable_id}`);
                  continue;
                }

                insertTask.run({
                  id: task.id,
                  deal_id: dealId,
                  title: task.task_name || '',
                  description: task.description || '',
                  status: task.status || 'To Do',
                  assignee: task.assignee || null,
                  notes: task.notes || '',
                  task_order: task.task_order || null,
                  completed_at: task.completed_at || null,
                  created_at: task.created_at,
                  updated_at: task.updated_at,
                  airtable_id: task.airtable_id || null,
                });
              }
            });

            migrateTasks();
            console.log(`[Migration v2] Migrated ${oldTasks.length} tasks`);
          }
        }

        // 2d. Migrate pdf_analysis → pdf_extractions
        const oldPdfExist = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='pdf_analysis'"
        ).get();

        if (oldPdfExist) {
          db.exec(`
            INSERT OR IGNORE INTO pdf_extractions (id, deal_id, file_name, file_path, category, extracted_text, summary, key_findings, page_count, analyzed_at)
            SELECT id, deal_id, file_name, file_path, category, extracted_text, summary, key_findings, page_count, analyzed_at
            FROM pdf_analysis
          `);
          console.log('[Migration v2] Migrated pdf_analysis → pdf_extractions');
        }

        // 2e. Migrate document_vectors → kb_chunks
        const oldVectorsExist = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='document_vectors'"
        ).get();

        if (oldVectorsExist) {
          db.exec(`
            INSERT OR IGNORE INTO kb_chunks (id, deal_id, content, chunk_index, embedding, created_at)
            SELECT id, deal_id, content, chunk_index, embedding, datetime('now')
            FROM document_vectors
          `);
          console.log('[Migration v2] Migrated document_vectors → kb_chunks');
        }

        // 2f. Migrate task_activity_log → audit_log
        const oldActivityExist = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='task_activity_log'"
        ).get();

        if (oldActivityExist) {
          db.exec(`
            INSERT INTO audit_log (deal_id, event_type, details, created_at)
            SELECT NULL, 'task_' || action, json_object('task_id', task_id, 'details', details), created_at
            FROM task_activity_log
          `);
          console.log('[Migration v2] Migrated task_activity_log → audit_log');
        }
      }

      // ── 3. Create indexes ──

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_deals_airtable_id ON deals(airtable_id);
        CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
        CREATE INDEX IF NOT EXISTS idx_deals_phone ON deals(phone_number);
        CREATE INDEX IF NOT EXISTS idx_tasks_deal_id ON tasks(deal_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_source_rule_key ON tasks(source_rule_key);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_deadlines_deal_id ON deadlines(deal_id);
        CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON deadlines(due_date);
        CREATE INDEX IF NOT EXISTS idx_files_deal_id ON files(deal_id);
        CREATE INDEX IF NOT EXISTS idx_files_category ON files(category);
        CREATE INDEX IF NOT EXISTS idx_pdf_extractions_deal ON pdf_extractions(deal_id);
        CREATE INDEX IF NOT EXISTS idx_kb_chunks_deal ON kb_chunks(deal_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_deal ON audit_log(deal_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_type ON audit_log(event_type);
        CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
      `);

      console.log('[Migration v2] Schema overhaul complete');
    },
  },
  {
    version: 3,
    description: 'FUB file sync: source tracking, fub_attachment_id, fub_file_sync table',
    up: (db) => {
      // ── 1. Add source tracking columns to files table ──
      // ALTER TABLE can fail if column already exists — wrap each in try/catch
      try {
        db.exec(`ALTER TABLE files ADD COLUMN source TEXT DEFAULT 'local'`);
      } catch {
        // Column already exists — safe to ignore
      }

      try {
        db.exec(`ALTER TABLE files ADD COLUMN fub_attachment_id TEXT`);
      } catch {
        // Column already exists — safe to ignore
      }

      // ── 2. Unique index on fub_attachment_id (prevents double-sync from FUB) ──
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_files_fub_attachment
          ON files(fub_attachment_id) WHERE fub_attachment_id IS NOT NULL;
      `);

      // ── 3. FUB file sync state per deal ──
      db.exec(`
        CREATE TABLE IF NOT EXISTS fub_file_sync (
          deal_id TEXT PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
          fub_person_id TEXT NOT NULL,
          last_synced_at TEXT,
          last_status TEXT DEFAULT 'pending',
          last_error TEXT,
          local_file_count INTEGER DEFAULT 0,
          fub_file_count INTEGER DEFAULT 0,
          mismatched_files TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // ── 4. Index for quick fub_file_sync lookups by status ──
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_fub_file_sync_status ON fub_file_sync(last_status);
      `);

      console.log('[Migration v3] FUB file sync schema complete');
    },
  },
  {
    version: 4,
    description: 'Add unique index on tasks.airtable_id for upsert support (partial — fixed in v5)',
    up: (db) => {
      // Originally created a partial index — fixed by v5
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_airtable_id
          ON tasks(airtable_id) WHERE airtable_id IS NOT NULL;
      `);
      console.log('[Migration v4] tasks.airtable_id partial unique index created');
    },
  },
  {
    version: 5,
    description: 'Fix tasks.airtable_id index: replace partial with full unique index for ON CONFLICT support',
    up: (db) => {
      // Partial indexes (WHERE ...) don't satisfy SQLite ON CONFLICT clauses.
      // Drop and recreate as a non-partial unique index.
      // SQLite treats NULLs as distinct in UNIQUE indexes, so multiple NULL airtable_ids are fine.
      db.exec(`DROP INDEX IF EXISTS idx_tasks_airtable_id;`);
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_airtable_id
          ON tasks(airtable_id);
      `);
      console.log('[Migration v5] tasks.airtable_id full unique index created');
    },
  },
  {
    version: 6,
    description: 'Remove Airtable, add FUB person sync: unique index on fub_person_id, fub_person_sync table, drop sync_jobs',
    up: (db) => {
      // 1. Add unique index on deals.fub_person_id (for ON CONFLICT upsert)
      // Partial index: WHERE fub_person_id IS NOT NULL — allows multiple NULLs
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_fub_person_id
          ON deals(fub_person_id) WHERE fub_person_id IS NOT NULL;
      `);

      // 2. Create fub_person_sync table to track per-person sync state
      db.exec(`
        CREATE TABLE IF NOT EXISTS fub_person_sync (
          fub_person_id TEXT PRIMARY KEY,
          deal_id TEXT REFERENCES deals(id) ON DELETE CASCADE,
          fub_stage TEXT,
          last_synced_at TEXT,
          status TEXT DEFAULT 'pending',
          error TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_fub_person_sync_status ON fub_person_sync(status);
        CREATE INDEX IF NOT EXISTS idx_fub_person_sync_deal ON fub_person_sync(deal_id);
      `);

      // 3. Drop sync_jobs table (Airtable queue — no longer needed)
      db.exec(`DROP TABLE IF EXISTS sync_jobs;`);
      db.exec(`DROP INDEX IF EXISTS idx_sync_jobs_status;`);

      // 4. Clean up Airtable settings
      db.exec(`
        DELETE FROM settings WHERE key IN ('airtable_api_key', 'airtable_base_id', 'airtable_deals_table', 'airtable_tasks_table');
      `);

      console.log('[Migration v6] FUB person sync schema complete, Airtable artifacts removed');
    },
  },
  {
    version: 7,
    description: 'Rename stage: Offer accepted → Purchase Agreement Signed',
    up: (db) => {
      db.exec(`UPDATE deals SET stage = 'Purchase Agreement Signed' WHERE stage = 'Purchase Agreement Signed';`);
      db.exec(`UPDATE deals SET previous_stage = 'Purchase Agreement Signed' WHERE previous_stage = 'Purchase Agreement Signed';`);
      console.log('[Migration v7] Stage rename: Offer accepted → Purchase Agreement Signed');
    },
  },
  {
    version: 8,
    description: 'Fix stage rename: update Offer accepted → Purchase Agreement Signed in deals + deduplicate tasks',
    up: (db) => {
      // v7 had a no-op bug (WHERE clause matched new name, not old).
      // Fix: actually rename any remaining "Offer accepted" stages.
      const dealsUpdated = db.prepare(
        `UPDATE deals SET stage = 'Purchase Agreement Signed' WHERE stage = 'Offer accepted'`
      ).run();
      const prevUpdated = db.prepare(
        `UPDATE deals SET previous_stage = 'Purchase Agreement Signed' WHERE previous_stage = 'Offer accepted'`
      ).run();
      console.log(`[Migration v8] Fixed stage rename: ${dealsUpdated.changes} deals, ${prevUpdated.changes} previous_stage`);

      // Deduplicate tasks: For each deal, if a task with the old "Offer accepted" rule key
      // has a matching title in a "Purchase Agreement Signed" rule key, delete the old one.
      // Keep the newer "Purchase Agreement Signed" version.
      const dupeOldTasks = db.prepare(`
        SELECT old_task.id
        FROM tasks old_task
        INNER JOIN tasks new_task ON old_task.deal_id = new_task.deal_id AND old_task.title = new_task.title
        WHERE old_task.source_rule_key LIKE '%::Offer accepted::%'
          AND new_task.source_rule_key LIKE '%::Purchase Agreement Signed::%'
      `).all() as any[];

      if (dupeOldTasks.length > 0) {
        const deleteStmt = db.prepare('DELETE FROM tasks WHERE id = ?');
        for (const row of dupeOldTasks) {
          deleteStmt.run(row.id);
        }
        console.log(`[Migration v8] Removed ${dupeOldTasks.length} duplicate tasks with old 'Offer accepted' rule keys`);
      }

      // Update remaining "Offer accepted" rule keys (tasks that don't have a newer duplicate)
      const remaining = db.prepare(`
        UPDATE tasks
        SET source_rule_key = REPLACE(source_rule_key, '::Offer accepted::', '::Purchase Agreement Signed::')
        WHERE source_rule_key LIKE '%::Offer accepted::%'
      `).run();
      if (remaining.changes > 0) {
        console.log(`[Migration v8] Renamed ${remaining.changes} task rule keys from 'Offer accepted' to 'Purchase Agreement Signed'`);
      }
    },
  },
  {
    version: 9,
    description: 'FUB write outbox for reliable app-to-FUB pushes',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS fub_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
          action TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          attempts INTEGER DEFAULT 0,
          max_attempts INTEGER DEFAULT 5,
          last_error TEXT,
          next_retry_at TEXT DEFAULT (datetime('now')),
          created_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_fub_outbox_status ON fub_outbox(status);
        CREATE INDEX IF NOT EXISTS idx_fub_outbox_next_retry ON fub_outbox(next_retry_at);
      `);

      console.log('[Migration v9] FUB outbox table created');
    },
  },
  {
    version: 10,
    description: 'Add Listed For Sale as distinct stage (was collapsed into Sale escrow)',
    up: (db) => {
      // Deals that came from FUB with stage "Listed For Sale" were previously
      // mapped to "Sale escrow" via LEGACY_FUB_STAGE_MAP. Now that "Listed For Sale"
      // is a real app stage, the person sync will naturally re-assign them on next cycle.
      // No data migration needed — just bump schema version.
      console.log('[Migration v10] Listed For Sale stage added — existing deals will re-sync from FUB');
    },
  },
  {
    version: 11,
    description: 'Add FUB custom field columns to deals table for bidirectional sync',
    up: (db) => {
      // Add new columns for FUB custom fields that don't have local columns yet.
      // Using try/catch per column so migration is idempotent.
      const newColumns = [
        `ALTER TABLE deals ADD COLUMN email TEXT`,
        `ALTER TABLE deals ADD COLUMN contract_end_date TEXT`,
        `ALTER TABLE deals ADD COLUMN parcel_number TEXT`,
        `ALTER TABLE deals ADD COLUMN parcel_zip TEXT`,
        `ALTER TABLE deals ADD COLUMN lot_acreage TEXT`,
        `ALTER TABLE deals ADD COLUMN seller_bottom_price REAL`,
        `ALTER TABLE deals ADD COLUMN double_close_offer REAL`,
        `ALTER TABLE deals ADD COLUMN realtor_price_opinion REAL`,
        `ALTER TABLE deals ADD COLUMN mortgage_on_property TEXT`,
        `ALTER TABLE deals ADD COLUMN hoa_poa_on_property TEXT`,
        `ALTER TABLE deals ADD COLUMN title_search TEXT`,
        `ALTER TABLE deals ADD COLUMN title_exam TEXT`,
        `ALTER TABLE deals ADD COLUMN survey TEXT`,
        `ALTER TABLE deals ADD COLUMN soil_test TEXT`,
        `ALTER TABLE deals ADD COLUMN title_company_name TEXT`,
        `ALTER TABLE deals ADD COLUMN title_company_phone TEXT`,
        `ALTER TABLE deals ADD COLUMN title_company_email TEXT`,
        `ALTER TABLE deals ADD COLUMN funder_name TEXT`,
        `ALTER TABLE deals ADD COLUMN realtor_name TEXT`,
        `ALTER TABLE deals ADD COLUMN drone_photo_link TEXT`,
        `ALTER TABLE deals ADD COLUMN reference_number TEXT`,
        `ALTER TABLE deals ADD COLUMN misc_deal_expenses TEXT`,
        `ALTER TABLE deals ADD COLUMN parcel_link TEXT`,
      ];

      for (const sql of newColumns) {
        try { db.exec(sql); } catch { /* Column already exists */ }
      }

      // Migrate existing due_diligence_link values to parcel_link for consistency
      // (due_diligence_link was used for parcel links from FUB)
      db.exec(`UPDATE deals SET parcel_link = due_diligence_link WHERE due_diligence_link IS NOT NULL AND due_diligence_link != '' AND parcel_link IS NULL`);

      console.log('[Migration v11] FUB custom field columns added to deals table');
    },
  },
  {
    version: 12,
    description: 'FUB activities table for notes, calls, texts, and emails',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS fub_activities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
          fub_person_id TEXT NOT NULL,
          fub_id INTEGER NOT NULL,
          activity_type TEXT NOT NULL,
          direction TEXT,
          subject TEXT,
          body TEXT,
          from_number TEXT,
          to_number TEXT,
          duration INTEGER,
          outcome TEXT,
          status TEXT,
          created_by TEXT,
          activity_date TEXT NOT NULL,
          raw_json TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(fub_person_id, activity_type, fub_id)
        );

        CREATE INDEX IF NOT EXISTS idx_fub_activities_deal ON fub_activities(deal_id);
        CREATE INDEX IF NOT EXISTS idx_fub_activities_person ON fub_activities(fub_person_id);
        CREATE INDEX IF NOT EXISTS idx_fub_activities_type ON fub_activities(activity_type);
        CREATE INDEX IF NOT EXISTS idx_fub_activities_date ON fub_activities(activity_date);
      `);

      console.log('[Migration v12] FUB activities table created');
    },
  },
  {
    version: 13,
    description: 'Add deal fee columns for profit tracking',
    up(db: Database.Database) {
      db.exec(`
        ALTER TABLE deals ADD COLUMN transactional_funding_fee REAL DEFAULT 0;
        ALTER TABLE deals ADD COLUMN realtor_fee_percent REAL DEFAULT 0;
        ALTER TABLE deals ADD COLUMN realtor_fee_amount REAL DEFAULT 0;
        ALTER TABLE deals ADD COLUMN improvement_costs REAL DEFAULT 0;
        ALTER TABLE deals ADD COLUMN misc_fees REAL DEFAULT 0;
      `);

      console.log('[Migration v13] Deal fee columns added (transactional_funding_fee, realtor_fee_percent, realtor_fee_amount, improvement_costs, misc_fees)');
    },
  },
  {
    version: 14,
    description: 'Add Jerez Land share columns',
    up(db: Database.Database) {
      db.exec(`
        ALTER TABLE deals ADD COLUMN jl_share_percent REAL DEFAULT 0;
        ALTER TABLE deals ADD COLUMN jl_share_amount REAL DEFAULT 0;
      `);

      console.log('[Migration v14] Jerez Land share columns added (jl_share_percent, jl_share_amount)');
    },
  },
  {
    version: 15,
    description: 'Task reminders table for Slack notifications',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_reminders (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          remind_at TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          error TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          sent_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_pending ON task_reminders(status, remind_at);
      `);
      console.log('[Migration v15] Task reminders table created');
    },
  },
  {
    version: 16,
    description: 'Daily leads table for hot-lead reviewer',
    up(db: Database.Database) {
      // Step 1: Create table (no-op if it already exists from an earlier incomplete version)
      db.exec(`
        CREATE TABLE IF NOT EXISTS daily_leads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fub_id INTEGER UNIQUE NOT NULL,
          name TEXT NOT NULL,
          stage TEXT,
          source TEXT,
          score INTEGER DEFAULT 0,
          summary TEXT,
          rationale TEXT,
          recommended_follow_up TEXT,
          action_required INTEGER DEFAULT 0,
          is_completed INTEGER DEFAULT 0,
          last_analyzed_at TEXT,
          last_communication TEXT,
          fub_link TEXT,
          phone TEXT,
          email TEXT,
          contacted_today TEXT,
          discount_likelihood INTEGER,
          motivation_factors TEXT,
          negotiation_strategy TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Step 2: If the table already existed with fewer columns, add the missing ones.
      // Same idempotent pattern as migrations v3 and v11.
      const addCols = [
        `ALTER TABLE daily_leads ADD COLUMN source TEXT`,
        `ALTER TABLE daily_leads ADD COLUMN last_analyzed_at TEXT`,
        `ALTER TABLE daily_leads ADD COLUMN last_communication TEXT`,
        `ALTER TABLE daily_leads ADD COLUMN fub_link TEXT`,
        `ALTER TABLE daily_leads ADD COLUMN phone TEXT`,
        `ALTER TABLE daily_leads ADD COLUMN email TEXT`,
        `ALTER TABLE daily_leads ADD COLUMN contacted_today TEXT`,
        `ALTER TABLE daily_leads ADD COLUMN discount_likelihood INTEGER`,
        `ALTER TABLE daily_leads ADD COLUMN motivation_factors TEXT`,
        `ALTER TABLE daily_leads ADD COLUMN negotiation_strategy TEXT`,
        `ALTER TABLE daily_leads ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`,
        `ALTER TABLE daily_leads ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`,
      ];
      for (const sql of addCols) {
        try { db.exec(sql); } catch { /* Column already exists */ }
      }

      // Step 3: Create indexes (after columns are guaranteed to exist)
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_leads_fub_id_unique ON daily_leads(fub_id);
        CREATE INDEX IF NOT EXISTS idx_daily_leads_fub_id ON daily_leads(fub_id);
        CREATE INDEX IF NOT EXISTS idx_daily_leads_score ON daily_leads(score DESC);
        CREATE INDEX IF NOT EXISTS idx_daily_leads_discount ON daily_leads(discount_likelihood DESC);
      `);

      console.log('[Migration v16] daily_leads table created/patched');
    },
  },
];

/**
 * Run all pending migrations.
 * Called from database.ts on app startup.
 */
export function runMigrations(db: Database.Database): void {
  // Ensure schema_version table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Get current version
  const row = db.prepare('SELECT MAX(version) as current_version FROM schema_version').get() as any;
  const currentVersion = row?.current_version || 0;

  // Check if this is a brand new DB (no old tables, no schema_version entries)
  const isNewDb = currentVersion === 0 && !db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='deal_vault'"
  ).get();

  if (isNewDb) {
    // Fresh install: run all migrations from v2 onward (v1 is a no-op for old DBs)
    console.log('[Migrations] Fresh install detected, creating schema...');
    const freshMigrations = migrations.filter(m => m.version >= 2);
    for (const m of freshMigrations) {
      m.up(db);
    }
    // Mark all versions as applied
    const markApplied = db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)');
    for (const m of migrations) {
      markApplied.run(m.version);
    }
    const latestVersion = migrations[migrations.length - 1].version;
    console.log(`[Migrations] Fresh install: schema at v${latestVersion}`);
    return;
  }

  // Existing DB: if v0 (no schema_version entries), old tables exist — mark as v1
  if (currentVersion === 0) {
    console.log('[Migrations] Existing DB detected with no version marker, marking as v1...');
    db.prepare('INSERT INTO schema_version (version) VALUES (1)').run();
  }

  // Re-check version after potential v1 marking
  const updatedRow = db.prepare('SELECT MAX(version) as current_version FROM schema_version').get() as any;
  const updatedVersion = updatedRow?.current_version || 0;

  // Run pending migrations
  const pending = migrations.filter(m => m.version > updatedVersion);
  if (pending.length === 0) {
    console.log(`[Migrations] Schema up to date at v${updatedVersion}`);
    return;
  }

  for (const migration of pending) {
    console.log(`[Migrations] Running v${migration.version}: ${migration.description}...`);
    try {
      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version);
      })();
      console.log(`[Migrations] v${migration.version} applied successfully`);
    } catch (error) {
      console.error(`[Migrations] FAILED v${migration.version}:`, error);
      throw error; // Don't continue if a migration fails
    }
  }
}
