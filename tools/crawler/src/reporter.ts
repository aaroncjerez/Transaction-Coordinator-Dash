/**
 * Report Generator — Creates a Markdown crawl report.
 */

import path from 'path';
import fs from 'fs';
import type { CrawlGraph, Issue, FixResult, CrawlConfig } from './types.js';

export interface ReportData {
  graph: CrawlGraph;
  issues: Issue[];
  fixes: FixResult[];
  ipcCalls: any[];
  config: CrawlConfig;
}

/**
 * Generate a Markdown report from crawl results.
 */
export function generateReport(data: ReportData): string {
  const { graph, issues, fixes, ipcCalls, config } = data;
  const date = new Date().toISOString().slice(0, 10);
  const duration = ((graph.completedAt - graph.startedAt) / 1000).toFixed(1);

  const pages = graph.nodes.filter(n => n.type === 'page');
  const modals = graph.nodes.filter(n => n.type === 'modal');
  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const errorIssues = issues.filter(i => i.severity === 'error');
  const warningIssues = issues.filter(i => i.severity === 'warning');
  const fixedCount = fixes.filter(f => f.success).length;
  const failedFixCount = fixes.filter(f => !f.success).length;

  let md = `# TC Dashboard — Crawl Report

**Date**: ${date} | **Duration**: ${duration}s | **Coverage**: ${pages.length} pages, ${modals.length} modals

---

## Crawl Coverage

`;

  for (const node of graph.nodes) {
    const icon = node.type === 'page' ? '📄' : '🔲';
    md += `${icon} **${node.route}** (${node.type}) — ${node.interactiveElements} interactive elements\n`;
  }

  md += `
**Total actions**: ${graph.totalActions}
**IPC calls recorded**: ${ipcCalls.length}

---

## Issues Found: ${issues.length}

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${criticalIssues.length} |
| 🟠 Error | ${errorIssues.length} |
| 🟡 Warning | ${warningIssues.length} |

`;

  if (issues.length === 0) {
    md += `*No issues detected!*\n\n`;
  }

  // Critical issues
  if (criticalIssues.length > 0) {
    md += `### 🔴 Critical Issues\n\n`;
    for (const issue of criticalIssues) {
      md += formatIssue(issue, fixes);
    }
  }

  // Error issues
  if (errorIssues.length > 0) {
    md += `### 🟠 Error Issues\n\n`;
    for (const issue of errorIssues) {
      md += formatIssue(issue, fixes);
    }
  }

  // Warning issues
  if (warningIssues.length > 0) {
    md += `### 🟡 Warnings\n\n`;
    for (const issue of warningIssues) {
      md += formatIssue(issue, fixes);
    }
  }

  // Fix summary
  if (fixes.length > 0) {
    md += `---\n\n## Auto-Fix Results\n\n`;
    md += `| Issue | Status | Details |\n`;
    md += `|-------|--------|---------|\n`;

    for (const fix of fixes) {
      const status = fix.success ? '✅ Fixed' : '❌ Failed';
      const details = fix.success
        ? `TS check: ${fix.tsCheckPassed ? 'pass' : 'fail'}`
        : (fix.error || 'Unknown error').slice(0, 60);
      md += `| ${fix.issueId} | ${status} | ${details} |\n`;
    }

    md += `\n**Summary**: ${fixedCount} fixed, ${failedFixCount} failed/skipped\n\n`;
  }

  // Fix diffs
  const successfulFixes = fixes.filter(f => f.success && f.patchDiff);
  if (successfulFixes.length > 0) {
    md += `---\n\n## Applied Patches\n\n`;
    for (const fix of successfulFixes) {
      md += `### ${fix.issueId}\n\n`;
      md += '```diff\n';
      md += fix.patchDiff;
      md += '\n```\n\n';
    }
  }

  // IPC summary
  if (ipcCalls.length > 0) {
    md += `---\n\n## IPC Call Summary\n\n`;

    const channelCounts: Record<string, { count: number; errors: number; avgDuration: number }> = {};
    for (const call of ipcCalls) {
      if (!channelCounts[call.channel]) {
        channelCounts[call.channel] = { count: 0, errors: 0, avgDuration: 0 };
      }
      channelCounts[call.channel].count++;
      if (call.error) channelCounts[call.channel].errors++;
      channelCounts[call.channel].avgDuration += call.duration || 0;
    }

    md += `| Channel | Calls | Errors | Avg Duration |\n`;
    md += `|---------|-------|--------|-------------|\n`;
    for (const [channel, stats] of Object.entries(channelCounts)) {
      const avg = stats.count > 0 ? Math.round(stats.avgDuration / stats.count) : 0;
      md += `| ${channel} | ${stats.count} | ${stats.errors} | ${avg}ms |\n`;
    }
    md += '\n';
  }

  // Config summary
  md += `---\n\n## Configuration\n\n`;
  md += `- **Mode**: ${config.devMode ? 'Development' : 'Packaged app'}\n`;
  md += `- **Mock external**: ${config.mockExternal}\n`;
  md += `- **Safe mode**: ${config.safeMode}\n`;
  md += `- **Max depth**: ${config.maxDepth}\n`;
  md += `- **Max actions**: ${config.maxActions}\n`;
  md += `- **Timeout**: ${config.timeout / 1000}s\n`;

  return md;
}

/**
 * Write report to file.
 */
export function writeReport(data: ReportData): string {
  const md = generateReport(data);
  const date = new Date().toISOString().slice(0, 10);
  const reportsDir = path.join(data.config.projectRoot, 'tools', 'crawler', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const reportPath = path.join(reportsDir, `crawl-report-${date}.md`);
  fs.writeFileSync(reportPath, md);

  console.log(`[Reporter] Report written to: ${reportPath}`);
  return reportPath;
}

function formatIssue(issue: Issue, fixes: FixResult[]): string {
  const fix = fixes.find(f => f.issueId === issue.id);
  const fixStatus = fix
    ? (fix.success ? ' — ✅ Fixed' : ' — ❌ Needs Manual Fix')
    : '';

  let md = `#### ${issue.id}: ${issue.title}${fixStatus}\n\n`;
  md += `- **Severity**: ${issue.severity}\n`;
  md += `- **Category**: ${issue.category}\n`;
  md += `- **Route**: ${issue.route}\n`;

  if (issue.description) {
    md += `- **Description**: ${issue.description.slice(0, 200)}\n`;
  }

  if (issue.sourceFile) {
    md += `- **Source**: \`${issue.sourceFile}:${issue.sourceLine}\`\n`;
  }

  if (issue.ipcChannel) {
    md += `- **IPC Channel**: ${issue.ipcChannel}\n`;
  }

  if (issue.reproSteps && issue.reproSteps.length > 0) {
    md += `- **Repro steps**:\n`;
    for (const step of issue.reproSteps) {
      md += `  1. ${step}\n`;
    }
  }

  if (issue.screenshot) {
    const relPath = path.relative(path.join(process.cwd(), 'reports'), issue.screenshot);
    md += `- **Screenshot**: [view](${relPath})\n`;
  }

  md += '\n';
  return md;
}
