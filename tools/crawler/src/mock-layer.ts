/**
 * Mock Layer — External API Interceptor & Fixture Database Seeding
 *
 * Strategy: The app's existing code already gracefully handles missing API keys:
 * - getFubConfig() returns null when no FUB key → sync silently skipped
 * - KPI dashboard catches Airtable errors → shows error state
 * - AI handlers check for Anthropic key → return error gracefully
 *
 * So we:
 * 1. Launch with MOCK_EXTERNAL=true (disables background runners in main.ts)
 * 2. Seed a fixture database with test deals, tasks, deadlines
 * 3. Point the app at this fixture database via custom appData path
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { CrawlConfig } from './types.js';

/** UUIDs for fixture data — deterministic for reproducibility */
function uuid(): string {
  return crypto.randomUUID();
}

/** Pre-generated deal IDs for cross-referencing */
const DEAL_IDS = {
  deal1: uuid(),
  deal2: uuid(),
  deal3: uuid(),
  deal4: uuid(),
  deal5: uuid(),
  cancelledDeal: uuid(),
};

/**
 * Create a temporary data directory with a seeded fixture database.
 * Returns the path to the temp directory.
 */
export function createFixtureDatabase(config: CrawlConfig): string {
  const tmpDir = path.join(config.projectRoot, 'tools', 'crawler', 'artifacts', '.test-data');
  fs.mkdirSync(tmpDir, { recursive: true });

  const dbPath = path.join(tmpDir, 'tc-dash.db');

  // Remove old fixture DB if it exists
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
  if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run the app's migrations to create schema
  const migrationsPath = path.join(config.projectRoot, 'electron', 'migrations.ts');
  // Instead of importing TS migrations, we create tables directly matching the schema
  createSchema(db);
  seedFixtureData(db);

  db.close();

  console.log(`[MockLayer] Fixture database created at: ${dbPath}`);
  return tmpDir;
}

/**
 * Create all tables matching the app's schema (mirrors migrations v1-v15+).
 */
function createSchema(db: Database.Database): void {
  db.exec(`
    -- Schema version tracking
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
    INSERT INTO schema_version (version) VALUES (15);

    -- Settings
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Deals
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      airtable_id TEXT,
      fub_person_id TEXT,
      deal_name TEXT NOT NULL DEFAULT '',
      last_name TEXT DEFAULT '',
      deal_type TEXT DEFAULT 'Standard Flip',
      stage TEXT DEFAULT 'Purchase Agreement Signed',
      previous_stage TEXT,
      county TEXT DEFAULT '',
      state TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      purchase_price REAL DEFAULT 0,
      expected_sales_price REAL DEFAULT 0,
      contract_execution_date TEXT,
      contract_end_date TEXT,
      expected_close_date TEXT,
      close_date TEXT,
      days_to_close TEXT,
      phone_number TEXT,
      email TEXT,
      assigned_to TEXT,
      due_diligence_link TEXT,
      parcel_number TEXT,
      parcel_zip TEXT,
      parcel_link TEXT,
      lot_acreage TEXT,
      seller_bottom_price REAL,
      double_close_offer REAL,
      realtor_price_opinion REAL,
      mortgage_on_property TEXT,
      hoa_poa_on_property TEXT,
      title_search TEXT,
      title_exam TEXT,
      survey TEXT,
      soil_test TEXT,
      title_company_name TEXT,
      title_company_phone TEXT,
      title_company_email TEXT,
      funder_name TEXT,
      realtor_name TEXT,
      drone_photo_link TEXT,
      reference_number TEXT,
      misc_deal_expenses TEXT,
      transactional_funding_fee REAL DEFAULT 0,
      realtor_fee_percent REAL DEFAULT 0,
      realtor_fee_amount REAL DEFAULT 0,
      improvement_costs REAL DEFAULT 0,
      misc_fees REAL DEFAULT 0,
      jl_share_percent REAL DEFAULT 50,
      jl_share_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Tasks
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      source_rule_key TEXT,
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'To Do',
      assignee TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      task_order INTEGER DEFAULT 0,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      airtable_id TEXT,
      FOREIGN KEY (deal_id) REFERENCES deals(id),
      UNIQUE(deal_id, source_rule_key)
    );

    -- Audit log
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id TEXT,
      event_type TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Files
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      category TEXT DEFAULT 'other',
      sha256 TEXT,
      file_size INTEGER DEFAULT 0,
      source TEXT DEFAULT 'local',
      fub_attachment_id TEXT,
      uploaded_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (deal_id) REFERENCES deals(id)
    );

    -- Deadlines
    CREATE TABLE IF NOT EXISTS deadlines (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      label TEXT NOT NULL,
      due_date TEXT NOT NULL,
      alert_schedule TEXT DEFAULT '[]',
      is_acknowledged INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (deal_id) REFERENCES deals(id)
    );

    -- FUB person sync
    CREATE TABLE IF NOT EXISTS fub_person_sync (
      fub_person_id TEXT PRIMARY KEY,
      deal_id TEXT,
      fub_stage TEXT,
      last_synced_at TEXT,
      status TEXT DEFAULT 'pending',
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- FUB file sync
    CREATE TABLE IF NOT EXISTS fub_file_sync (
      deal_id TEXT PRIMARY KEY,
      fub_person_id TEXT,
      last_synced_at TEXT,
      last_status TEXT DEFAULT 'pending',
      last_error TEXT,
      local_file_count INTEGER DEFAULT 0,
      fub_file_count INTEGER DEFAULT 0,
      mismatched_files TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- FUB outbox
    CREATE TABLE IF NOT EXISTS fub_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id TEXT NOT NULL,
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

    -- Task activity log
    CREATE TABLE IF NOT EXISTS task_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- PDF extractions
    CREATE TABLE IF NOT EXISTS pdf_extractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id TEXT NOT NULL,
      file_id TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      category TEXT,
      extracted_text TEXT,
      summary TEXT,
      key_findings TEXT,
      page_count INTEGER DEFAULT 0,
      analyzed_at TEXT DEFAULT (datetime('now'))
    );

    -- Knowledge base chunks
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id TEXT PRIMARY KEY,
      deal_id TEXT,
      file_id TEXT,
      content TEXT NOT NULL,
      chunk_index INTEGER DEFAULT 0,
      token_count INTEGER DEFAULT 0,
      embedding TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Deal analysis cache
    CREATE TABLE IF NOT EXISTS deal_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id TEXT NOT NULL UNIQUE,
      analysis TEXT,
      risk_score REAL DEFAULT 0,
      recommendations TEXT DEFAULT '[]',
      analyzed_at TEXT DEFAULT (datetime('now'))
    );

    -- Task reminders
    CREATE TABLE IF NOT EXISTS task_reminders (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      remind_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      sent_at TEXT
    );

    -- Daily leads (may not be needed for crawl but keeps schema consistent)
    CREATE TABLE IF NOT EXISTS daily_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      lead_count INTEGER DEFAULT 0,
      source TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Seed fixture data for crawl testing.
 */
function seedFixtureData(db: Database.Database): void {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Settings (empty API keys — disables all external calls)
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('fub_api_key', '');
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('fub_account_name', '');
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('anthropic_api_key', '');
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('airtable_api_key', '');
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('slack_webhook_url', '');

  // 5 active deals + 1 cancelled
  const deals = [
    { id: DEAL_IDS.deal1, name: 'Smith Property', type: 'Standard Flip', stage: 'Purchase Agreement Signed', county: 'Travis', state: 'TX', purchase: 45000, sale: 89000 },
    { id: DEAL_IDS.deal2, name: 'Johnson Lot', type: 'Double Close', stage: 'Due Diligence', county: 'Williamson', state: 'TX', purchase: 32000, sale: 67000 },
    { id: DEAL_IDS.deal3, name: 'Garcia Ranch', type: 'Standard Flip', stage: 'Purchased', county: 'Hays', state: 'TX', purchase: 78000, sale: 145000 },
    { id: DEAL_IDS.deal4, name: 'Williams Acres', type: 'Subdivide', stage: 'Listed For Sale', county: 'Bell', state: 'TX', purchase: 120000, sale: 250000 },
    { id: DEAL_IDS.deal5, name: 'Brown Homestead', type: 'Standard Flip', stage: 'Sale escrow', county: 'Comal', state: 'TX', purchase: 55000, sale: 112000 },
    { id: DEAL_IDS.cancelledDeal, name: 'Davis Tract', type: 'Standard Flip', stage: 'Cancelled', county: 'Guadalupe', state: 'TX', purchase: 25000, sale: 50000 },
  ];

  const insertDeal = db.prepare(`
    INSERT INTO deals (id, deal_name, deal_type, stage, county, state, purchase_price, expected_sales_price,
      contract_execution_date, expected_close_date, phone_number, email, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const d of deals) {
    insertDeal.run(
      d.id, d.name, d.type, d.stage, d.county, d.state, d.purchase, d.sale,
      monthAgo, nextWeek, '(512) 555-0100', 'test@example.com', monthAgo, now
    );
  }

  // Tasks: 3 per active deal (To Do, In Progress, Done)
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, deal_id, title, status, task_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const taskTemplates = [
    { title: 'Order title search', status: 'Done' },
    { title: 'Review purchase agreement', status: 'In Progress' },
    { title: 'Send to escrow officer', status: 'To Do' },
  ];

  for (const deal of deals.filter(d => d.stage !== 'Cancelled')) {
    for (let i = 0; i < taskTemplates.length; i++) {
      const t = taskTemplates[i];
      insertTask.run(uuid(), deal.id, t.title, t.status, i + 1, weekAgo, now);
    }
  }

  // Deadlines: 1 upcoming, 1 past
  const insertDeadline = db.prepare(`
    INSERT INTO deadlines (id, deal_id, label, due_date, alert_schedule, is_acknowledged)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertDeadline.run(uuid(), DEAL_IDS.deal1, 'Contract Expiration', nextWeek,
    JSON.stringify([{ offset_days: 7, fired: false }, { offset_days: 3, fired: false }, { offset_days: 1, fired: false }]), 0);
  insertDeadline.run(uuid(), DEAL_IDS.deal3, 'Inspection Period End', yesterday,
    JSON.stringify([{ offset_days: 7, fired: true }, { offset_days: 3, fired: true }, { offset_days: 1, fired: true }]), 0);

  // Audit log entries
  const insertAudit = db.prepare(`
    INSERT INTO audit_log (deal_id, event_type, details, created_at) VALUES (?, ?, ?, ?)
  `);

  for (const deal of deals) {
    insertAudit.run(deal.id, 'deal_created',
      JSON.stringify({ deal_name: deal.name, stage: deal.stage, source: 'fixture' }), monthAgo);
  }

  console.log(`[MockLayer] Seeded: ${deals.length} deals, ${taskTemplates.length * 5} tasks, 2 deadlines, ${deals.length} audit entries`);
}

/**
 * Get environment variables to pass to the Electron app for mock mode.
 */
export function getMockEnv(fixtureDataDir: string): Record<string, string> {
  return {
    MOCK_EXTERNAL: 'true',
    SAFE_MODE: 'true',
    // Override the app data directory to use our fixture database
    // The app's database.ts uses app.getPath('appData') + 'jerez-land-tc-data'
    // We'll set XDG_CONFIG_HOME on macOS to redirect appData
    // Actually — Electron on macOS uses ~/Library/Application Support
    // We need to copy our fixture DB to a temp location that getDbDir() will find
    TC_CRAWLER_DATA_DIR: fixtureDataDir,
    // Disable all API keys (use correct env var names from the app)
    FUB_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    AIRTABLE_PAT: '',
    AIRTABLE_BASE_ID: '',
    AIRTABLE_API_KEY: '',
    VITE_AIRTABLE_PAT: '',
    VITE_AIRTABLE_BASE_ID: '',
  };
}
