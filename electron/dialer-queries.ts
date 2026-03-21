/**
 * Dialer Queries — All local SQLite query functions for the AI Dialer.
 * Called by IPC handlers in ipc-handlers.ts.
 * Supabase removed — SQLite is the sole source of truth.
 */

import type Database from 'better-sqlite3';
import crypto from 'crypto';

// ── Helpers ──

function getSetting(db: Database.Database, key: string, envFallback: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  return (row?.value?.trim() || process.env[envFallback] || '').trim();
}

// ── Retell Phone Numbers ──

export async function fetchRetellPhoneNumbers(db: Database.Database): Promise<Array<{
  phone_number: string;
  phone_number_pretty: string;
  nickname: string | null;
  inbound_agent_id: string | null;
  outbound_agent_id: string | null;
}>> {
  const RETELL_API_KEY = getSetting(db, 'retell_api_key', 'RETELL_API_KEY');
  if (!RETELL_API_KEY) return []; // Not configured yet — return empty

  try {
    const response = await fetch('https://api.retellai.com/list-phone-numbers', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` },
    });

    if (!response.ok) {
      console.error(`[fetchRetellPhoneNumbers] API error ${response.status}`);
      return [];
    }

    const numbers = await response.json() as any[];
    return numbers.map(n => ({
      phone_number: n.phone_number,
      phone_number_pretty: n.phone_number_pretty || n.phone_number,
      nickname: n.nickname || null,
      inbound_agent_id: n.inbound_agent_id || null,
      outbound_agent_id: n.outbound_agent_id || null,
    }));
  } catch (err) {
    console.error('[fetchRetellPhoneNumbers] Network error:', err);
    return [];
  }
}

function generateUUID(): string {
  return crypto.randomUUID();
}

// ══════════════════════════════════════════════════════
// CALL GUARD — Local safety checks before any call
// ══════════════════════════════════════════════════════

export type CallGuardBlockReason =
  | 'dnc_listed'
  | 'final_outcome_set'
  | 'real_conversation'
  | 'called_recently'
  | 'cadence_not_due'
  | 'same_number_used';

export interface CallGuardVerdict {
  allowed: boolean;
  reason: CallGuardBlockReason | null;
  details: string | null;
  matchedCallId?: string;
  matchedCallDate?: string;
  matchedDuration?: number;
  matchedOutcome?: string;
}

/**
 * Check whether a call to this phone should be allowed.
 * Queries LOCAL SQLite only — instant, no network.
 */
export function checkCallGuard(
  db: Database.Database,
  phoneNormalized: string,
  leadId?: string,
  options?: { skipCadenceCheck?: boolean; fromNumber?: string }
): CallGuardVerdict {
  // 1. DNC check
  const dncRow = db.prepare(
    'SELECT id, reason FROM dialer_dnc_cache WHERE phone_normalized = ?'
  ).get(phoneNormalized) as any;
  if (dncRow) {
    return { allowed: false, reason: 'dnc_listed', details: dncRow.reason || 'On DNC list' };
  }

  // 1b. Same-number dedup — never call the same person from the same outbound number
  if (options?.fromNumber) {
    const sameNumberRow = db.prepare(`
      SELECT id, call_started_at, our_phone
      FROM dialer_call_records
      WHERE seller_phone_normalized = ?
        AND our_phone = ?
        AND call_direction = 'outbound'
      ORDER BY call_started_at DESC
      LIMIT 1
    `).get(phoneNormalized, options.fromNumber) as any;

    if (sameNumberRow) {
      return {
        allowed: false,
        reason: 'same_number_used',
        details: `Already called from ${options.fromNumber} on ${sameNumberRow.call_started_at}`,
        matchedCallId: sameNumberRow.id,
        matchedCallDate: sameNumberRow.call_started_at,
      };
    }
  }

  // 2. Final outcome check
  const leadRow = db.prepare(
    'SELECT final_outcome, last_contact_at, ai_cadence_on, next_call_date FROM dialer_leads_cache WHERE phone_normalized = ? LIMIT 1'
  ).get(phoneNormalized) as any;

  if (leadRow?.final_outcome) {
    return {
      allowed: false,
      reason: 'final_outcome_set',
      details: `Lead has outcome: ${leadRow.final_outcome}`,
      matchedOutcome: leadRow.final_outcome,
    };
  }

  // 3. Real conversation check (duration >= 30s AND successful or has transcript)
  const convRow = db.prepare(`
    SELECT id, call_started_at, duration_seconds, transcript
    FROM dialer_call_records
    WHERE seller_phone_normalized = ?
      AND call_direction = 'outbound'
      AND duration_seconds >= 30
      AND (call_successful = 1 OR (transcript IS NOT NULL AND transcript != ''))
    ORDER BY call_started_at DESC
    LIMIT 1
  `).get(phoneNormalized) as any;

  if (convRow) {
    return {
      allowed: false,
      reason: 'real_conversation',
      details: `Had ${convRow.duration_seconds}s conversation on ${convRow.call_started_at}`,
      matchedCallId: convRow.id,
      matchedCallDate: convRow.call_started_at,
      matchedDuration: convRow.duration_seconds,
    };
  }

  // 4. 24-hour recency check
  const recentRow = db.prepare(`
    SELECT id, call_started_at, duration_seconds
    FROM dialer_call_records
    WHERE seller_phone_normalized = ?
      AND call_direction = 'outbound'
      AND call_started_at >= datetime('now', '-24 hours')
    ORDER BY call_started_at DESC
    LIMIT 1
  `).get(phoneNormalized) as any;

  if (recentRow) {
    return {
      allowed: false,
      reason: 'called_recently',
      details: `Called at ${recentRow.call_started_at} (within 24h)`,
      matchedCallId: recentRow.id,
      matchedCallDate: recentRow.call_started_at,
    };
  }

  // 4b. Fallback: check lead-level last_contact_at if no local call records
  if (leadRow?.last_contact_at) {
    const lastContactDate = new Date(leadRow.last_contact_at);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (lastContactDate > twentyFourHoursAgo) {
      return {
        allowed: false,
        reason: 'called_recently',
        details: `Lead last_contact_at: ${leadRow.last_contact_at} (within 24h)`,
      };
    }
  }

  // 5. Cadence schedule check (optional)
  if (!options?.skipCadenceCheck && leadRow?.ai_cadence_on === 1 && leadRow?.next_call_date) {
    const nextDate = new Date(leadRow.next_call_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (nextDate > today) {
      return {
        allowed: false,
        reason: 'cadence_not_due',
        details: `Next cadence call scheduled for ${leadRow.next_call_date}`,
      };
    }
  }

  return { allowed: true, reason: null, details: null };
}

/**
 * Log a blocked (or overridden) call attempt for auditing.
 */
export function logCallGuardBlock(
  db: Database.Database,
  phoneNormalized: string,
  leadId: string | null,
  leadName: string | null,
  verdict: CallGuardVerdict,
  caller: 'single_call' | 'batch_dial' | 'cadence',
  overrideUsed: boolean = false
): void {
  try {
    db.prepare(`
      INSERT INTO dialer_call_guard_log
        (lead_id, phone_normalized, lead_name, block_reason, block_details, caller, override_used)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      leadId,
      phoneNormalized,
      leadName,
      verdict.reason,
      JSON.stringify({
        details: verdict.details,
        matchedCallId: verdict.matchedCallId,
        matchedCallDate: verdict.matchedCallDate,
        matchedDuration: verdict.matchedDuration,
        matchedOutcome: verdict.matchedOutcome,
      }),
      caller,
      overrideUsed ? 1 : 0
    );
  } catch (err) {
    console.error('[CallGuard] Failed to log block:', err instanceof Error ? err.message : err);
  }
}

// ══════════════════════════════════════════════════════
// READ QUERIES — All local SQLite
// ══════════════════════════════════════════════════════

// ── Call Queue (replaces v_dashboard_call_queue_priority view) ──

export function getCallQueue(db: Database.Database, limit = 50, listIds?: string[]): any[] {
  let listFilter = '';
  const params: any[] = [];

  if (listIds && listIds.length > 0) {
    const placeholders = listIds.map(() => '?').join(',');
    listFilter = `AND l.list_id IN (${placeholders})`;
    params.push(...listIds);
  }

  params.push(limit);

  return db.prepare(`
    SELECT l.*,
      (SELECT c.sentiment FROM dialer_call_records c
       WHERE c.seller_phone_normalized = l.phone_normalized
       ORDER BY c.call_started_at DESC LIMIT 1) as last_sentiment,
      (SELECT c.custom_analysis FROM dialer_call_records c
       WHERE c.seller_phone_normalized = l.phone_normalized
         AND c.custom_analysis IS NOT NULL AND c.custom_analysis != ''
       ORDER BY c.call_started_at DESC LIMIT 1) as last_review_json
    FROM dialer_leads_cache l
    WHERE l.can_call_now = 1
      AND l.final_outcome IS NULL
      ${listFilter}
      AND l.phone_normalized NOT IN (
        SELECT phone_normalized FROM dialer_dnc_cache
      )
      AND l.phone_normalized NOT IN (
        SELECT seller_phone_normalized FROM dialer_call_records
        WHERE call_direction = 'outbound'
          AND seller_phone_normalized IS NOT NULL AND seller_phone_normalized != ''
          AND duration_seconds >= 30
          AND (call_successful = 1 OR (transcript IS NOT NULL AND transcript != ''))
      )
      AND l.phone_normalized NOT IN (
        SELECT seller_phone_normalized FROM dialer_call_records
        WHERE call_direction = 'outbound'
          AND seller_phone_normalized IS NOT NULL AND seller_phone_normalized != ''
          AND call_started_at >= datetime('now', '-24 hours')
      )
    ORDER BY l.priority_score DESC
    LIMIT ?
  `).all(...params);
}

// ── Get all leads in a list (no cadence filtering) ──

export function getLeadsByList(db: Database.Database, listIds: string[], limit = 500): any[] {
  if (!listIds || listIds.length === 0) return [];
  const placeholders = listIds.map(() => '?').join(',');

  return db.prepare(`
    SELECT l.*,
      CASE WHEN l.can_call_now = 1
        AND l.phone_normalized NOT IN (SELECT phone_normalized FROM dialer_dnc_cache)
        AND l.phone_normalized NOT IN (
          SELECT seller_phone_normalized FROM dialer_call_records
          WHERE call_direction = 'outbound'
            AND seller_phone_normalized IS NOT NULL AND seller_phone_normalized != ''
            AND duration_seconds >= 30
            AND (call_successful = 1 OR (transcript IS NOT NULL AND transcript != ''))
        )
        AND l.phone_normalized NOT IN (
          SELECT seller_phone_normalized FROM dialer_call_records
          WHERE call_direction = 'outbound'
            AND seller_phone_normalized IS NOT NULL AND seller_phone_normalized != ''
            AND call_started_at >= datetime('now', '-24 hours')
        )
      THEN 1 ELSE 0 END as is_dialable,
      (SELECT c.sentiment FROM dialer_call_records c
       WHERE c.seller_phone_normalized = l.phone_normalized
       ORDER BY c.call_started_at DESC LIMIT 1) as last_sentiment,
      (SELECT c.custom_analysis FROM dialer_call_records c
       WHERE c.seller_phone_normalized = l.phone_normalized
         AND c.custom_analysis IS NOT NULL AND c.custom_analysis != ''
       ORDER BY c.call_started_at DESC LIMIT 1) as last_review_json
    FROM dialer_leads_cache l
    WHERE l.list_id IN (${placeholders})
      AND l.final_outcome IS NULL
    ORDER BY is_dialable DESC, l.priority_score DESC
    LIMIT ?
  `).all(...listIds, limit);
}

// ── Dialer Lists ──

export function getDialerLists(db: Database.Database): any[] {
  return db.prepare(`
    SELECT dl.*,
      (SELECT COUNT(*) FROM dialer_leads_cache lc WHERE lc.list_id = dl.id) as actual_lead_count
    FROM dialer_lists dl
    ORDER BY dl.created_at DESC
  `).all();
}

// ── Call History ──

export function getCallHistory(
  db: Database.Database,
  limit = 100,
  filters?: { status?: string; sentiment?: string; direction?: string }
): any[] {
  let sql = 'SELECT * FROM dialer_call_records';
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.status) { conditions.push('call_status = ?'); params.push(filters.status); }
  if (filters?.sentiment) { conditions.push('sentiment = ?'); params.push(filters.sentiment); }
  if (filters?.direction) { conditions.push('call_direction = ?'); params.push(filters.direction); }

  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY call_started_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

// ── Calls for a specific lead ──

export function getCallsForLead(db: Database.Database, phoneNormalized: string): any[] {
  return db.prepare(`
    SELECT * FROM dialer_call_records
    WHERE seller_phone_normalized = ?
    ORDER BY call_started_at DESC
  `).all(phoneNormalized);
}

// ── Single lead ──

export function getLeadById(db: Database.Database, id: string): any | null {
  return db.prepare('SELECT * FROM dialer_leads_cache WHERE id = ?').get(id) || null;
}

// ── Conversation memory ──

export function getLeadMemory(db: Database.Database, phoneNormalized: string): any | null {
  return db.prepare(
    'SELECT * FROM dialer_conversation_memory WHERE phone_normalized = ?'
  ).get(phoneNormalized) || null;
}

// ── DNC List ──

export function getDNCList(db: Database.Database): any[] {
  return db.prepare('SELECT * FROM dialer_dnc_cache ORDER BY added_at DESC').all();
}

// ── DNC Stats ──

export function getDNCStats(db: Database.Database): any {
  const entries = db.prepare('SELECT source FROM dialer_dnc_cache').all() as any[];
  return {
    total: entries.length,
    autoDetected: entries.filter(d => d.source === 'Auto-Detected' || d.source === 'Not Interested').length,
    fub: entries.filter(d => d.source === 'Follow Up Boss').length,
    manual: entries.filter(d => d.source === 'Manually Uploaded').length,
  };
}

// ── Daily Stats (replaces v_dashboard_daily_stats view) ──

export function getDailyStats(db: Database.Database, days = 30): any[] {
  return db.prepare(`
    SELECT
      date(call_started_at) as call_date,
      COUNT(*) as total_calls,
      SUM(CASE WHEN call_successful = 1 THEN 1 ELSE 0 END) as successful_calls,
      SUM(CASE WHEN call_direction = 'outbound' THEN 1 ELSE 0 END) as outbound_calls,
      SUM(CASE WHEN call_direction = 'inbound' THEN 1 ELSE 0 END) as inbound_calls,
      ROUND(AVG(duration_seconds), 1) as avg_duration,
      SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive_sentiment,
      SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative_sentiment,
      SUM(cost_cents) as total_cost_cents,
      ROUND(
        CAST(SUM(CASE WHEN call_successful = 1 THEN 1 ELSE 0 END) AS REAL) /
        NULLIF(COUNT(*), 0) * 100,
        1
      ) as connect_rate
    FROM dialer_call_records
    WHERE call_started_at IS NOT NULL
    GROUP BY date(call_started_at)
    ORDER BY call_date DESC
    LIMIT ?
  `).all(days);
}

// ── Hot Leads (replaces v_dashboard_hot_leads view) ──

export function getHotLeads(db: Database.Database): any[] {
  return db.prepare(`
    SELECT * FROM dialer_leads_cache
    WHERE rapport_level = 'hot'
      AND final_outcome IS NULL
    ORDER BY priority_score DESC
    LIMIT 20
  `).all();
}

// ── Callbacks Due (replaces v_dashboard_callbacks_with_calls view) ──

export function getCallbacksDue(db: Database.Database): any[] {
  return db.prepare(`
    SELECT l.*,
      (SELECT MAX(call_started_at) FROM dialer_call_records c
       WHERE c.seller_phone_normalized = l.phone_normalized) as last_call_at,
      (SELECT COUNT(*) FROM dialer_call_records c
       WHERE c.seller_phone_normalized = l.phone_normalized) as total_calls
    FROM dialer_leads_cache l
    WHERE l.callback_requested = 1
      AND l.phone_normalized NOT IN (
        SELECT phone_normalized FROM dialer_dnc_cache
        WHERE phone_normalized IS NOT NULL AND phone_normalized != ''
      )
    ORDER BY l.callback_datetime ASC
  `).all();
}

// ── Today Call Count ──

export function getTodayCallCount(db: Database.Database): number {
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM dialer_call_records WHERE call_started_at >= ?"
  ).get(`${today}T00:00:00`) as any;
  return row?.cnt || 0;
}

// ── Inbound Calls ──

export function getInboundCalls(db: Database.Database, limit = 20): any[] {
  return db.prepare(`
    SELECT * FROM dialer_call_records
    WHERE call_direction = 'inbound'
    ORDER BY call_started_at DESC
    LIMIT ?
  `).all(limit);
}

// ── Un-reviewed calls (for AI reviewer) ──

export function getUnreviewedCalls(db: Database.Database, limit = 10): any[] {
  return db.prepare(`
    SELECT * FROM dialer_call_records
    WHERE transcript IS NOT NULL AND transcript != ''
      AND custom_analysis IS NULL
    ORDER BY call_started_at DESC
    LIMIT ?
  `).all(limit);
}

// ══════════════════════════════════════════════════════
// WRITE OPERATIONS — All local SQLite
// ══════════════════════════════════════════════════════

// ── DNC Management ──

export function addManualDNC(db: Database.Database, phone: string, reason: string): void {
  const phoneDigits = phone.replace(/\D/g, '');
  const normalized = phoneDigits.length === 11 && phoneDigits.startsWith('1')
    ? `+${phoneDigits}`
    : `+1${phoneDigits.slice(-10)}`;

  db.prepare(`
    INSERT OR REPLACE INTO dialer_dnc_cache
      (id, phone_normalized, source, reason, dnc_type, added_at)
    VALUES (?, ?, 'Manually Uploaded', ?, 'permanent', datetime('now'))
  `).run(`dnc_manual_${normalized}`, normalized, reason);
}

export function removeFromDNC(db: Database.Database, phone: string): void {
  const phoneDigits = phone.replace(/\D/g, '');
  const normalized = phoneDigits.length === 11 && phoneDigits.startsWith('1')
    ? `+${phoneDigits}`
    : `+1${phoneDigits.slice(-10)}`;

  db.prepare('DELETE FROM dialer_dnc_cache WHERE phone_normalized = ?').run(normalized);
}

// ── Update call with AI review ──

export function updateCallReview(db: Database.Database, callId: string, review: any): void {
  db.prepare(
    'UPDATE dialer_call_records SET custom_analysis = ? WHERE id = ?'
  ).run(typeof review === 'string' ? review : JSON.stringify(review), callId);
}

// ── Mark lead as DNC (from AI review) ──

export function markLeadDNC(db: Database.Database, phoneNormalized: string, reason: string): void {
  db.prepare(`
    UPDATE dialer_leads_cache SET
      final_outcome = 'DNC',
      final_outcome_date = datetime('now'),
      final_outcome_reason = ?,
      ai_cadence_on = 0
    WHERE phone_normalized = ?
  `).run(reason, phoneNormalized);

  // Also add to DNC cache
  db.prepare(`
    INSERT OR IGNORE INTO dialer_dnc_cache
      (id, phone_normalized, source, reason, dnc_type, added_at)
    VALUES (?, ?, 'Auto-Detected', ?, 'permanent', datetime('now'))
  `).run(`dnc_auto_${phoneNormalized}`, phoneNormalized, reason);
}

// ── Mark lead as hot (from AI review) ──

export function markLeadHot(db: Database.Database, phoneNormalized: string): void {
  db.prepare(
    "UPDATE dialer_leads_cache SET rapport_level = 'hot' WHERE phone_normalized = ?"
  ).run(phoneNormalized);
}

// ── Lead Actions (from LeadDetailSlideOver) ──

export function setLeadOutcome(
  db: Database.Database,
  phoneNormalized: string,
  outcome: string,
  reason?: string
): void {
  db.prepare(`
    UPDATE dialer_leads_cache SET
      final_outcome = ?,
      final_outcome_date = datetime('now'),
      final_outcome_reason = ?,
      ai_cadence_on = 0,
      updated_at = datetime('now')
    WHERE phone_normalized = ?
  `).run(outcome, reason || null, phoneNormalized);
}

export function setLeadCallback(
  db: Database.Database,
  phoneNormalized: string,
  callbackDatetime: string | null
): void {
  if (callbackDatetime) {
    db.prepare(`
      UPDATE dialer_leads_cache SET
        callback_requested = 1,
        callback_datetime = ?,
        updated_at = datetime('now')
      WHERE phone_normalized = ?
    `).run(callbackDatetime, phoneNormalized);
  } else {
    db.prepare(`
      UPDATE dialer_leads_cache SET
        callback_requested = 0,
        callback_datetime = NULL,
        updated_at = datetime('now')
      WHERE phone_normalized = ?
    `).run(phoneNormalized);
  }
}

export function addLeadNote(
  db: Database.Database,
  phoneNormalized: string,
  note: string
): { id: string } {
  const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO dialer_lead_notes (id, phone_normalized, note, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(id, phoneNormalized, note);
  return { id };
}

export function getLeadNotes(
  db: Database.Database,
  phoneNormalized: string
): any[] {
  return db.prepare(`
    SELECT * FROM dialer_lead_notes
    WHERE phone_normalized = ?
    ORDER BY created_at DESC
  `).all(phoneNormalized);
}

export function deleteLeadNote(
  db: Database.Database,
  noteId: string
): void {
  db.prepare('DELETE FROM dialer_lead_notes WHERE id = ?').run(noteId);
}

export function clearLeadOutcome(
  db: Database.Database,
  phoneNormalized: string
): void {
  db.prepare(`
    UPDATE dialer_leads_cache SET
      final_outcome = NULL,
      final_outcome_date = NULL,
      final_outcome_reason = NULL,
      ai_cadence_on = 1,
      updated_at = datetime('now')
    WHERE phone_normalized = ?
  `).run(phoneNormalized);
}

// ── Lead Search (for CommandPalette) ──

export function searchLeads(
  db: Database.Database,
  query: string,
  limit: number = 20
): any[] {
  const q = `%${query}%`;
  return db.prepare(`
    SELECT id, phone_normalized, first_name, last_name, county, state,
           rapport_level, final_outcome, list_name
    FROM dialer_leads_cache
    WHERE first_name LIKE ? OR last_name LIKE ? OR phone_normalized LIKE ?
    ORDER BY priority_score DESC
    LIMIT ?
  `).all(q, q, q, limit);
}

// ── Call History with Pagination ──

export function getCallHistoryPaginated(
  db: Database.Database,
  limit: number = 50,
  offset: number = 0,
  filters?: { direction?: string; sentiment?: string }
): { calls: any[]; total: number } {
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (filters?.direction && filters.direction !== 'all') {
    where += ' AND call_direction = ?';
    params.push(filters.direction);
  }
  if (filters?.sentiment && filters.sentiment !== 'all') {
    where += ' AND sentiment = ?';
    params.push(filters.sentiment);
  }

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM dialer_call_records ${where}`).get(...params) as any).cnt;

  const calls = db.prepare(`
    SELECT * FROM dialer_call_records
    ${where}
    ORDER BY call_started_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { calls, total };
}

// ── Trigger Cadence ──

export async function triggerCadence(
  db: Database.Database,
  onProgress: (status: any) => void
): Promise<any> {
  const leads = db.prepare(`
    SELECT id FROM dialer_leads_cache
    WHERE ai_cadence_on = 1
      AND can_call_now = 1
      AND final_outcome IS NULL
    ORDER BY priority_score DESC
    LIMIT 50
  `).all() as any[];

  if (leads.length === 0) {
    return { success: true, message: 'No leads due for cadence calls', dialed: 0 };
  }

  console.log(`[triggerCadence] Found ${leads.length} cadence-eligible leads, starting batch dial...`);
  const leadIds = leads.map((l: any) => l.id);
  return batchDialLeads(db, leadIds, 10, 30000, onProgress, false);
}

// ── Call a specific lead via Retell API ──

export async function callLead(
  db: Database.Database,
  lead: {
    id: string;
    phone_number?: string;
    phone_normalized?: string;
    first_name?: string;
    last_name?: string;
    county?: string;
    state?: string;
    parcel_acres?: number;
    market_value?: number;
    retell_agent_id?: string;
    from_number?: string;
  },
  guardOptions?: { forceOverride?: boolean; caller?: 'single_call' | 'batch_dial' | 'cadence' }
) {
  const RETELL_API_KEY = getSetting(db, 'retell_api_key', 'RETELL_API_KEY');
  const DEFAULT_AGENT_ID = getSetting(db, 'retell_agent_id', 'RETELL_AGENT_ID');
  const DEFAULT_FROM_NUMBER = getSetting(db, 'retell_from_number', 'RETELL_FROM_NUMBER');

  if (!RETELL_API_KEY) throw new Error('Retell API key not configured — set it in Settings.');
  if (!DEFAULT_AGENT_ID) throw new Error('Retell Agent ID not configured — set it in Settings.');

  // Normalize phone to E.164 format (+1XXXXXXXXXX)
  const rawPhone = lead.phone_number || lead.phone_normalized || '';
  const phoneDigits = rawPhone.replace(/\D/g, '');
  const e164Digits = phoneDigits.length === 11 && phoneDigits.startsWith('1')
    ? phoneDigits
    : `1${phoneDigits.slice(-10)}`;
  if (e164Digits.length !== 11) {
    throw new Error(`Invalid phone number: "${rawPhone}" (need 10+ digits)`);
  }
  const e164Phone = `+${e164Digits}`;

  // ── CALL GUARD — local safety check ──
  const phoneForGuard = lead.phone_normalized || e164Phone;
  const callerType = guardOptions?.caller || 'single_call';
  const fromNum = lead.from_number || DEFAULT_FROM_NUMBER || undefined;
  const verdict = checkCallGuard(db, phoneForGuard, lead.id, {
    skipCadenceCheck: callerType === 'cadence',
    fromNumber: fromNum,
  });

  if (!verdict.allowed) {
    const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null;
    // same_number_used can NEVER be overridden — hard block
    if (verdict.reason === 'same_number_used') {
      logCallGuardBlock(db, phoneForGuard, lead.id, leadName, verdict, callerType, false);
      console.warn(`[callLead] HARD BLOCKED: ${verdict.reason} for ${phoneForGuard}: ${verdict.details}`);
      throw new Error(`Call blocked: ${verdict.details}`);
    }
    if (guardOptions?.forceOverride) {
      logCallGuardBlock(db, phoneForGuard, lead.id, leadName, verdict, callerType, true);
      console.warn(`[callLead] GUARD OVERRIDE: ${verdict.reason} for ${phoneForGuard} — proceeding`);
    } else {
      logCallGuardBlock(db, phoneForGuard, lead.id, leadName, verdict, callerType, false);
      console.warn(`[callLead] BLOCKED: ${verdict.reason} for ${phoneForGuard}: ${verdict.details}`);
      throw new Error(`Call blocked: ${verdict.details}`);
    }
  }

  const response = await fetch('https://api.retellai.com/v2/create-phone-call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RETELL_API_KEY}`,
    },
    body: JSON.stringify({
      agent_id: lead.retell_agent_id || DEFAULT_AGENT_ID,
      from_number: lead.from_number || DEFAULT_FROM_NUMBER || undefined,
      to_number: e164Phone,
      metadata: {
        lead_id: lead.id,
        manual_call: true,
      },
      retell_llm_dynamic_variables: {
        call_direction: 'outbound',
        first_name: lead.first_name || '',
        county: lead.county || '',
        state: lead.state || '',
        acres: String(lead.parcel_acres || ''),
        market_value: String(lead.market_value || ''),
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Retell API error ${response.status}: ${body}`);
  }

  const result = await response.json();

  // Update lead tracking: last_outbound_at, last_called_by, total_call_attempts
  const actualFromNumber = lead.from_number || DEFAULT_FROM_NUMBER || null;
  db.prepare(`
    UPDATE dialer_leads_cache SET
      last_outbound_at = datetime('now'),
      last_called_by = ?,
      last_called_at = datetime('now'),
      total_call_attempts = COALESCE(total_call_attempts, 0) + 1
    WHERE id = ?
  `).run(actualFromNumber, lead.id);

  return { call_id: result.call_id, status: result.call_status || 'initiated' };
}

// ── Batch Auto-Dial ──

// Track phones currently being dialed to prevent concurrent duplicate calls
const activeDialingPhones = new Set<string>();

// Campaign pause/resume state
let batchPaused = false;
let batchPauseResolve: (() => void) | null = null;

export function pauseBatchDial(): void {
  batchPaused = true;
}

export function resumeBatchDial(): void {
  batchPaused = false;
  if (batchPauseResolve) {
    batchPauseResolve();
    batchPauseResolve = null;
  }
}

export function isBatchPaused(): boolean {
  return batchPaused;
}

function waitForResume(): Promise<void> {
  if (!batchPaused) return Promise.resolve();
  return new Promise(resolve => {
    batchPauseResolve = resolve;
  });
}

export async function batchDialLeads(
  db: Database.Database,
  leadIds: string[],
  batchSize: number = 10,
  delayMs: number = 30000,
  onProgress: (status: any) => void,
  forceOverride: boolean = false,
  fromNumbers: string[] = []
): Promise<any> {
  if (batchSize > 10) batchSize = 10;

  const sessionId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();
  const totalBatches = Math.ceil(leadIds.length / batchSize);
  const details: any[] = [];
  let dialedCount = 0;
  let errors = 0;
  let skippedDnc = 0;
  let skippedGuard = 0;
  let numberIndex = 0;

  // Per-number stats tracking
  const numberStats: Record<string, { dialed: number; connected: number; noAnswer: number; failed: number }> = {};
  for (const num of fromNumbers) {
    numberStats[num] = { dialed: 0, connected: 0, noAnswer: 0, failed: 0 };
  }

  db.prepare(`
    INSERT INTO dialer_batch_dial_state (id, status, total_leads, batch_size, delay_seconds, lead_ids, started_at)
    VALUES (?, 'running', ?, ?, ?, ?, datetime('now'))
  `).run(sessionId, leadIds.length, batchSize, Math.round(delayMs / 1000), JSON.stringify(leadIds));

  const placeholders = leadIds.map(() => '?').join(',');
  const leads = db.prepare(`SELECT * FROM dialer_leads_cache WHERE id IN (${placeholders})`).all(...leadIds) as any[];
  const leadMap = new Map(leads.map(l => [l.id, l]));

  // Helper: call with 429 retry + exponential backoff
  async function callWithRetry(lead: any, fromNumber: string | undefined, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await callLead(db, {
          id: lead.id,
          phone_normalized: lead.phone_normalized,
          phone_number: lead.phone_number,
          first_name: lead.first_name,
          last_name: lead.last_name,
          county: lead.county,
          state: lead.state,
          parcel_acres: lead.parcel_acres,
          market_value: lead.market_value,
          from_number: fromNumber,
        }, { forceOverride: forceOverride, caller: 'batch_dial' });
      } catch (err: any) {
        const is429 = err.message?.includes('429') || err.message?.includes('rate limit');
        if (is429 && attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 5000 * (attempt + 1))); // 5s, 10s, 15s backoff
          continue;
        }
        throw err;
      }
    }
  }

  try {
    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * batchSize;
      const batchLeadIds = leadIds.slice(batchStart, batchStart + batchSize);

      const promises = batchLeadIds.map(async (leadId) => {
        const lead = leadMap.get(leadId);
        if (!lead) {
          errors++;
          details.push({ leadId, phone: '', status: 'error', error: 'Lead not found in cache' });
          return;
        }

        // Deduplication guard: prevent dialing a phone already in-flight
        if (activeDialingPhones.has(lead.phone_normalized)) {
          skippedGuard++;
          details.push({
            leadId,
            phone: lead.phone_normalized,
            status: 'guard_blocked',
            guardReason: 'already_in_flight',
            guardDetails: 'This phone is already being dialed in another batch',
          });
          return;
        }

        // Round-robin number selection with throttle + same-number dedup
        let currentFromNumber = fromNumbers.length > 0
          ? fromNumbers[numberIndex++ % fromNumbers.length]
          : undefined;

        if (currentFromNumber && fromNumbers.length > 0) {
          // Find a number that is: (a) not throttled, (b) hasn't called this person before
          let tried = 0;
          let foundValid = false;
          while (tried < fromNumbers.length) {
            // Check throttle first
            const { throttled, reason: throttleReason } = isNumberThrottled(db, currentFromNumber);
            if (throttled) {
              console.log(`[batchDial] ${currentFromNumber} throttled: ${throttleReason}, trying next`);
              currentFromNumber = fromNumbers[numberIndex++ % fromNumbers.length];
              tried++;
              continue;
            }
            // Check same-number dedup
            const sameNumCheck = db.prepare(`
              SELECT 1 FROM dialer_call_records
              WHERE seller_phone_normalized = ? AND our_phone = ? AND call_direction = 'outbound'
              LIMIT 1
            `).get(lead.phone_normalized, currentFromNumber);
            if (sameNumCheck) {
              currentFromNumber = fromNumbers[numberIndex++ % fromNumbers.length];
              tried++;
              continue;
            }
            foundValid = true;
            break;
          }
          if (!foundValid) {
            // Check why: all throttled or all used?
            const allThrottled = fromNumbers.every(n => isNumberThrottled(db, n).throttled);
            if (allThrottled) {
              skippedGuard++;
              details.push({
                leadId,
                phone: lead.phone_normalized,
                status: 'guard_blocked',
                guardReason: 'all_numbers_throttled',
                guardDetails: 'All campaign numbers have hit their call limits',
              });
              // If all numbers are throttled, stop the entire batch
              onProgress({
                sessionId,
                status: 'throttled' as const,
                totalLeads: leadIds.length,
                dialedCount,
                currentBatch: batchIdx + 1,
                totalBatches,
                currentLeadName: null,
                errors,
                skippedDnc,
                skippedGuard,
                numberStats,
                throttleReason: 'All numbers hit daily/hourly limits',
              });
              // Break outer loop
              throw new Error('ALL_NUMBERS_THROTTLED');
            }
            skippedGuard++;
            details.push({
              leadId,
              phone: lead.phone_normalized,
              status: 'guard_blocked',
              guardReason: 'same_number_used',
              guardDetails: 'All campaign numbers have already called this person',
            });
            return;
          }
        }

        const verdict = checkCallGuard(db, lead.phone_normalized, lead.id, { fromNumber: currentFromNumber });
        if (!verdict.allowed && !forceOverride) {
          // same_number_used should NEVER be overridden even with forceOverride
          if (verdict.reason === 'dnc_listed') skippedDnc++;
          skippedGuard++;
          const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null;
          logCallGuardBlock(db, lead.phone_normalized, lead.id, leadName, verdict, 'batch_dial', false);
          details.push({
            leadId,
            phone: lead.phone_normalized,
            status: 'guard_blocked',
            guardReason: verdict.reason,
            guardDetails: verdict.details,
          });
          return;
        }
        // same_number_used can NEVER be force-overridden
        if (verdict.reason === 'same_number_used') {
          skippedGuard++;
          const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null;
          logCallGuardBlock(db, lead.phone_normalized, lead.id, leadName, verdict, 'batch_dial', false);
          details.push({
            leadId,
            phone: lead.phone_normalized,
            status: 'guard_blocked',
            guardReason: verdict.reason,
            guardDetails: verdict.details,
          });
          return;
        }

        activeDialingPhones.add(lead.phone_normalized);
        try {
          const result = await callWithRetry(lead, currentFromNumber);
          dialedCount++;
          if (currentFromNumber && numberStats[currentFromNumber]) {
            numberStats[currentFromNumber].dialed++;
          }
          details.push({
            leadId,
            phone: lead.phone_normalized,
            status: 'dialed',
            callId: result?.call_id,
            fromNumber: currentFromNumber,
          });
        } catch (err: any) {
          errors++;
          if (currentFromNumber && numberStats[currentFromNumber]) {
            numberStats[currentFromNumber].failed++;
          }
          details.push({
            leadId,
            phone: lead.phone_normalized,
            status: 'error',
            error: err.message,
            fromNumber: currentFromNumber,
          });
        } finally {
          activeDialingPhones.delete(lead.phone_normalized);
        }
      });

      await Promise.all(promises);

      onProgress({
        sessionId,
        status: 'running' as const,
        totalLeads: leadIds.length,
        dialedCount,
        currentBatch: batchIdx + 1,
        totalBatches,
        currentLeadName: null,
        currentFromNumber: fromNumbers.length > 0
          ? fromNumbers[(numberIndex - 1) % fromNumbers.length]
          : undefined,
        errors,
        skippedDnc,
        skippedGuard,
        numberStats,
      });

      db.prepare('UPDATE dialer_batch_dial_state SET dialed_count = ?, current_batch = ? WHERE id = ?')
        .run(dialedCount, batchIdx + 1, sessionId);

      if (batchIdx < totalBatches - 1) {
        // Check pause state between batches
        if (batchPaused) {
          onProgress({
            sessionId,
            status: 'paused' as const,
            totalLeads: leadIds.length,
            dialedCount,
            currentBatch: batchIdx + 1,
            totalBatches,
            currentLeadName: null,
            errors,
            skippedDnc,
            skippedGuard,
            numberStats,
          });
          await waitForResume();
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    db.prepare("UPDATE dialer_batch_dial_state SET status = 'completed', dialed_count = ?, results = ?, completed_at = datetime('now') WHERE id = ?")
      .run(dialedCount, JSON.stringify({ details, numberStats }), sessionId);

    const finalResult = {
      sessionId,
      totalLeads: leadIds.length,
      dialed: dialedCount,
      connected: 0,
      failed: errors,
      skippedDnc,
      skippedGuard,
      durationSeconds,
      details,
      numberStats,
    };

    // Fire-and-forget Slack summary
    sendSlackCampaignSummary(db, finalResult).catch(() => {});

    return finalResult;
  } catch (err: any) {
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const isThrottled = err.message === 'ALL_NUMBERS_THROTTLED';
    const status = isThrottled ? 'throttled' : 'failed';
    db.prepare(`UPDATE dialer_batch_dial_state SET status = ?, dialed_count = ?, results = ?, completed_at = datetime('now') WHERE id = ?`)
      .run(status, dialedCount, JSON.stringify({ error: err.message, details, numberStats }), sessionId);
    if (isThrottled) {
      const throttledResult = {
        sessionId,
        totalLeads: leadIds.length,
        dialed: dialedCount,
        connected: 0,
        failed: errors,
        skippedDnc,
        skippedGuard,
        durationSeconds,
        details,
        numberStats,
        throttled: true,
        throttleReason: 'All numbers hit daily/hourly limits',
      };
      sendSlackCampaignSummary(db, throttledResult).catch(() => {});
      return throttledResult;
    }
    throw err;
  }
}

// ── Slack Campaign Summary ──

async function sendSlackCampaignSummary(db: Database.Database, result: any): Promise<void> {
  try {
    const webhookUrl = getSetting(db, 'slack_webhook_url', 'SLACK_WEBHOOK_URL');
    if (!webhookUrl) return;

    const dialed = result.dialed ?? 0;
    const connected = result.connected ?? 0;
    const failed = result.failed ?? 0;
    const guarded = result.skippedGuard ?? 0;
    const dnc = result.skippedDnc ?? 0;
    const total = result.totalLeads ?? 0;
    const durationMin = Math.round((result.durationSeconds ?? 0) / 60);
    const connectRate = dialed > 0 ? Math.round((connected / dialed) * 100) : 0;

    // Best performing number
    let bestNumber = '';
    const ns = result.numberStats as Record<string, { dialed: number; connected: number }> | undefined;
    if (ns) {
      let bestRate = -1;
      for (const [phone, stats] of Object.entries(ns)) {
        const rate = stats.dialed > 0 ? stats.connected / stats.dialed : 0;
        if (rate > bestRate && stats.dialed >= 3) {
          bestRate = rate;
          bestNumber = phone.replace('+1', '').replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
        }
      }
    }

    const text = [
      `📞 *Campaign Complete* — ${total} leads in ${durationMin}m`,
      `✅ Dialed: ${dialed} | Connected: ${connected} (${connectRate}%)`,
      guarded > 0 ? `🛡️ Guard blocked: ${guarded}${dnc > 0 ? ` (${dnc} DNC)` : ''}` : null,
      failed > 0 ? `❌ Failed: ${failed}` : null,
      bestNumber ? `🏆 Best number: ${bestNumber}` : null,
      result.throttled ? '⚠️ Campaign stopped early: all numbers hit throttle limits' : null,
    ].filter(Boolean).join('\n');

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('[SlackCampaignSummary] Error:', err instanceof Error ? err.message : err);
  }
}

// ── Number Health Stats (Scam Likely Detection) ──

export function getNumberHealthStats(
  db: Database.Database,
  fromNumbers: string[],
  windowHours: number = 24
): Array<{ phone: string; totalCalls: number; connected: number; connectRate: number; flagged: boolean }> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  return fromNumbers.map(phone => {
    const row = db.prepare(`
      SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN call_status IN ('completed', 'connected') THEN 1 ELSE 0 END) as connected
      FROM dialer_call_records
      WHERE our_phone = ? AND call_started_at >= ?
    `).get(phone, cutoff) as any;

    const totalCalls = row?.total_calls || 0;
    const connected = row?.connected || 0;
    const connectRate = totalCalls >= 5 ? Math.round((connected / totalCalls) * 100) : -1;
    const flagged = connectRate >= 0 && connectRate < 15 && totalCalls >= 10;
    const shouldAutoPause = connectRate >= 0 && connectRate < 10 && totalCalls >= 10;

    // Upsert health record
    db.prepare(`
      INSERT INTO dialer_number_health (phone, total_calls, connected, connect_rate, flagged_at, last_checked)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET
        total_calls = excluded.total_calls,
        connected = excluded.connected,
        connect_rate = excluded.connect_rate,
        flagged_at = CASE WHEN excluded.connect_rate < 15 AND excluded.total_calls >= 10 THEN datetime('now') ELSE flagged_at END,
        last_checked = datetime('now')
    `).run(phone, totalCalls, connected, connectRate >= 0 ? connectRate : null, flagged ? new Date().toISOString() : null);

    // Auto-pause numbers with <10% connect rate (scam-likely protection)
    if (shouldAutoPause) {
      const current = db.prepare('SELECT paused FROM dialer_number_health WHERE phone = ?').get(phone) as any;
      if (!current?.paused) {
        setNumberPaused(db, phone, true, `Auto-paused: ${connectRate}% connect rate (${connected}/${totalCalls} in 24h)`);
        console.log(`[NumberHealth] Auto-paused ${phone}: ${connectRate}% connect rate`);
      }
    }

    return { phone, totalCalls, connected, connectRate: connectRate >= 0 ? connectRate : -1, flagged };
  });
}

// ── Number Throttle System ──
// Safe limits based on carrier spam detection research:
// - 40 calls/number/day (AT&T/Verizon/T-Mobile flag at ~50+)
// - 8 calls/number/hour (burst detection triggers at 10-15)
// - Auto-pause when limits hit, auto-resume next window

const DEFAULT_DAILY_LIMIT = 100;
const DEFAULT_HOURLY_LIMIT = 15;

export interface NumberThrottleStatus {
  phone: string;
  callsToday: number;
  callsThisHour: number;
  dailyLimit: number;
  hourlyLimit: number;
  dailyRemaining: number;
  hourlyRemaining: number;
  paused: boolean;
  pausedReason: string | null;
  lastCallAt: string | null;
  throttled: boolean;
  throttleReason: string | null;
}

/**
 * Get real-time throttle status for one or more outbound numbers.
 * Queries actual call_records for live counts (not cached).
 */
export function getNumberThrottleStatus(
  db: Database.Database,
  fromNumbers: string[]
): NumberThrottleStatus[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  return fromNumbers.map(phone => {
    // Live counts from call records
    const todayRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM dialer_call_records
      WHERE our_phone = ? AND call_direction = 'outbound' AND call_started_at >= ?
    `).get(phone, todayStart) as any;

    const hourRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM dialer_call_records
      WHERE our_phone = ? AND call_direction = 'outbound' AND call_started_at >= ?
    `).get(phone, hourAgo) as any;

    const lastCallRow = db.prepare(`
      SELECT call_started_at FROM dialer_call_records
      WHERE our_phone = ? AND call_direction = 'outbound'
      ORDER BY call_started_at DESC LIMIT 1
    `).get(phone) as any;

    // Get saved limits (or defaults)
    const healthRow = db.prepare(
      'SELECT daily_limit, hourly_limit, paused, paused_reason FROM dialer_number_health WHERE phone = ?'
    ).get(phone) as any;

    const dailyLimit = healthRow?.daily_limit || DEFAULT_DAILY_LIMIT;
    const hourlyLimit = healthRow?.hourly_limit || DEFAULT_HOURLY_LIMIT;
    const paused = healthRow?.paused === 1;
    const pausedReason = healthRow?.paused_reason || null;

    const callsToday = todayRow?.cnt || 0;
    const callsThisHour = hourRow?.cnt || 0;
    const lastCallAt = lastCallRow?.call_started_at || null;

    let throttled = false;
    let throttleReason: string | null = null;

    if (paused) {
      throttled = true;
      throttleReason = pausedReason || 'Manually paused';
    } else if (callsToday >= dailyLimit) {
      throttled = true;
      throttleReason = `Daily limit reached (${callsToday}/${dailyLimit})`;
    } else if (callsThisHour >= hourlyLimit) {
      throttled = true;
      throttleReason = `Hourly limit reached (${callsThisHour}/${hourlyLimit})`;
    }

    // Upsert live counts to health table
    db.prepare(`
      INSERT INTO dialer_number_health (phone, calls_today, calls_this_hour, last_call_at, daily_limit, hourly_limit, last_checked)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET
        calls_today = excluded.calls_today,
        calls_this_hour = excluded.calls_this_hour,
        last_call_at = COALESCE(excluded.last_call_at, last_call_at),
        last_checked = datetime('now')
    `).run(phone, callsToday, callsThisHour, lastCallAt, dailyLimit, hourlyLimit);

    return {
      phone,
      callsToday,
      callsThisHour,
      dailyLimit,
      hourlyLimit,
      dailyRemaining: Math.max(0, dailyLimit - callsToday),
      hourlyRemaining: Math.max(0, hourlyLimit - callsThisHour),
      paused,
      pausedReason,
      lastCallAt,
      throttled,
      throttleReason,
    };
  });
}

/**
 * Check if a specific number is throttled. Fast single-number check.
 */
export function isNumberThrottled(db: Database.Database, phone: string): { throttled: boolean; reason: string | null } {
  const [status] = getNumberThrottleStatus(db, [phone]);
  return { throttled: status.throttled, reason: status.throttleReason };
}

/**
 * Update daily/hourly limits for a number.
 */
export function setNumberLimits(
  db: Database.Database,
  phone: string,
  dailyLimit?: number,
  hourlyLimit?: number
): void {
  db.prepare(`
    INSERT INTO dialer_number_health (phone, daily_limit, hourly_limit, last_checked)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(phone) DO UPDATE SET
      daily_limit = COALESCE(?, daily_limit),
      hourly_limit = COALESCE(?, hourly_limit),
      last_checked = datetime('now')
  `).run(phone, dailyLimit || DEFAULT_DAILY_LIMIT, hourlyLimit || DEFAULT_HOURLY_LIMIT, dailyLimit, hourlyLimit);
}

/**
 * Pause or unpause a number.
 */
export function setNumberPaused(db: Database.Database, phone: string, paused: boolean, reason?: string): void {
  db.prepare(`
    INSERT INTO dialer_number_health (phone, paused, paused_reason, last_checked)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(phone) DO UPDATE SET
      paused = ?,
      paused_reason = ?,
      last_checked = datetime('now')
  `).run(phone, paused ? 1 : 0, reason || null, paused ? 1 : 0, reason || null);
}

/**
 * Get the total campaign capacity across selected numbers.
 */
export function getCampaignCapacity(db: Database.Database, fromNumbers: string[]): {
  totalDailyRemaining: number;
  totalHourlyRemaining: number;
  availableNumbers: string[];
  throttledNumbers: string[];
} {
  const statuses = getNumberThrottleStatus(db, fromNumbers);
  const available = statuses.filter(s => !s.throttled);
  const throttled = statuses.filter(s => s.throttled);

  return {
    totalDailyRemaining: available.reduce((sum, s) => sum + s.dailyRemaining, 0),
    totalHourlyRemaining: available.reduce((sum, s) => sum + s.hourlyRemaining, 0),
    availableNumbers: available.map(s => s.phone),
    throttledNumbers: throttled.map(s => s.phone),
  };
}

// ── Sync FUB People → local DNC cache ──

export function syncFubPeopleToDNC(
  db: Database.Database,
  people: Array<{
    id: number;
    phone_normalized: string;
    first_name?: string;
    last_name?: string;
    stage?: string;
  }>
): { total: number; added: number; duplicates: number; errors: number } {
  let added = 0;
  let duplicates = 0;
  let errors = 0;

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO dialer_dnc_cache
      (id, phone_normalized, first_name, last_name, source, reason, dnc_type, added_at)
    VALUES (?, ?, ?, ?, 'Follow Up Boss', ?, 'permanent', datetime('now'))
  `);

  const tx = db.transaction(() => {
    for (const person of people) {
      try {
        const existing = db.prepare(
          'SELECT id FROM dialer_dnc_cache WHERE phone_normalized = ?'
        ).get(person.phone_normalized);

        upsert.run(
          `dnc_fub_${person.phone_normalized}`,
          person.phone_normalized,
          person.first_name || null,
          person.last_name || null,
          person.stage ? `FUB stage: ${person.stage}` : 'FUB exclusion'
        );

        if (existing) duplicates++;
        else added++;
      } catch (err: any) {
        errors++;
        console.error(`[syncFubDNC] Error for ${person.phone_normalized}:`, err.message);
      }
    }
  });
  tx();

  return { total: people.length, added, duplicates, errors };
}

// ── Upload Leads (CSV bulk import) — direct to local SQLite ──

export function uploadLeadsBatch(
  db: Database.Database,
  leads: Array<{
    phone_number: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    county?: string;
    state?: string;
    parcel_acres?: number;
    market_value?: number;
    property_address?: string;
    property_city?: string;
    property_zip?: string;
    parcel_number?: string;
    min_offer?: number;
    max_offer?: number;
    labels?: string;
    notes?: string;
    lead_source?: string;
    acquired_by?: string;
  }>,
  batchId: string,
  listName?: string
): {
  batch_id: string;
  total_rows: number;
  imported: number;
  duplicates: number;
  errors: number;
  skipped: number;
  dncMatches: number;
  details: Array<{
    row_index: number;
    lead_id: string | null;
    action: 'inserted' | 'updated' | 'skipped' | 'error';
    reason: string | null;
    phone: string;
  }>;
} {
  const details: Array<{
    row_index: number;
    lead_id: string | null;
    action: 'inserted' | 'updated' | 'skipped' | 'error';
    reason: string | null;
    phone: string;
  }> = [];

  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  let skipped = 0;

  // Create a list entry for this batch
  const listId = `list_${batchId}`;
  const resolvedListName = listName || `Upload ${new Date().toLocaleDateString()}`;

  db.prepare(`
    INSERT OR REPLACE INTO dialer_lists (id, name, lead_count, created_at)
    VALUES (?, ?, 0, datetime('now'))
  `).run(listId, resolvedListName);

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO dialer_leads_cache (
      id, phone_normalized, phone_number, first_name, last_name, email,
      county, state, parcel_acres, property_address, market_value,
      ai_cadence_on, attempt_count, max_attempts, rapport_level,
      priority_score, can_call_now, has_market_value,
      airtable_record_id, list_id, list_name, created_at, updated_at
    ) VALUES (
      @id, @phone_normalized, @phone_number, @first_name, @last_name, @email,
      @county, @state, @parcel_acres, @property_address, @market_value,
      1, 0, 14, 'cold',
      @priority_score, 1, @has_market_value,
      @airtable_record_id, @list_id, @list_name, datetime('now'), datetime('now')
    )
  `);

  const checkExisting = db.prepare(
    'SELECT id FROM dialer_leads_cache WHERE phone_normalized = ?'
  );

  const tx = db.transaction(() => {
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const phone = lead.phone_number?.trim();

      if (!phone) {
        skipped++;
        details.push({ row_index: i, lead_id: null, action: 'skipped', reason: 'No phone number', phone: '' });
        continue;
      }

      const phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length < 10) {
        skipped++;
        details.push({ row_index: i, lead_id: null, action: 'skipped', reason: `Invalid phone (${phoneDigits.length} digits)`, phone });
        continue;
      }

      const normalized = phoneDigits.length === 11 && phoneDigits.startsWith('1')
        ? `+${phoneDigits}`
        : `+1${phoneDigits.slice(-10)}`;

      try {
        const existing = checkExisting.get(normalized) as any;
        const leadId = existing?.id || generateUUID();
        const airtableRecordId = `csv_upload_${batchId}_${i}`;
        const priorityScore = (lead.market_value ? 10 : 0) + (lead.county ? 5 : 0);

        upsert.run({
          id: leadId,
          phone_normalized: normalized,
          phone_number: phone,
          first_name: lead.first_name || null,
          last_name: lead.last_name || null,
          email: lead.email || null,
          county: lead.county || null,
          state: lead.state || null,
          parcel_acres: lead.parcel_acres || null,
          property_address: lead.property_address || null,
          market_value: lead.market_value || null,
          priority_score: priorityScore,
          has_market_value: lead.market_value ? 1 : 0,
          airtable_record_id: airtableRecordId,
          list_id: listId,
          list_name: resolvedListName,
        });

        if (existing) {
          duplicates++;
          imported++;
          details.push({ row_index: i, lead_id: leadId, action: 'updated', reason: 'Phone already exists', phone });
        } else {
          imported++;
          details.push({ row_index: i, lead_id: leadId, action: 'inserted', reason: null, phone });
        }
      } catch (err: any) {
        errors++;
        details.push({ row_index: i, lead_id: null, action: 'error', reason: err.message || 'Unknown error', phone });
      }
    }
  });
  tx();

  // Update the list's lead count
  db.prepare(
    'UPDATE dialer_lists SET lead_count = (SELECT COUNT(*) FROM dialer_leads_cache WHERE list_id = ?) WHERE id = ?'
  ).run(listId, listId);

  // Check how many uploaded phones are already in DNC list
  const importedPhones = details
    .filter(d => d.action === 'inserted' || d.action === 'updated')
    .map(d => {
      const digits = d.phone.replace(/\D/g, '');
      return digits.length === 11 && digits.startsWith('1') ? `+${digits}` : `+1${digits.slice(-10)}`;
    });
  let dncMatches = 0;
  if (importedPhones.length > 0) {
    const checkDnc = db.prepare('SELECT 1 FROM dialer_dnc_cache WHERE phone_normalized = ?');
    for (const phone of importedPhones) {
      if (checkDnc.get(phone)) dncMatches++;
    }
  }

  return { batch_id: batchId, total_rows: leads.length, imported, duplicates, errors, skipped, dncMatches, details };
}

// ── Upload Batch Management ──

export function getUploadBatches(db: Database.Database): any[] {
  const leads = db.prepare(
    "SELECT airtable_record_id, created_at FROM dialer_leads_cache WHERE airtable_record_id LIKE 'csv_upload_%'"
  ).all() as any[];

  const batches = new Map<string, { batch_id: string; lead_count: number; uploaded_at: string }>();
  for (const lead of leads) {
    const parts = (lead.airtable_record_id as string).split('_');
    const batchId = parts.length >= 4 ? `${parts[2]}_${parts[3]}` : 'unknown';
    if (batchId === 'unknown' || !/^\d+_[a-z0-9]+$/i.test(batchId)) continue;
    if (!batches.has(batchId)) {
      batches.set(batchId, { batch_id: batchId, lead_count: 0, uploaded_at: lead.created_at });
    }
    const b = batches.get(batchId)!;
    b.lead_count++;
    if (lead.created_at < b.uploaded_at) b.uploaded_at = lead.created_at;
  }

  return Array.from(batches.values()).sort((a, b) =>
    new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  );
}

export function getUploadBatchLeads(db: Database.Database, batchId: string): any[] {
  return db.prepare(
    "SELECT id, first_name, last_name, phone_normalized, county, state, created_at FROM dialer_leads_cache WHERE airtable_record_id LIKE ? ORDER BY created_at ASC"
  ).all(`csv_upload_${batchId}_%`);
}

export function deleteUploadBatch(db: Database.Database, batchId: string): { deleted: number } {
  if (!/^\d+_[a-z0-9]+$/i.test(batchId)) throw new Error('Invalid batch ID format');
  const result = db.prepare(
    "DELETE FROM dialer_leads_cache WHERE airtable_record_id LIKE ?"
  ).run(`csv_upload_${batchId}_%`);
  return { deleted: result.changes };
}

// ══════════════════════════════════════════════════════
// DIRECT INSERT — Used by retell-call-poller.ts
// ══════════════════════════════════════════════════════

/**
 * Insert or update a call record directly into local SQLite.
 * No record cap — all call history is preserved.
 */
export function upsertCallRecord(db: Database.Database, call: any): void {
  // Look up lead context from local cache
  const leadByIdStmt = db.prepare(
    'SELECT first_name, last_name, county, state FROM dialer_leads_cache WHERE id = ?'
  );
  const leadByPhoneStmt = db.prepare(
    'SELECT first_name, last_name, county, state FROM dialer_leads_cache WHERE phone_normalized = ? LIMIT 1'
  );

  let leadCtx: any = null;
  if (call.lead_id) leadCtx = leadByIdStmt.get(call.lead_id);
  if (!leadCtx && call.seller_phone_normalized) leadCtx = leadByPhoneStmt.get(call.seller_phone_normalized);
  if (!leadCtx && call.phone_normalized) leadCtx = leadByPhoneStmt.get(call.phone_normalized);

  db.prepare(`
    INSERT OR REPLACE INTO dialer_call_records (
      id, lead_id, phone_normalized, seller_phone_normalized, our_phone,
      call_direction, retell_call_id, call_started_at, call_ended_at,
      duration_seconds, call_status, call_successful, sentiment,
      disconnection_reason, transcript, summary, custom_analysis,
      extracted_data, cost_cents,
      lead_first_name, lead_last_name, lead_county, lead_state,
      synced_at, created_at
    ) VALUES (
      @id, @lead_id, @phone_normalized, @seller_phone_normalized, @our_phone,
      @call_direction, @retell_call_id, @call_started_at, @call_ended_at,
      @duration_seconds, @call_status, @call_successful, @sentiment,
      @disconnection_reason, @transcript, @summary, @custom_analysis,
      @extracted_data, @cost_cents,
      @lead_first_name, @lead_last_name, @lead_county, @lead_state,
      datetime('now'), @created_at
    )
  `).run({
    id: call.id,
    lead_id: call.lead_id || null,
    phone_normalized: call.phone_normalized || null,
    seller_phone_normalized: call.seller_phone_normalized || null,
    our_phone: call.our_phone || null,
    call_direction: call.call_direction || 'outbound',
    retell_call_id: call.retell_call_id || null,
    call_started_at: call.call_started_at || null,
    call_ended_at: call.call_ended_at || null,
    duration_seconds: call.duration_seconds || null,
    call_status: call.call_status || null,
    call_successful: call.call_successful ? 1 : 0,
    sentiment: call.sentiment || null,
    disconnection_reason: call.disconnection_reason || null,
    transcript: call.transcript || null,
    summary: call.summary || null,
    custom_analysis: call.custom_analysis ? (typeof call.custom_analysis === 'string' ? call.custom_analysis : JSON.stringify(call.custom_analysis)) : null,
    extracted_data: call.extracted_data ? (typeof call.extracted_data === 'string' ? call.extracted_data : JSON.stringify(call.extracted_data)) : null,
    cost_cents: call.cost_cents || null,
    lead_first_name: leadCtx?.first_name || null,
    lead_last_name: leadCtx?.last_name || null,
    lead_county: leadCtx?.county || null,
    lead_state: leadCtx?.state || null,
    created_at: call.created_at || null,
  });
}

/**
 * Bulk insert call records (used by backfill).
 */
export function bulkUpsertCallRecords(db: Database.Database, calls: any[]): void {
  const tx = db.transaction(() => {
    for (const call of calls) {
      upsertCallRecord(db, call);
    }
  });
  tx();
}

/**
 * Check which retell_call_ids already exist locally (for dedup).
 */
export function getExistingRetellCallIds(db: Database.Database, callIds: string[]): Set<string> {
  if (callIds.length === 0) return new Set();
  const placeholders = callIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT retell_call_id FROM dialer_call_records WHERE retell_call_id IN (${placeholders})`
  ).all(...callIds) as any[];
  return new Set(rows.map(r => r.retell_call_id));
}
