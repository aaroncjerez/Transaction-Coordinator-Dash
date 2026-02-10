/**
 * Crawler Configuration
 *
 * Auto-detects paths and provides sensible defaults.
 * Override via CLI flags or environment variables.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { CrawlConfig } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** tools/crawler/ → project root (../../) */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Auto-detect the Electron app path.
 * Priority:
 * 1. Packaged app in release/mac-universal/
 * 2. Dev mode via electron . (uses main.ts)
 */
function detectElectronPath(): string {
  // Check for packaged app
  const appPath = path.join(PROJECT_ROOT, 'release', 'mac-universal', 'Jerez Land TC.app', 'Contents', 'MacOS', 'Jerez Land TC');
  if (fs.existsSync(appPath)) {
    return appPath;
  }

  // Fall back to dev mode — launch with electron .
  // The Playwright _electron.launch expects an executablePath or args with electron binary
  return detectDevElectronPath();
}

/**
 * Get the dev electron binary path (from node_modules).
 * This always uses the latest compiled code from electron-dist/.
 */
function detectDevElectronPath(): string {
  const electronBin = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'electron');
  if (fs.existsSync(electronBin)) {
    return electronBin;
  }

  throw new Error(
    `Cannot find dev Electron binary at:\n  ${electronBin}\nRun 'npm install' in the project root first.`
  );
}

export function getConfig(overrides: Partial<CrawlConfig> = {}): CrawlConfig {
  // Use packaged desktop app by default (rebuild with `npm run package` to include latest changes)
  // Pass --dev to use dev electron binary instead
  const useDevElectron = overrides.devMode === true;

  return {
    electronPath: useDevElectron ? detectDevElectronPath() : detectElectronPath(),
    devMode: useDevElectron,
    mockExternal: true,
    safeMode: true,
    forbiddenActions: [
      'fub:pushStage',        // FORBIDDEN — never push stages to FUB
    ],
    destructiveKeywords: [
      'delete',
      'purge',
      'remove',
      'destroy',
      'clear all',
    ],
    maxDepth: 5,
    maxActions: 200,
    timeout: 120_000,         // 2 minutes
    verbose: false,
    projectRoot: PROJECT_ROOT,
    ...overrides,
  };
}
