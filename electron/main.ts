import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDatabase } from './database.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { startAlertScheduler } from './alert-scheduler.js';
import { startSyncRunner } from './sync-runner.js';
import { startFubFileSync } from './fub-file-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env in the project root
const envPath = path.join(__dirname, '..', '.env');
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  // Fallback: try from cwd
  dotenv.config({ path: path.join(process.cwd(), '.env') });
}
console.log('[Main] ENV path:', envPath, '| ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for better-sqlite3 native module
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Initialize SQLite database
  initDatabase();

  // Register all IPC handlers
  registerIpcHandlers();

  // Start deadline alert scheduler (checks every 15 min)
  startAlertScheduler();

  // Start background sync runner (processes queue every 30s)
  startSyncRunner();

  // Start FUB file sync runner (checks every 5 min)
  startFubFileSync();

  // Create window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
