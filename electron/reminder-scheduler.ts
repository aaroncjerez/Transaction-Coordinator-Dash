/**
 * Reminder Scheduler — Task Slack/Native Notification System
 *
 * Runs every 60 seconds in the main process.
 * Checks the `task_reminders` table for pending reminders whose
 * remind_at time has passed. Sends Slack webhook messages (if configured)
 * and fires native Electron notifications.
 */

import { Notification, BrowserWindow, shell } from 'electron';
import { exec } from 'child_process';
import type Database from 'better-sqlite3';
import { getDb } from './database.js';

/** Play a macOS system sound using afplay */
function playNotificationSound(): void {
  exec('afplay /System/Library/Sounds/Glass.aiff', (err) => {
    if (err) console.warn('[ReminderScheduler] Sound playback failed:', err.message);
  });
}

let intervalId: ReturnType<typeof setInterval> | null = null;

interface ReminderRow {
  id: string;
  task_id: string;
  remind_at: string;
  status: string;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  // Joined fields
  title: string;
  deal_id: string | null;
  deal_name: string | null;
}

/**
 * Send a Slack webhook message.
 * Uses global fetch (Node 22+ in Electron 40).
 */
async function sendSlackMessage(webhookUrl: string, taskTitle: string, dealName: string | null, remindAt: string): Promise<void> {
  const dealLine = dealName ? `\nDeal: ${dealName}` : '';
  const timeStr = new Date(remindAt).toLocaleString();
  const payload = {
    text: `🔔 Task Reminder: *${taskTitle}*${dealLine}\nSet for: ${timeStr}`,
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook returned ${response.status}: ${response.statusText}`);
  }
}

/**
 * Check for any reminders that need to fire.
 */
async function checkReminders(db: Database.Database): Promise<void> {
  // Note: remind_at is stored as ISO 8601 (e.g. '2026-02-09T22:05:00.000Z')
  // but datetime('now') returns '2026-02-09 22:05:00'. We normalize both
  // by replacing 'T' with space and stripping the trailing 'Z'/ms for comparison.
  const rows = db.prepare(`
    SELECT r.*, t.title, t.deal_id, d.deal_name
    FROM task_reminders r
    JOIN tasks t ON r.task_id = t.id
    LEFT JOIN deals d ON t.deal_id = d.id
    WHERE r.status = 'pending'
      AND REPLACE(REPLACE(SUBSTR(r.remind_at, 1, 19), 'T', ' '), 'Z', '') <= datetime('now')
  `).all() as ReminderRow[];

  if (rows.length === 0) return;

  // Read Slack webhook URL once per cycle
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'slack_webhook_url'").get() as any;
  const webhookUrl = setting?.value || process.env.SLACK_WEBHOOK_URL || null;

  for (const reminder of rows) {
    let slackSent = false;

    // Send Slack message — isolated so failure doesn't block native notifications
    if (webhookUrl) {
      try {
        await sendSlackMessage(webhookUrl, reminder.title, reminder.deal_name, reminder.remind_at);
        slackSent = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ReminderScheduler] Slack failed for "${reminder.title}":`, msg);
      }
    }

    try {
      // Fire native notification with sound (always, regardless of Slack)
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: `Task Reminder: ${reminder.title}`,
          body: reminder.deal_name ? `Deal: ${reminder.deal_name}` : 'Tap to view',
          silent: true, // We play our own sound
        });
        notification.on('click', () => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
          }
        });
        notification.show();
      }

      // Play notification sound
      playNotificationSound();

      // Emit to all renderer windows
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send('reminder:fired', {
          reminderId: reminder.id,
          taskId: reminder.task_id,
          taskTitle: reminder.title,
          dealId: reminder.deal_id,
          dealName: reminder.deal_name,
          remindAt: reminder.remind_at,
          slackSent,
        });
      }

      // Mark as sent
      db.prepare("UPDATE task_reminders SET status = 'sent', sent_at = datetime('now') WHERE id = ?").run(reminder.id);

      // Audit log
      db.prepare('INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)').run(
        reminder.deal_id,
        'reminder_fired',
        JSON.stringify({ reminder_id: reminder.id, task_id: reminder.task_id, title: reminder.title, slack_sent: slackSent })
      );

      console.log(`[ReminderScheduler] Fired reminder for "${reminder.title}"${slackSent ? ' (Slack sent)' : webhookUrl ? ' (Slack failed)' : ''}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ReminderScheduler] Failed for "${reminder.title}":`, msg);

      // Mark as failed
      db.prepare("UPDATE task_reminders SET status = 'failed', error = ? WHERE id = ?").run(msg, reminder.id);
    }
  }
}

/**
 * Start the reminder scheduler. Runs immediately and then every 60 seconds.
 */
export function startReminderScheduler(): void {
  const INTERVAL_MS = 60 * 1000; // 60 seconds

  console.log('[ReminderScheduler] Starting task reminder scheduler (60s interval)');

  // Run immediately on startup
  try {
    const db = getDb();
    checkReminders(db).catch(e => console.warn('[ReminderScheduler] Initial check failed:', e));
  } catch (e) {
    console.warn('[ReminderScheduler] Initial check failed (DB may not be ready):', e);
  }

  // Schedule recurring checks
  intervalId = setInterval(() => {
    try {
      const db = getDb();
      checkReminders(db).catch(e => console.error('[ReminderScheduler] Check failed:', e));
    } catch (e) {
      console.error('[ReminderScheduler] Check failed:', e);
    }
  }, INTERVAL_MS);
}

/**
 * Stop the reminder scheduler.
 */
export function stopReminderScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[ReminderScheduler] Stopped');
  }
}
