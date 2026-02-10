/**
 * TC Dashboard — App Crawler CLI
 *
 * Usage:
 *   npx tsx cli.ts crawl [--verbose] [--dev] [--max-depth N] [--max-actions N]
 *   npx tsx cli.ts repro [issue-id]
 *   npx tsx cli.ts fix [issue-id]
 *   npx tsx cli.ts fix-all
 *   npx tsx cli.ts report
 *   npx tsx cli.ts full        # crawl → repro → fix-all → report
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getConfig } from './config/crawler.config.js';
import { runCrawl } from './src/crawler.js';
import { generateReproTests } from './src/repro-generator.js';
import { analyzeIssues } from './src/debugger.js';
import { fixAll, attemptFix } from './src/fixer.js';
import { writeReport } from './src/reporter.js';
import type { Issue, FixResult, CrawlGraph } from './src/types.js';

const args = process.argv.slice(2);
const command = args[0];

// Parse flags
const flags = {
  verbose: args.includes('--verbose') || args.includes('-v'),
  dev: args.includes('--dev'),
  maxDepth: parseIntFlag(args, '--max-depth'),
  maxActions: parseIntFlag(args, '--max-actions'),
  timeout: parseIntFlag(args, '--timeout'),
};

function parseIntFlag(args: string[], flag: string): number | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return parseInt(args[idx + 1], 10);
  }
  return undefined;
}

// Artifacts directory
const crawlerDir = path.dirname(fileURLToPath(import.meta.url));
const artifactsDir = path.join(crawlerDir, 'artifacts');
const issuesPath = path.join(artifactsDir, 'issues.json');
const coveragePath = path.join(artifactsDir, 'coverage.json');
const ipcCallsPath = path.join(artifactsDir, 'ipc-calls.json');
const fixesPath = path.join(artifactsDir, 'fixes.json');

async function main(): Promise<void> {
  if (!command) {
    printUsage();
    process.exit(1);
  }

  const config = getConfig({
    verbose: flags.verbose,
    devMode: flags.dev,
    ...(flags.maxDepth ? { maxDepth: flags.maxDepth } : {}),
    ...(flags.maxActions ? { maxActions: flags.maxActions } : {}),
    ...(flags.timeout ? { timeout: flags.timeout * 1000 } : {}),
  });

  switch (command) {
    case 'crawl':
      await doCrawl(config);
      break;

    case 'repro': {
      const targetId = args[1]?.startsWith('ISS-') ? args[1] : undefined;
      doRepro(config, targetId);
      break;
    }

    case 'fix': {
      const targetId = args[1]?.startsWith('ISS-') ? args[1] : undefined;
      doFix(config, targetId);
      break;
    }

    case 'fix-all':
      doFix(config);
      break;

    case 'report':
      doReport(config);
      break;

    case 'full':
      await doCrawl(config);
      doRepro(config);
      doFix(config);
      doReport(config);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

async function doCrawl(config: any): Promise<void> {
  console.log('\n=== TC Dashboard Crawler ===\n');

  const result = await runCrawl(config);

  // Save artifacts
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(issuesPath, JSON.stringify(result.issues, null, 2));
  fs.writeFileSync(coveragePath, JSON.stringify(result.graph, null, 2));
  fs.writeFileSync(ipcCallsPath, JSON.stringify(result.ipcCalls, null, 2));

  console.log(`\nArtifacts saved to: ${artifactsDir}`);
  console.log(`  - issues.json: ${result.issues.length} issues`);
  console.log(`  - coverage.json: ${result.graph.nodes.length} nodes, ${result.graph.edges.length} edges`);
  console.log(`  - ipc-calls.json: ${result.ipcCalls.length} calls`);
}

function doRepro(config: any, targetId?: string): void {
  console.log('\n=== Repro Test Generator ===\n');

  const issues = loadIssues();
  if (!issues) return;

  const result = generateReproTests(issues, config, targetId);
  console.log(`\nGenerated ${result.generated} repro tests, skipped ${result.skipped} warnings`);
}

function doFix(config: any, targetId?: string): void {
  console.log('\n=== Auto Fixer ===\n');

  const issues = loadIssues();
  if (!issues) return;

  // Run debugger to generate fix plans
  const plans = analyzeIssues(
    targetId ? issues.filter(i => i.id === targetId) : issues,
    config
  );

  if (plans.length === 0) {
    console.log('No fixable issues found (only warnings or no source location identified)');
    return;
  }

  console.log(`\nGenerated ${plans.length} fix plans\n`);

  // Apply fixes
  const results = fixAll(plans, config);

  // Save results
  fs.writeFileSync(fixesPath, JSON.stringify(results, null, 2));
  console.log(`\nFix results saved to: ${fixesPath}`);
}

function doReport(config: any): void {
  console.log('\n=== Report Generator ===\n');

  const issues = loadIssues();
  const graph = loadCoverage();
  const ipcCalls = loadIpcCalls();
  const fixes = loadFixes();

  if (!issues || !graph) return;

  const reportPath = writeReport({
    graph,
    issues,
    fixes: fixes || [],
    ipcCalls: ipcCalls || [],
    config,
  });

  console.log(`\nReport: ${reportPath}`);
}

// ===== Data Loading =====

function loadIssues(): Issue[] | null {
  if (!fs.existsSync(issuesPath)) {
    console.error(`No issues.json found. Run "crawl" first.`);
    return null;
  }
  return JSON.parse(fs.readFileSync(issuesPath, 'utf-8'));
}

function loadCoverage(): CrawlGraph | null {
  if (!fs.existsSync(coveragePath)) {
    console.error(`No coverage.json found. Run "crawl" first.`);
    return null;
  }
  return JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
}

function loadIpcCalls(): any[] | null {
  if (!fs.existsSync(ipcCallsPath)) return [];
  return JSON.parse(fs.readFileSync(ipcCallsPath, 'utf-8'));
}

function loadFixes(): FixResult[] | null {
  if (!fs.existsSync(fixesPath)) return [];
  return JSON.parse(fs.readFileSync(fixesPath, 'utf-8'));
}

function printUsage(): void {
  console.log(`
TC Dashboard — App Crawler + Auto Debugger/Fixer

Usage: npx tsx cli.ts <command> [options]

Commands:
  crawl              Launch app, crawl all pages, detect issues
  repro [issue-id]   Generate repro test(s) from issues.json
  fix [issue-id]     Attempt auto-fix for specific issue
  fix-all            Fix all fixable issues
  report             Generate markdown report from latest crawl
  full               Run full pipeline: crawl → repro → fix-all → report

Options:
  --dev              Use dev mode instead of packaged app
  --verbose, -v      Verbose logging
  --max-depth N      Override crawl depth (default: 5)
  --max-actions N    Override max actions (default: 200)
  --timeout N        Override timeout in seconds (default: 120)
`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
