/**
 * Rule Engine — Deterministic Task Seeding
 *
 * When a deal's stage changes (or a new deal is created), this engine seeds
 * the appropriate tasks based on deal_type + stage from the ruleset.
 *
 * Idempotent: Uses UNIQUE(deal_id, source_rule_key) constraint.
 * INSERT OR IGNORE ensures re-running is safe.
 */

import type Database from 'better-sqlite3';
import crypto from 'crypto';
import { TASK_RULESET, type TaskTuple } from './task-rules.js';

function generateUUID(): string {
  return crypto.randomUUID();
}

export interface SeededTask {
  id: string;
  deal_id: string;
  title: string;
  description: string;
  source_rule_key: string;
  task_order: number | null;
  status: string;
}

/**
 * Compute the source_rule_key for a task tuple.
 *
 * For type-specific tasks: {dealType}::{stage}::{order}
 * For global (*) tasks: *::{stage}::{order}
 * For Cancelled tasks with null order: special keys
 */
function computeRuleKey(ruleScope: string, stage: string, order: number | null, title: string): string {
  if (order !== null) {
    return `${ruleScope}::${stage}::${order}`;
  }

  // Cancelled tasks with null order get special keys based on title
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${ruleScope}::${stage}::${slug}`;
}

/**
 * Seeds tasks for a specific deal + stage combination.
 *
 * Looks up both type-specific tasks AND global (*) tasks for the given stage.
 * Uses INSERT OR IGNORE for idempotency — the UNIQUE(deal_id, source_rule_key)
 * constraint prevents duplicate tasks.
 *
 * @returns Array of newly created tasks
 */
export function seedTasksForStage(
  db: Database.Database,
  dealId: string,
  dealType: string,
  stage: string
): SeededTask[] {
  const seeded: SeededTask[] = [];
  const ruleset = TASK_RULESET.tasks_by_type_and_stage;

  // Collect tasks from both type-specific and global rulesets
  const taskSets: { scope: string; tasks: TaskTuple[] }[] = [];

  // 1. Type-specific tasks
  if (ruleset[dealType]?.[stage]) {
    taskSets.push({ scope: dealType, tasks: ruleset[dealType][stage] });
  }

  // 2. Global (*) tasks
  if (ruleset['*']?.[stage]) {
    taskSets.push({ scope: '*', tasks: ruleset['*'][stage] });
  }

  if (taskSets.length === 0) {
    console.log(`[RuleEngine] No tasks defined for ${dealType}::${stage}`);
    return seeded;
  }

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO tasks (id, deal_id, title, description, status, task_order, source_rule_key)
    VALUES (?, ?, ?, ?, 'To Do', ?, ?)
  `);

  const insertAudit = db.prepare(
    'INSERT INTO audit_log (deal_id, event_type, details) VALUES (?, ?, ?)'
  );

  const seedTransaction = db.transaction(() => {
    for (const { scope, tasks } of taskSets) {
      for (const [order, title, description, _url] of tasks) {
        const ruleKey = computeRuleKey(scope, stage, order, title);
        const id = generateUUID();

        const result = insertStmt.run(id, dealId, title, description || '', order, ruleKey);

        if (result.changes > 0) {
          // Task was actually inserted (not a duplicate)
          seeded.push({
            id,
            deal_id: dealId,
            title,
            description: description || '',
            source_rule_key: ruleKey,
            task_order: order,
            status: 'To Do',
          });

          // Log to audit
          insertAudit.run(
            dealId,
            'task_created',
            JSON.stringify({ task_id: id, title, source_rule_key: ruleKey, seeded: true })
          );
        }
      }
    }
  });

  seedTransaction();

  if (seeded.length > 0) {
    console.log(`[RuleEngine] Seeded ${seeded.length} tasks for ${dealType}::${stage} on deal ${dealId}`);
  } else {
    console.log(`[RuleEngine] No new tasks seeded for ${dealType}::${stage} (all already exist)`);
  }

  return seeded;
}

/**
 * Seeds tasks for ALL stages up to and including the given stage.
 * Useful for initial deal creation or re-seeding.
 *
 * @returns All newly created tasks
 */
export function seedTasksUpToStage(
  db: Database.Database,
  dealId: string,
  dealType: string,
  currentStage: string
): SeededTask[] {
  const stageOrder = [
    'Offer accepted',
    'Due Diligence',
    'Send to escrow',
    'Purchase escrow',
    'Purchased',
    'Sale escrow',
    'Sold',
    'Cancelled',
  ];

  const currentIndex = stageOrder.indexOf(currentStage);
  if (currentIndex === -1) {
    console.warn(`[RuleEngine] Unknown stage: ${currentStage}`);
    return seedTasksForStage(db, dealId, dealType, currentStage);
  }

  // For Cancelled, only seed Cancelled tasks
  if (currentStage === 'Cancelled') {
    return seedTasksForStage(db, dealId, dealType, 'Cancelled');
  }

  // Seed all stages up to and including current
  const allSeeded: SeededTask[] = [];
  for (let i = 0; i <= currentIndex; i++) {
    const tasks = seedTasksForStage(db, dealId, dealType, stageOrder[i]);
    allSeeded.push(...tasks);
  }

  return allSeeded;
}
