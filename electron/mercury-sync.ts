/**
 * Mercury Sync Service — Electron Main Process
 *
 * Background sync: fetches accounts + transactions from Mercury API every 15 min.
 * Caches in SQLite. Auto-classifies transactions by matching counterparty names
 * against deal records (title companies, sellers, funders).
 */

import { getDb } from './database.js';
import {
  fetchAccounts,
  fetchAllTransactions,
  type MercuryAccount,
  type MercuryTransaction,
} from './mercury-api.js';
import type Database from 'better-sqlite3';

const SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes
let syncTimer: ReturnType<typeof setInterval> | null = null;

// ---- Public API ----

export function startMercurySync(): void {
  if (!process.env.MERCURY_API_TOKEN?.trim()) {
    console.log('[MercurySync] No MERCURY_API_TOKEN set, skipping sync');
    return;
  }

  console.log('[MercurySync] Starting background sync (every 15 min)');

  // Initial sync after 5 seconds (let app finish loading)
  setTimeout(() => syncNow().catch(err =>
    console.error('[MercurySync] Initial sync failed:', err.message)
  ), 5000);

  syncTimer = setInterval(() => {
    syncNow().catch(err =>
      console.error('[MercurySync] Periodic sync failed:', err.message)
    );
  }, SYNC_INTERVAL);
}

export function stopMercurySync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export async function syncNow(): Promise<{
  accounts: number;
  transactions: number;
  error?: string;
}> {
  const db = getDb();
  if (!db) return { accounts: 0, transactions: 0, error: 'Database not ready' };

  try {
    // 1. Sync accounts
    const accounts = await fetchAccounts();
    upsertAccounts(db, accounts);

    // 2. Sync transactions for each account (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const start = ninetyDaysAgo.toISOString().split('T')[0];

    let totalTxns = 0;
    for (const account of accounts) {
      const txns = await fetchAllTransactions(account.id, { start });
      upsertTransactions(db, txns);
      totalTxns += txns.length;
    }

    // 3. Auto-classify unclassified transactions
    classifyTransactions(db);

    // 3b. Reclassify misclassified internal transfers
    reclassifyTransfers(db);

    // 4. Update sync timestamp
    db.prepare(
      `INSERT OR REPLACE INTO mercury_sync_state (key, value, updated_at) VALUES ('last_sync', datetime('now'), datetime('now'))`
    ).run();

    console.log(`[MercurySync] Synced ${accounts.length} accounts, ${totalTxns} transactions`);
    return { accounts: accounts.length, transactions: totalTxns };
  } catch (err: any) {
    console.error('[MercurySync] Sync error:', err.message);
    return { accounts: 0, transactions: 0, error: err.message };
  }
}

// ---- Database Operations ----

function upsertAccounts(db: Database.Database, accounts: MercuryAccount[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO mercury_accounts
    (id, name, nickname, kind, current_balance, available_balance, routing_number, account_number, status, legal_business_name, dashboard_link, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const upsert = db.transaction(() => {
    for (const a of accounts) {
      stmt.run(
        a.id, a.name, a.nickname, a.kind,
        a.currentBalance, a.availableBalance,
        a.routingNumber, a.accountNumber,
        a.status, a.legalBusinessName, a.dashboardLink,
      );
    }
  });

  upsert();
}

function upsertTransactions(db: Database.Database, txns: MercuryTransaction[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO mercury_transactions
    (id, account_id, amount, counterparty_name, counterparty_id, note, bank_description, external_memo, kind, status, posted_at, created_at, mercury_category, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const upsert = db.transaction(() => {
    for (const t of txns) {
      stmt.run(
        t.id, t.accountId, t.amount,
        t.counterpartyName, t.counterpartyId,
        t.note, t.bankDescription, t.externalMemo,
        t.kind, t.status, t.postedAt, t.createdAt,
        t.categoryData?.name || t.mercuryCategory || null,
      );
    }
  });

  upsert();
}

// ---- Auto-Classification ----

const TITLE_COMPANY_KEYWORDS = [
  'title', 'escrow', 'closing', 'settlement', 'abstract',
  'lighthouse', 'meridian', 'first american', 'fidelity', 'chicago title',
  'stewart', 'old republic', 'wfg', 'naa title', 'north arkansas',
];

const FUNDER_KEYWORDS = [
  'northgate', 'dewclaw', 'serious land', 'parcel funders',
  'capital to close', 'acreage trust', 'mintz', 'howard',
];

const REVENUE_KEYWORDS = [
  'incoming', 'wire received', 'ach credit', 'deposit',
];

function classifyTransactions(db: Database.Database): void {
  const unclassified = db.prepare(
    `SELECT id, counterparty_name, kind, amount, note, bank_description, mercury_category
     FROM mercury_transactions WHERE category = 'other' OR category IS NULL`
  ).all() as any[];

  // Build set of Mercury account names for internal transfer detection
  const accountNames = new Set<string>();
  const accounts = db.prepare('SELECT name, nickname FROM mercury_accounts').all() as any[];
  for (const a of accounts) {
    if (a.name) accountNames.add(a.name.toLowerCase());
    if (a.nickname) accountNames.add(a.nickname.toLowerCase());
  }

  const update = db.prepare(
    `UPDATE mercury_transactions SET category = ? WHERE id = ?`
  );

  const classify = db.transaction(() => {
    for (const t of unclassified) {
      const name = (t.counterparty_name || '').toLowerCase();
      const note = (t.note || '').toLowerCase();
      const desc = (t.bank_description || '').toLowerCase();
      const combined = `${name} ${note} ${desc}`;
      const kind = (t.kind || '').toLowerCase();

      let category = 'operating';

      // 1. Internal transfers between Mercury accounts — exclude from P&L
      if (
        kind === 'internaltransfer' ||
        kind === 'internal_transfer' ||
        combined.includes('transfer in') ||
        combined.includes('transfer out') ||
        name.startsWith('from ') ||
        name.startsWith('to ') ||
        accountNames.has(name)
      ) {
        category = 'transfer';
      }
      // 2. Payroll (check before catch-all since payroll is always negative)
      else if (name.includes('payroll') || t.mercury_category === 'Payroll' || combined.includes('payroll')) {
        category = 'payroll';
      }
      // 3. Title companies
      else if (TITLE_COMPANY_KEYWORDS.some(kw => name.includes(kw))) {
        category = t.amount < 0 ? 'closing_cost' : 'revenue';
      }
      // 4. Funders
      else if (FUNDER_KEYWORDS.some(kw => name.includes(kw))) {
        category = t.amount > 0 ? 'funding_in' : 'funding_out';
      }
      // 5. Earnest money
      else if (combined.includes('earnest') || combined.includes('emd')) {
        category = 'emd';
      }
      // 6. Explicit revenue signals
      else if (t.amount > 0 && REVENUE_KEYWORDS.some(kw => combined.includes(kw))) {
        category = 'revenue';
      }
      // 7. Positive amounts default to revenue (but NOT transfers — handled above)
      else if (t.amount > 0) {
        category = 'revenue';
      }

      update.run(category, t.id);
    }
  });

  classify();
}

/** Reclassify already-classified transactions that are actually internal transfers */
function reclassifyTransfers(db: Database.Database): void {
  // Get Mercury account names to detect internal transfers
  const accounts = db.prepare('SELECT name, nickname FROM mercury_accounts').all() as any[];
  const accountNames = new Set<string>();
  for (const a of accounts) {
    if (a.name) accountNames.add(a.name.toLowerCase());
    if (a.nickname) accountNames.add(a.nickname.toLowerCase());
  }
  if (accountNames.size === 0) return;

  // Find transactions not yet tagged as 'transfer' that look like internal transfers
  const candidates = db.prepare(
    `SELECT id, counterparty_name, kind, bank_description, note
     FROM mercury_transactions WHERE COALESCE(category, '') != 'transfer'`
  ).all() as any[];

  const update = db.prepare('UPDATE mercury_transactions SET category = ? WHERE id = ?');
  let count = 0;

  const reclassify = db.transaction(() => {
    for (const t of candidates) {
      const name = (t.counterparty_name || '').toLowerCase();
      const kind = (t.kind || '').toLowerCase();
      const combined = `${name} ${(t.note || '').toLowerCase()} ${(t.bank_description || '').toLowerCase()}`;

      if (
        kind === 'internaltransfer' ||
        kind === 'internal_transfer' ||
        combined.includes('transfer in') ||
        combined.includes('transfer out') ||
        name.startsWith('from ') ||
        name.startsWith('to ') ||
        accountNames.has(name)
      ) {
        update.run('transfer', t.id);
        count++;
      }
    }
  });

  reclassify();
  if (count > 0) {
    console.log(`[MercurySync] Reclassified ${count} internal transfers`);
  }
}

// ---- Accounting Category Mapping ----

export const ACCOUNTING_CATEGORIES: Record<string, { section: string; subcategory: string; glCode: string }> = {
  revenue:       { section: 'REVENUE',            subcategory: 'Transaction Revenue',      glCode: '42000' },
  funding_in:    { section: 'REVENUE',            subcategory: 'Funding Proceeds',         glCode: '42100' },
  closing_cost:  { section: 'COST_OF_REVENUE',    subcategory: 'Closing Costs',            glCode: '51000' },
  emd:           { section: 'COST_OF_REVENUE',    subcategory: 'Earnest Money Deposits',   glCode: '51100' },
  funding_out:   { section: 'COST_OF_REVENUE',    subcategory: 'Funding Repayments',       glCode: '51200' },
  payroll:       { section: 'OPERATING_EXPENSES', subcategory: 'Payroll & Contractors',    glCode: '62000' },
  operating:     { section: 'OPERATING_EXPENSES', subcategory: 'General & Admin',          glCode: '65000' },
  other:         { section: 'OPERATING_EXPENSES', subcategory: 'Uncategorized',            glCode: '69000' },
  transfer:      { section: 'TRANSFER',           subcategory: 'Internal Transfers',       glCode: '00000' },
};

const SECTION_ORDER = ['REVENUE', 'COST_OF_REVENUE', 'OPERATING_EXPENSES'];
const SECTION_LABELS: Record<string, string> = {
  REVENUE: 'REVENUE',
  COST_OF_REVENUE: 'COST OF REVENUE',
  OPERATING_EXPENSES: 'OPERATING EXPENSES',
};

// ---- Query Functions (called from IPC handlers) ----

export function getAccounts(db: Database.Database): any[] {
  return db.prepare('SELECT * FROM mercury_accounts ORDER BY kind, name').all();
}

export function getTransactions(
  db: Database.Database,
  opts: { days?: number; category?: string; dealId?: string; limit?: number } = {},
): any[] {
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.days) {
    conditions.push(`posted_at >= datetime('now', '-' || ? || ' days')`);
    params.push(opts.days);
  }
  if (opts.category) {
    conditions.push('category = ?');
    params.push(opts.category);
  }
  if (opts.dealId) {
    conditions.push('deal_id = ?');
    params.push(opts.dealId);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit = opts.limit ? `LIMIT ${opts.limit}` : 'LIMIT 200';

  return db.prepare(
    `SELECT * FROM mercury_transactions ${where} ORDER BY COALESCE(posted_at, created_at) DESC ${limit}`
  ).all(...params);
}

export function getSummary(db: Database.Database): {
  totalBalance: number;
  accounts: any[];
  monthlyBurn: number;
  runway: number;
  last30DaysIn: number;
  last30DaysOut: number;
  transactionCount30d: number;
  lastSync: string | null;
} {
  const accounts = getAccounts(db);
  const totalBalance = accounts.reduce((sum: number, a: any) => sum + (a.current_balance || 0), 0);

  // Last 30 days income/expense (exclude internal transfers)
  const inOut = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_in,
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_out,
      COUNT(*) as count
    FROM mercury_transactions
    WHERE posted_at >= datetime('now', '-30 days')
      AND status NOT IN ('failed', 'cancelled')
      AND COALESCE(category, '') != 'transfer'
  `).get() as any;

  // Monthly burn = average monthly outflow over last 90 days (exclude transfers)
  const burn90 = db.prepare(`
    SELECT COALESCE(SUM(ABS(amount)), 0) as total_out
    FROM mercury_transactions
    WHERE amount < 0
      AND posted_at >= datetime('now', '-90 days')
      AND status NOT IN ('failed', 'cancelled')
      AND COALESCE(category, '') != 'transfer'
  `).get() as any;

  const monthlyBurn = (burn90?.total_out || 0) / 3;
  const runway = monthlyBurn > 0 ? totalBalance / monthlyBurn : 999;

  const lastSync = db.prepare(
    `SELECT value FROM mercury_sync_state WHERE key = 'last_sync'`
  ).get() as any;

  return {
    totalBalance,
    accounts,
    monthlyBurn,
    runway,
    last30DaysIn: inOut?.total_in || 0,
    last30DaysOut: inOut?.total_out || 0,
    transactionCount30d: inOut?.count || 0,
    lastSync: lastSync?.value || null,
  };
}

export function getMonthlySpend(db: Database.Database, months = 6): any[] {
  return db.prepare(`
    SELECT
      strftime('%Y-%m', posted_at) as month,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as expenses,
      COUNT(*) as count
    FROM mercury_transactions
    WHERE posted_at >= datetime('now', '-' || ? || ' months')
      AND status NOT IN ('failed', 'cancelled')
      AND COALESCE(category, '') != 'transfer'
    GROUP BY strftime('%Y-%m', posted_at)
    ORDER BY month
  `).all(months);
}

export function getCategoryBreakdown(db: Database.Database, days = 30): any[] {
  return db.prepare(`
    SELECT
      category,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as total,
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_out,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_in
    FROM mercury_transactions
    WHERE posted_at >= datetime('now', '-' || ? || ' days')
      AND status NOT IN ('failed', 'cancelled')
    GROUP BY category
    ORDER BY total_out DESC
  `).all(days);
}

export function getMonthlyPL(db: Database.Database, months = 6): any {
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m', posted_at) as month,
      category,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_in,
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_out,
      COUNT(*) as count
    FROM mercury_transactions
    WHERE posted_at >= datetime('now', '-' || ? || ' months')
      AND status NOT IN ('failed', 'cancelled')
      AND COALESCE(category, '') != 'transfer'
    GROUP BY month, category
    ORDER BY month
  `).all(months) as any[];

  // Build unique sorted month list
  const monthSet = new Set<string>();
  rows.forEach(r => monthSet.add(r.month));
  const monthList = [...monthSet].sort();
  const monthIdx = Object.fromEntries(monthList.map((m, i) => [m, i]));
  const n = monthList.length;

  // Build sections
  const sectionData: Record<string, Record<string, number[]>> = {};
  for (const sec of SECTION_ORDER) sectionData[sec] = {};

  for (const row of rows) {
    const cat = ACCOUNTING_CATEGORIES[row.category] || ACCOUNTING_CATEGORIES.other;
    if (!sectionData[cat.section][cat.subcategory]) {
      sectionData[cat.section][cat.subcategory] = new Array(n).fill(0);
    }
    const idx = monthIdx[row.month];
    // Revenue sections use total_in, expense sections use total_out (as positive numbers)
    if (cat.section === 'REVENUE') {
      sectionData[cat.section][cat.subcategory][idx] += row.total_in;
    } else {
      sectionData[cat.section][cat.subcategory][idx] += row.total_out;
    }
  }

  const sections = SECTION_ORDER.map(sec => {
    const subcats = Object.entries(sectionData[sec]).map(([name, amounts]) => ({
      name,
      glCode: Object.values(ACCOUNTING_CATEGORIES).find(c => c.subcategory === name)?.glCode || '',
      amounts,
    }));
    const totals = new Array(n).fill(0);
    subcats.forEach(sc => sc.amounts.forEach((a, i) => { totals[i] += a; }));
    return { name: SECTION_LABELS[sec] || sec, key: sec, subcategories: subcats, totals };
  });

  // Computed rows
  const rev = sections.find(s => s.key === 'REVENUE')?.totals || new Array(n).fill(0);
  const cogs = sections.find(s => s.key === 'COST_OF_REVENUE')?.totals || new Array(n).fill(0);
  const opex = sections.find(s => s.key === 'OPERATING_EXPENSES')?.totals || new Array(n).fill(0);
  const grossProfit = rev.map((r: number, i: number) => r - cogs[i]);
  const operatingIncome = grossProfit.map((gp: number, i: number) => gp - opex[i]);

  return {
    months: monthList,
    sections,
    computed: { grossProfit, operatingIncome },
  };
}

export function getSparklineData(db: Database.Database): any {
  const rows = db.prepare(`
    SELECT
      date(posted_at) as day,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as spend
    FROM mercury_transactions
    WHERE posted_at >= datetime('now', '-90 days')
      AND status NOT IN ('failed', 'cancelled')
    GROUP BY date(posted_at)
    ORDER BY day
  `).all() as any[];

  // Running balance approximation (current balance - cumulative reverse)
  const accounts = db.prepare('SELECT COALESCE(SUM(current_balance), 0) as total FROM mercury_accounts').get() as any;
  const currentBalance = accounts?.total || 0;

  // Build cumulative cash from the end
  let cumulative = 0;
  const cashPoints = rows.map((r: any) => {
    cumulative += (r.income - r.spend);
    return { date: r.day, value: currentBalance - (cumulative) + (r.income - r.spend) };
  });

  return {
    cash: cashPoints,
    spend: rows.map((r: any) => ({ date: r.day, value: r.spend })),
    revenue: rows.map((r: any) => ({ date: r.day, value: r.income })),
  };
}
