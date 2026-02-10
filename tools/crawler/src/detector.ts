/**
 * Issue Detector — Multi-process error detection for Electron apps.
 *
 * Hooks into:
 * 1. Renderer: console.error, uncaught exceptions, blank screens, dead clicks
 * 2. Main process: stderr monitoring, crash detection
 * 3. IPC: invoke failures, timeouts, schema mismatches
 *
 * Used by the crawler to detect issues as it navigates the app.
 */

import type { Page, ElectronApplication } from 'playwright';
import type { DetectedIssue, IpcCall, IssueSeverity, IssueCategory } from './types.js';

export class Detector {
  private issues: DetectedIssue[] = [];
  private consoleErrors: string[] = [];
  private ipcCalls: IpcCall[] = [];
  private mainProcessErrors: string[] = [];
  private pageErrors: string[] = [];
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  /**
   * Attach detector hooks to a Playwright page (renderer process).
   */
  attachToPage(page: Page): void {
    // Capture console errors and warnings
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        this.consoleErrors.push(text);
        if (this.verbose) console.log(`[Detector:console.error] ${text}`);

        // Filter out known non-issues
        if (this.isKnownConsoleNoise(text)) return;

        this.issues.push({
          severity: 'warning',
          category: 'renderer',
          title: `Console error: ${text.slice(0, 80)}`,
          description: text,
          consoleMessages: [text],
        });
      }

      if (type === 'warning' && this.verbose) {
        console.log(`[Detector:console.warn] ${text}`);
      }
    });

    // Capture uncaught exceptions
    page.on('pageerror', (error) => {
      const msg = error.message || String(error);
      const stack = error.stack || '';
      this.pageErrors.push(msg);

      if (this.verbose) console.log(`[Detector:pageerror] ${msg}`);

      this.issues.push({
        severity: 'critical',
        category: 'renderer',
        title: `Uncaught exception: ${msg.slice(0, 80)}`,
        description: msg,
        stackTrace: stack,
      });
    });
  }

  /**
   * Attach detector hooks to the Electron main process.
   */
  attachToElectronApp(electronApp: ElectronApplication): void {
    const proc = electronApp.process();

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (!text) return;

      this.mainProcessErrors.push(text);
      if (this.verbose) console.log(`[Detector:main:stderr] ${text}`);

      // Check for critical errors
      if (text.includes('SQLITE_') || text.includes('UnhandledPromiseRejection') || text.includes('Error:')) {
        // Filter known noise
        if (text.includes('DevTools') || text.includes('DeprecationWarning')) return;

        this.issues.push({
          severity: text.includes('SQLITE_') ? 'error' : 'warning',
          category: 'main',
          title: `Main process error: ${text.slice(0, 80)}`,
          description: text,
        });
      }
    });

    proc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        this.issues.push({
          severity: 'critical',
          category: 'main',
          title: `Main process crashed with exit code ${code}`,
          description: `Electron main process exited with non-zero code: ${code}`,
        });
      }
    });
  }

  /**
   * Inject IPC monitoring into the renderer.
   * Wraps window.electronAPI methods to track all IPC calls.
   */
  async injectIpcMonitor(page: Page): Promise<void> {
    // Use string-based evaluate to avoid tsx/esbuild __name helper injection
    await page.evaluate(`(() => {
      const api = window.electronAPI;
      if (!api || window.__ipcMonitorInstalled) return;

      window.__ipcMonitorInstalled = true;
      window.__ipcCalls = [];

      var wrapObject = function(obj, prefix) {
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var val = obj[key];
          if (typeof val === 'function' && key !== 'onAlert' && key !== 'onPersonSyncComplete' && key !== 'onFired') {
            (function(k, original, channel) {
              obj[k] = function() {
                var args = Array.prototype.slice.call(arguments);
                var call = {
                  channel: channel,
                  args: args.map(function(a) { return typeof a === 'object' ? '[object]' : String(a); }),
                  startedAt: Date.now(),
                  completedAt: 0,
                  duration: 0,
                  error: null,
                };

                return original.apply(obj, args).then(function(result) {
                  call.completedAt = Date.now();
                  call.duration = call.completedAt - call.startedAt;
                  window.__ipcCalls.push(call);
                  return result;
                }).catch(function(err) {
                  call.completedAt = Date.now();
                  call.duration = call.completedAt - call.startedAt;
                  call.error = err && err.message ? err.message : String(err);
                  window.__ipcCalls.push(call);
                  throw err;
                });
              };
            })(key, val.bind(obj), prefix + '.' + key);
          } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            wrapObject(val, prefix + '.' + key);
          }
        }
      };

      wrapObject(api, 'electronAPI');
    })()`);
  }

  /**
   * Check for blank screen — #root has no children after timeout.
   */
  async checkBlankScreen(page: Page, timeout = 5000): Promise<DetectedIssue | null> {
    try {
      await page.waitForSelector('#root > *', { timeout });
      return null;
    } catch {
      return {
        severity: 'critical',
        category: 'ui',
        title: 'Blank screen detected',
        description: `#root element has no children after ${timeout}ms`,
      };
    }
  }

  /**
   * Check if a click on an element produces any visible effect.
   * Returns issue if nothing changed (dead click).
   */
  async checkDeadClick(page: Page, selector: string, timeout = 2000): Promise<DetectedIssue | null> {
    try {
      const beforeHtml = await page.evaluate(() => document.body.innerHTML.length);

      await page.click(selector, { timeout: 3000 });
      await page.waitForTimeout(timeout);

      const afterHtml = await page.evaluate(() => document.body.innerHTML.length);

      // If DOM didn't change at all, it might be a dead click
      // Allow some tolerance (minor re-renders)
      if (Math.abs(afterHtml - beforeHtml) < 10) {
        return {
          severity: 'warning',
          category: 'ui',
          title: `Possible dead click on ${selector}`,
          description: `Clicking "${selector}" produced no visible DOM change within ${timeout}ms`,
        };
      }

      return null;
    } catch {
      return null; // Element not clickable, not necessarily an issue
    }
  }

  /**
   * Collect IPC call data from the renderer.
   */
  async collectIpcCalls(page: Page): Promise<IpcCall[]> {
    try {
      const calls = await page.evaluate(`(() => {
        var stored = window.__ipcCalls || [];
        window.__ipcCalls = [];
        return stored;
      })()`) as IpcCall[];

      // Check for IPC issues
      for (const call of calls) {
        if (call.error) {
          this.issues.push({
            severity: 'error',
            category: 'ipc',
            title: `IPC error on ${call.channel}`,
            description: `${call.channel} failed: ${call.error}`,
            ipcChannel: call.channel,
          });
        }

        if (call.duration && call.duration > 5000) {
          this.issues.push({
            severity: 'warning',
            category: 'ipc',
            title: `Slow IPC: ${call.channel} took ${call.duration}ms`,
            description: `IPC call to ${call.channel} took ${call.duration}ms (threshold: 5000ms)`,
            ipcChannel: call.channel,
          });
        }
      }

      this.ipcCalls.push(...(calls as IpcCall[]));
      return calls as IpcCall[];
    } catch {
      return [];
    }
  }

  /**
   * Filter out known console noise that isn't a real issue.
   */
  private isKnownConsoleNoise(text: string): boolean {
    const noise = [
      'Download the React DevTools',
      'React does not recognize',
      'Warning: Each child',
      'Warning: validateDOMNesting',
      'DevTools',
      'Manifest',
      'favicon.ico',
      'net::ERR_',
      'Failed to load resource',
    ];
    return noise.some(n => text.includes(n));
  }

  /**
   * Get all detected issues.
   */
  getIssues(): DetectedIssue[] {
    return [...this.issues];
  }

  /**
   * Get all IPC call records.
   */
  getIpcCalls(): IpcCall[] {
    return [...this.ipcCalls];
  }

  /**
   * Get summary stats.
   */
  getSummary(): { critical: number; error: number; warning: number; total: number } {
    const issues = this.issues;
    return {
      critical: issues.filter(i => i.severity === 'critical').length,
      error: issues.filter(i => i.severity === 'error').length,
      warning: issues.filter(i => i.severity === 'warning').length,
      total: issues.length,
    };
  }

  /**
   * Reset all collected data.
   */
  reset(): void {
    this.issues = [];
    this.consoleErrors = [];
    this.ipcCalls = [];
    this.mainProcessErrors = [];
    this.pageErrors = [];
  }
}
