import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { runMigrations } from './migrations.js';

let db: Database.Database;

export function getDb(): Database.Database {
  return db;
}

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'tc-dash.db');
  console.log('Database path:', dbPath);

  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run versioned migrations (handles both fresh install and existing DB)
  runMigrations(db);
}
