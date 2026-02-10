import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { runMigrations } from './migrations.js';

let db: Database.Database;

export function getDb(): Database.Database {
  return db;
}

/**
 * Get the stable database directory.
 * Always uses the same path regardless of app name changes in package.json.
 * Also migrates from legacy paths if they exist.
 */
export function getDataDir(): string {
  return getDbDir();
}

function getDbDir(): string {
  const stableDir = path.join(app.getPath('appData'), 'jerez-land-tc-data');
  fs.mkdirSync(stableDir, { recursive: true });

  const stableDb = path.join(stableDir, 'tc-dash.db');

  // Migrate from legacy locations if stable DB doesn't exist yet
  if (!fs.existsSync(stableDb)) {
    const legacyPaths = [
      path.join(app.getPath('appData'), 'copy-of-nexus-analytics-dashboard', 'tc-dash.db'),
      path.join(app.getPath('appData'), 'Jerez Land TC', 'tc-dash.db'),
      path.join(app.getPath('userData'), 'tc-dash.db'),
    ];

    for (const legacy of legacyPaths) {
      if (fs.existsSync(legacy)) {
        console.log(`[Database] Migrating from legacy path: ${legacy}`);
        fs.copyFileSync(legacy, stableDb);
        // Also copy WAL/SHM if they exist
        if (fs.existsSync(legacy + '-wal')) fs.copyFileSync(legacy + '-wal', stableDb + '-wal');
        if (fs.existsSync(legacy + '-shm')) fs.copyFileSync(legacy + '-shm', stableDb + '-shm');
        break;
      }
    }
  }

  return stableDir;
}

/**
 * Create a timestamped backup of the database.
 * Keeps the last 5 backups, deletes older ones.
 */
export function backupDatabase(): string | null {
  if (!db) return null;

  const dbDir = getDbDir();
  const backupDir = path.join(dbDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(backupDir, `tc-dash-${timestamp}.db`);

  try {
    db.backup(backupPath);
    console.log(`[Database] Backup created: ${backupPath}`);

    // Prune old backups — keep last 5
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('tc-dash-') && f.endsWith('.db'))
      .sort()
      .reverse();

    for (const old of backups.slice(5)) {
      fs.unlinkSync(path.join(backupDir, old));
      console.log(`[Database] Pruned old backup: ${old}`);
    }

    return backupPath;
  } catch (err) {
    console.error('[Database] Backup failed:', err);
    return null;
  }
}

export function initDatabase(): void {
  const dbDir = getDbDir();
  const dbPath = path.join(dbDir, 'tc-dash.db');
  console.log('Database path:', dbPath);

  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create a backup before running migrations
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    backupDatabase();
  }

  // Run versioned migrations (handles both fresh install and existing DB)
  runMigrations(db);
}
