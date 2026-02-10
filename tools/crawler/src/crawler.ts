/**
 * Electron Crawler — Playwright-powered BFS traversal of the TC Dashboard app.
 *
 * Launches the Electron app, navigates every page/modal/interaction,
 * captures screenshots + DOM snapshots, and detects issues via the Detector.
 */

import { _electron, type ElectronApplication, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import type { CrawlConfig, CrawlNode, CrawlEdge, CrawlGraph, Issue } from './types.js';
import { Detector } from './detector.js';
import { createFixtureDatabase, getMockEnv } from './mock-layer.js';

/** All known sidebar routes from App.tsx */
const ROUTES = [
  { path: '/', label: 'Dashboard', selector: 'a[href="#/"], [data-testid="nav-dashboard"]' },
  { path: '/pipeline', label: 'Pipeline', selector: 'a[href="#/pipeline"]' },
  { path: '/tasks', label: 'Tasks', selector: 'a[href="#/tasks"]' },
  { path: '/analytics', label: 'Analytics', selector: 'a[href="#/analytics"]' },
  { path: '/kpis', label: 'KPIs', selector: 'a[href="#/kpis"]' },
  { path: '/archive', label: 'Archive', selector: 'a[href="#/archive"]' },
  { path: '/settings', label: 'Settings', selector: 'a[href="#/settings"]' },
];

export interface CrawlResult {
  graph: CrawlGraph;
  issues: Issue[];
  ipcCalls: any[];
}

export async function runCrawl(config: CrawlConfig): Promise<CrawlResult> {
  const startedAt = Date.now();
  const nodes: CrawlNode[] = [];
  const edges: CrawlEdge[] = [];
  const issues: Issue[] = [];
  let issueCounter = 0;
  let actionCount = 0;

  const artifactsDir = path.join(config.projectRoot, 'tools', 'crawler', 'artifacts');
  const screenshotsDir = path.join(artifactsDir, 'screenshots');
  const domDir = path.join(artifactsDir, 'dom');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(domDir, { recursive: true });

  // Create fixture database
  console.log('[Crawler] Creating fixture database...');
  const fixtureDir = createFixtureDatabase(config);

  // Prepare environment (filter out undefined values for Playwright compatibility)
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  Object.assign(env, getMockEnv(fixtureDir));

  // Determine launch args
  let launchArgs: string[];
  let executablePath: string | undefined;

  if (config.electronPath.includes('.app/')) {
    // Packaged app — use executablePath
    executablePath = config.electronPath;
    launchArgs = [];
  } else {
    // Dev mode — electron binary + project root
    executablePath = config.electronPath;
    launchArgs = [config.projectRoot];
  }

  console.log(`[Crawler] Launching Electron app...`);
  console.log(`  Path: ${executablePath}`);
  console.log(`  Args: ${launchArgs.join(' ') || '(none)'}`);
  console.log(`  Mock: ${config.mockExternal ? 'ON' : 'OFF'}`);

  let electronApp: ElectronApplication;
  try {
    electronApp = await _electron.launch({
      executablePath,
      args: launchArgs,
      env,
      timeout: 30_000,
    });
  } catch (err) {
    console.error('[Crawler] Failed to launch Electron app:', err);
    issues.push({
      id: `ISS-${String(++issueCounter).padStart(3, '0')}`,
      severity: 'critical',
      category: 'main',
      title: 'Failed to launch Electron app',
      description: `Launch failed: ${err instanceof Error ? err.message : String(err)}`,
      reproSteps: ['Attempt to launch the packaged app'],
      route: 'N/A',
      timestamp: Date.now(),
    });

    return {
      graph: { nodes, edges, startedAt, completedAt: Date.now(), totalActions: 0 },
      issues,
      ipcCalls: [],
    };
  }

  // Set up detector
  const detector = new Detector(config.verbose);
  detector.attachToElectronApp(electronApp);

  // Monitor stdout/stderr for debugging
  electronApp.process().stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) console.log(`[Electron:stdout] ${text}`);
  });
  electronApp.process().stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text && !text.includes('DevTools') && !text.includes('inspector')) {
      console.log(`[Electron:stderr] ${text}`);
    }
  });

  // Get the main window
  console.log('[Crawler] Waiting for first window...');
  const page = await electronApp.firstWindow();
  detector.attachToPage(page);

  // Wait for app to be ready
  console.log('[Crawler] Waiting for app to initialize...');

  if (config.verbose) {
    const debugInfo = await electronApp.evaluate(({ app }) => ({
      isPackaged: app.isPackaged,
      mockExternal: process.env.MOCK_EXTERNAL,
      crawlerDataDir: process.env.TC_CRAWLER_DATA_DIR,
    }));
    console.log(`[Crawler] App env:`, JSON.stringify(debugInfo));
  }

  try {
    await page.waitForSelector('#root', { timeout: 15_000 });
    await page.waitForTimeout(2000); // Let React render
  } catch {
    issues.push({
      id: `ISS-${String(++issueCounter).padStart(3, '0')}`,
      severity: 'critical',
      category: 'ui',
      title: 'App failed to render #root element',
      description: '#root element not found within 15s of launch',
      reproSteps: ['Launch the app', 'Wait 15 seconds'],
      route: '/',
      timestamp: Date.now(),
    });
  }

  // Inject IPC monitoring
  await detector.injectIpcMonitor(page);

  // Check for blank screen on initial load
  const blankCheck = await detector.checkBlankScreen(page);
  if (blankCheck) {
    issues.push({
      id: `ISS-${String(++issueCounter).padStart(3, '0')}`,
      severity: blankCheck.severity,
      category: blankCheck.category,
      title: blankCheck.title,
      description: blankCheck.description,
      reproSteps: ['Launch the app'],
      route: '/',
      timestamp: Date.now(),
    });
  }

  // Phase 1: Navigate each page via sidebar
  console.log('[Crawler] Phase 1: Navigating sidebar pages...');
  for (const route of ROUTES) {
    if (actionCount >= config.maxActions) break;

    try {
      console.log(`  → ${route.label} (${route.path})`);

      // Try to find and click the sidebar link
      const navClicked = await navigateToRoute(page, route);
      actionCount++;

      if (!navClicked) {
        // Fallback: direct hash navigation
        await page.evaluate((path) => {
          window.location.hash = `#${path}`;
        }, route.path);
        await page.waitForTimeout(1500);
      }

      // Wait for content to render
      await page.waitForTimeout(1500);

      // Re-inject IPC monitor (in case page navigated)
      await detector.injectIpcMonitor(page);

      // Screenshot
      const screenshotPath = path.join(screenshotsDir, `${route.label.toLowerCase()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // DOM snapshot
      const domPath = path.join(domDir, `${route.label.toLowerCase()}.html`);
      const html = await page.content();
      fs.writeFileSync(domPath, html);

      // Count interactive elements
      const interactiveCount = await page.evaluate(() => {
        return document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick]').length;
      });

      // Record node
      nodes.push({
        id: `page:${route.path}`,
        type: 'page',
        route: route.path,
        screenshot: screenshotPath,
        domSnapshot: domPath,
        interactiveElements: interactiveCount,
        timestamp: Date.now(),
      });

      // Check for blank screen
      const blank = await detector.checkBlankScreen(page, 3000);
      if (blank) {
        issues.push({
          id: `ISS-${String(++issueCounter).padStart(3, '0')}`,
          severity: blank.severity,
          category: blank.category,
          title: `${route.label}: ${blank.title}`,
          description: blank.description,
          reproSteps: [`Navigate to ${route.label} page`],
          route: route.path,
          screenshot: screenshotPath,
          timestamp: Date.now(),
        });
      }

      // Collect IPC data
      await detector.collectIpcCalls(page);

      // Check for visible error UI
      const errorUi = await page.evaluate(() => {
        const errorBoundary = document.querySelector('[data-testid="error-boundary"]');
        const errorText = document.querySelector('.error-state, .error-message');
        return {
          hasErrorBoundary: !!errorBoundary,
          hasErrorText: !!errorText,
          errorTextContent: errorText?.textContent?.slice(0, 200) || null,
        };
      });

      if (errorUi.hasErrorBoundary) {
        issues.push({
          id: `ISS-${String(++issueCounter).padStart(3, '0')}`,
          severity: 'error',
          category: 'renderer',
          title: `${route.label}: React error boundary triggered`,
          description: `Error boundary UI visible on ${route.path}`,
          reproSteps: [`Navigate to ${route.label} page`],
          route: route.path,
          screenshot: screenshotPath,
          timestamp: Date.now(),
        });
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠ Error on ${route.label}: ${msg}`);
      issues.push({
        id: `ISS-${String(++issueCounter).padStart(3, '0')}`,
        severity: 'error',
        category: 'renderer',
        title: `${route.label}: Navigation/render error`,
        description: msg,
        reproSteps: [`Navigate to ${route.label} page`],
        route: route.path,
        stackTrace: err instanceof Error ? err.stack : undefined,
        timestamp: Date.now(),
      });
    }
  }

  // Phase 2: Interact with Pipeline page (open deal modal)
  console.log('[Crawler] Phase 2: Testing deal modal interactions...');
  if (actionCount < config.maxActions) {
    try {
      // Navigate to pipeline
      await page.evaluate(() => { window.location.hash = '#/pipeline'; });
      await page.waitForTimeout(2000);
      await detector.injectIpcMonitor(page);

      // Try to click on a deal card
      const dealCards = await page.$$('[class*="kanban"] [class*="card"], [class*="deal-card"], [data-deal-id]');
      if (dealCards.length > 0) {
        console.log(`  → Found ${dealCards.length} deal cards, clicking first...`);
        await dealCards[0].click();
        actionCount++;
        await page.waitForTimeout(2000);

        // Check if modal opened
        const modalOpen = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="Modal"]');
          return !!modal;
        });

        if (modalOpen) {
          console.log('  → Deal modal opened');

          const screenshotPath = path.join(screenshotsDir, 'deal-modal.png');
          await page.screenshot({ path: screenshotPath });

          nodes.push({
            id: 'modal:deal-detail',
            type: 'modal',
            route: '/deals/:id',
            screenshot: screenshotPath,
            interactiveElements: 0,
            timestamp: Date.now(),
          });

          edges.push({
            from: 'page:/pipeline',
            to: 'modal:deal-detail',
            action: 'Click deal card',
            selector: '[data-deal-id]',
            timestamp: Date.now(),
          });

          // Try clicking modal tabs (Overview, Tasks, Files, Activity)
          const tabs = await page.$$('[role="tab"], [class*="tab"], button:has-text("Tasks"), button:has-text("Files"), button:has-text("Activity")');
          for (const tab of tabs.slice(0, 4)) {
            if (actionCount >= config.maxActions) break;
            try {
              const tabText = await tab.textContent();
              console.log(`  → Clicking tab: ${tabText?.trim()}`);
              await tab.click();
              actionCount++;
              await page.waitForTimeout(1000);

              const tabScreenshot = path.join(screenshotsDir, `deal-modal-tab-${tabText?.trim()?.toLowerCase()?.replace(/\s+/g, '-')}.png`);
              await page.screenshot({ path: tabScreenshot });
            } catch { /* tab might not be clickable */ }
          }

          // Close modal (Escape or close button)
          try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
          } catch { /* ignore */ }
        } else {
          console.log('  → No modal detected after clicking deal card');
        }

        await detector.collectIpcCalls(page);
      } else {
        console.log('  → No deal cards found on pipeline page');
      }
    } catch (err) {
      console.warn(`  ⚠ Pipeline interaction error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Phase 3: Test task interactions on Tasks page
  console.log('[Crawler] Phase 3: Testing task interactions...');
  if (actionCount < config.maxActions) {
    try {
      await page.evaluate(() => { window.location.hash = '#/tasks'; });
      await page.waitForTimeout(2000);
      await detector.injectIpcMonitor(page);

      // Check for task list items
      const taskRows = await page.$$('tr, [class*="task-row"], [class*="TaskRow"]');
      console.log(`  → Found ${taskRows.length} task rows`);

      // Try filter dropdowns
      const selects = await page.$$('select');
      for (const select of selects.slice(0, 2)) {
        if (actionCount >= config.maxActions) break;
        try {
          await select.click();
          actionCount++;
          await page.waitForTimeout(500);
        } catch { /* ignore */ }
      }

      await detector.collectIpcCalls(page);
    } catch (err) {
      console.warn(`  ⚠ Tasks page error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Phase 4: Test Settings page forms
  console.log('[Crawler] Phase 4: Testing Settings page...');
  if (actionCount < config.maxActions) {
    try {
      await page.evaluate(() => { window.location.hash = '#/settings'; });
      await page.waitForTimeout(2000);
      await detector.injectIpcMonitor(page);

      // Check for form inputs
      const inputs = await page.$$('input[type="text"], input[type="password"], input[type="url"]');
      console.log(`  → Found ${inputs.length} form inputs on Settings`);

      const screenshotPath = path.join(screenshotsDir, 'settings-form.png');
      await page.screenshot({ path: screenshotPath });

      await detector.collectIpcCalls(page);
    } catch (err) {
      console.warn(`  ⚠ Settings page error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Final collection
  const finalIpcCalls = detector.getIpcCalls();
  const detectedIssues = detector.getIssues();

  // Merge detector issues into main issues list
  for (const di of detectedIssues) {
    // Skip duplicates
    if (issues.some(i => i.title === di.title)) continue;

    issues.push({
      id: `ISS-${String(++issueCounter).padStart(3, '0')}`,
      severity: di.severity,
      category: di.category,
      title: di.title,
      description: di.description,
      reproSteps: [],
      route: 'various',
      stackTrace: di.stackTrace,
      ipcChannel: di.ipcChannel,
      consoleMessages: di.consoleMessages,
      timestamp: Date.now(),
    });
  }

  // Close app
  console.log('[Crawler] Closing app...');
  try {
    await electronApp.close();
  } catch {
    console.warn('[Crawler] App did not close cleanly');
  }

  const completedAt = Date.now();
  const duration = ((completedAt - startedAt) / 1000).toFixed(1);

  console.log(`\n[Crawler] Complete!`);
  console.log(`  Duration: ${duration}s`);
  console.log(`  Pages: ${nodes.filter(n => n.type === 'page').length}`);
  console.log(`  Modals: ${nodes.filter(n => n.type === 'modal').length}`);
  console.log(`  Actions: ${actionCount}`);
  console.log(`  IPC calls: ${finalIpcCalls.length}`);
  console.log(`  Issues: ${issues.length} (${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'error').length} error, ${issues.filter(i => i.severity === 'warning').length} warning)`);

  const graph: CrawlGraph = {
    nodes,
    edges,
    startedAt,
    completedAt,
    totalActions: actionCount,
  };

  return { graph, issues, ipcCalls: finalIpcCalls };
}

/**
 * Try to navigate to a route by clicking sidebar links.
 */
async function navigateToRoute(page: Page, route: { path: string; label: string; selector: string }): Promise<boolean> {
  try {
    // Try the explicit selector first
    const link = await page.$(route.selector);
    if (link) {
      await link.click();
      await page.waitForTimeout(500);
      return true;
    }

    // Fallback: look for links containing the label text
    const links = await page.$$(`a, [role="link"], [role="button"]`);
    for (const l of links) {
      const text = await l.textContent();
      if (text?.trim().toLowerCase().includes(route.label.toLowerCase())) {
        await l.click();
        await page.waitForTimeout(500);
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
