import { app, BrowserWindow, protocol, net } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import { initDatabase, backupDatabase } from './database.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { startAlertScheduler } from './alert-scheduler.js';
import { startReminderScheduler } from './reminder-scheduler.js';
import { startFubPersonSync } from './fub-person-sync.js';
import { startFubFileSync } from './fub-file-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

// Load environment variables from .env in the project root
// With rootDir="..", compiled output is at electron-dist/electron/main.js → go up 2 levels
const envPath = path.join(__dirname, '..', '..', '.env');
const envResult = dotenv.config({ path: envPath, override: true });
if (envResult.error && !app.isPackaged) {
  // Fallback: try from cwd (dev only)
  dotenv.config({ path: path.join(process.cwd(), '.env') });
}
if (isDev) {
  console.log('[Main] ENV path:', envPath, '| ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);
}

// Register custom app:// protocol for serving renderer files in production
// This avoids all file:// CORS/module issues in packaged Electron apps
if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

let mainWindow: BrowserWindow | null = null;

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

  // Forward renderer console messages to main process stdout (for debugging)
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelName = ['LOG', 'WARN', 'ERROR'][level] || 'LOG';
    if (level >= 2 || message.includes('Error') || message.includes('error')) {
      console.log(`[Renderer:${levelName}] ${message} (${sourceId}:${line})`);
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('app://./index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // In production, handle app:// protocol by serving from dist/ folder
  if (!isDev) {
    const distPath = path.join(__dirname, '..', '..', 'dist');
    protocol.handle('app', (request) => {
      const url = new URL(request.url);
      const filePath = path.join(distPath, decodeURIComponent(url.pathname));
      return net.fetch(pathToFileURL(filePath).toString());
    });
  }

  // Initialize SQLite database
  initDatabase();

  // Register all IPC handlers
  registerIpcHandlers();

  // Start deadline alert scheduler (checks every 15 min)
  startAlertScheduler();

  // Start task reminder scheduler (checks every 60s)
  startReminderScheduler();

  // Start FUB person sync runner (polls every 30s)
  startFubPersonSync();

  // Start FUB file sync runner (checks every 5 min)
  startFubFileSync();

  // Schedule automatic database backups every 30 minutes (keeps last 5)
  setInterval(() => {
    try {
      backupDatabase();
    } catch (err) {
      console.error('[Main] Scheduled backup failed:', err);
    }
  }, 30 * 60 * 1000);

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
