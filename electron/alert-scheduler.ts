/**
 * Alert Scheduler — Deadline Notification System
 *
 * Runs every 15 minutes in the main process.
 * Checks the `deadlines` table for unfired alerts where the deadline
 * minus offset_days has passed. Fires Electron native notifications
 * and emits IPC events to the renderer.
 */

import { Notification, BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { getDb } from './database.js';

let intervalId: ReturnType<typeof setInterval> | null = null;

interface AlertScheduleEntry {
  offset_days: number;
  fired: boolean;
}

interface DeadlineRow {
  id: string;
  deal_id: string;
  label: string;
  due_date: string;
  alert_schedule: string; // JSON
  is_acknowledged: number;
  created_at: string;
}

/**
 * Check for any deadline alerts that need to fire.
 */
function checkAlerts(db: Database.Database): void {
  const now = new Date();
  const deadlines = db.prepare(
    "SELECT * FROM deadlines WHERE is_acknowledged = 0"
  ).all() as DeadlineRow[];

  for (const deadline of deadlines) {
    let schedule: AlertScheduleEntry[];
    try {
      schedule = JSON.parse(deadline.alert_schedule);
    } catch {
      continue;
    }

    const dueDate = new Date(deadline.due_date);
    let updated = false;

    for (const entry of schedule) {
      if (entry.fired) continue;

      // Calculate alert trigger date: due_date minus offset_days
      const alertDate = new Date(dueDate);
      alertDate.setDate(alertDate.getDate() - entry.offset_days);

      if (now >= alertDate) {
        entry.fired = true;
        updated = true;

        // Calculate days until deadline
        const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const timeLabel = daysLeft <= 0 ? 'TODAY' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;

        // Fire native notification
        if (Notification.isSupported()) {
          const notification = new Notification({
            title: `Deadline Alert: ${deadline.label}`,
            body: `Due ${timeLabel}`,
            silent: false,
          });
          notification.show();
        }

        // Emit to all renderer windows
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          win.webContents.send('deadline:alert', {
            deadlineId: deadline.id,
            dealId: deadline.deal_id,
            label: deadline.label,
            dueDate: deadline.due_date,
            daysLeft,
            offsetDays: entry.offset_days,
          });
        }

        // Log to audit
        db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
          deadline.deal_id,
          'deadline_alert',
          JSON.stringify({ deadline_id: deadline.id, label: deadline.label, offset_days: entry.offset_days, days_left: daysLeft })
        );

        console.log(`[AlertScheduler] Fired alert for "${deadline.label}" (${timeLabel})`);
      }
    }

    if (updated) {
      db.prepare('UPDATE deadlines SET alert_schedule = ? WHERE id = ?').run(
        JSON.stringify(schedule),
        deadline.id
      );
    }
  }
}

/**
 * Start the alert scheduler. Runs immediately and then every 15 minutes.
 */
export function startAlertScheduler(): void {
  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  console.log('[AlertScheduler] Starting deadline alert scheduler (15 min interval)');

  // Run immediately on startup
  try {
    const db = getDb();
    checkAlerts(db);
  } catch (e) {
    console.warn('[AlertScheduler] Initial check failed (DB may not be ready):', e);
  }

  // Schedule recurring checks
  intervalId = setInterval(() => {
    try {
      const db = getDb();
      checkAlerts(db);
    } catch (e) {
      console.error('[AlertScheduler] Check failed:', e);
    }
  }, INTERVAL_MS);
}

/**
 * Stop the alert scheduler.
 */
export function stopAlertScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[AlertScheduler] Stopped');
  }
}

/**
 * Generate the default alert schedule for a deadline.
 * Alerts at: 14 days, 7 days, 3 days, 1 day, and morning-of (0 days).
 */
export function generateDefaultAlertSchedule(): AlertScheduleEntry[] {
  return [
    { offset_days: 14, fired: false },
    { offset_days: 7, fired: false },
    { offset_days: 3, fired: false },
    { offset_days: 1, fired: false },
    { offset_days: 0, fired: false },
  ];
}
