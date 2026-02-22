import { app, BrowserWindow, protocol, net, shell } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';
import { initDatabase, backupDatabase } from './database.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { startAlertScheduler } from './alert-scheduler.js';
import { startReminderScheduler } from './reminder-scheduler.js';
import { startFubPersonSync } from './fub-person-sync.js';
import { startFubFileSync } from './fub-file-sync.js';
import { startDialerSync } from './dialer-sync.js';
import { startRetellPoller } from './retell-call-poller.js';

// Suppress EPIPE errors on stdout/stderr — GUI apps launched from Finder
// have no connected terminal, so console.log can throw when the pipe breaks.
process.stdout?.on?.('error', () => {});
process.stderr?.on?.('error', () => {});

const isCrawlMode = process.env.MOCK_EXTERNAL === 'true';
const isDev = !app.isPackaged && !isCrawlMode;

// Load environment variables from .env in the project root
// Skip in crawl mode — crawler provides its own env vars and .env would override them
if (!isCrawlMode) {
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
} else {
  console.log('[Main] Crawl mode — skipping .env, using provided env vars');
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
  } else if (isCrawlMode) {
    // In crawl mode, load directly from dist/ via file:// (simpler than app:// protocol)
    const distIndexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    mainWindow.loadFile(distIndexPath);
  } else {
    mainWindow.loadURL('app://./index.html');
  }

  // Open external links (http/https) in the system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow internal navigation (app://, localhost dev server)
    if (url.startsWith('app://') || url.startsWith('http://localhost')) return;
    // External URLs → open in system browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

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

  // Start background runners (disabled in test/crawl mode)
  if (process.env.MOCK_EXTERNAL !== 'true') {
    // Start deadline alert scheduler (checks every 15 min)
    startAlertScheduler();

    // Start task reminder scheduler (checks every 60s)
    startReminderScheduler();

    // Start FUB person sync runner (polls every 30s)
    startFubPersonSync();

    // Start FUB file sync runner (checks every 5 min)
    startFubFileSync();

    // Start AI Dialer sync runner (polls Supabase every 60s, auto-reviews calls)
    startDialerSync();

    // Start Retell call poller (polls Retell List Calls API every 30s, replaces n8n)
    startRetellPoller();

    // Schedule automatic database backups every 30 minutes (keeps last 5)
    setInterval(() => {
      try {
        backupDatabase();
      } catch (err) {
        console.error('[Main] Scheduled backup failed:', err);
      }
    }, 30 * 60 * 1000);
  } else {
    console.log('[Main] MOCK_EXTERNAL=true — skipping background runners');
  }

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
