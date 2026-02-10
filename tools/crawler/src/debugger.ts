/**
 * Auto Debugger — Root Cause Analysis
 *
 * For each detected issue:
 * 1. Parse stack traces to extract file paths + line numbers
 * 2. Resolve source maps (Vite → TypeScript source)
 * 3. Correlate IPC errors with handler code in ipc-handlers.ts
 * 4. Generate a fix plan before any code changes
 */

import path from 'path';
import fs from 'fs';
import type { Issue, FixPlan, CrawlConfig } from './types.js';

/**
 * Analyze issues and generate fix plans.
 */
export function analyzeIssues(issues: Issue[], config: CrawlConfig): FixPlan[] {
  const plans: FixPlan[] = [];

  for (const issue of issues) {
    // Only attempt to debug error+ severity
    if (issue.severity === 'warning') continue;

    const plan = analyzeIssue(issue, config);
    if (plan) {
      plans.push(plan);
      console.log(`[Debugger] Fix plan for ${issue.id}: ${plan.proposedFix.slice(0, 80)}`);
    }
  }

  return plans;
}

/**
 * Analyze a single issue and produce a fix plan.
 */
function analyzeIssue(issue: Issue, config: CrawlConfig): FixPlan | null {
  // Strategy 1: Parse stack trace
  if (issue.stackTrace) {
    const sourceInfo = parseStackTrace(issue.stackTrace, config);
    if (sourceInfo) {
      return {
        issueId: issue.id,
        rootCause: inferRootCause(issue, sourceInfo),
        sourceFile: sourceInfo.file,
        sourceLine: sourceInfo.line,
        proposedFix: inferFix(issue, sourceInfo),
        riskAssessment: assessRisk(issue, sourceInfo),
      };
    }
  }

  // Strategy 2: IPC correlation
  if (issue.ipcChannel) {
    const ipcInfo = findIpcHandler(issue.ipcChannel, config);
    if (ipcInfo) {
      return {
        issueId: issue.id,
        rootCause: `IPC handler for "${issue.ipcChannel}" at ${ipcInfo.file}:${ipcInfo.line} — ${issue.description}`,
        sourceFile: ipcInfo.file,
        sourceLine: ipcInfo.line,
        proposedFix: `Add error handling to IPC handler "${issue.ipcChannel}"`,
        riskAssessment: 'low',
      };
    }
  }

  // Strategy 3: Console error analysis
  if (issue.category === 'renderer' && issue.description) {
    const sourceInfo = inferFromDescription(issue.description, config);
    if (sourceInfo) {
      return {
        issueId: issue.id,
        rootCause: issue.description,
        sourceFile: sourceInfo.file,
        sourceLine: sourceInfo.line,
        proposedFix: inferFix(issue, sourceInfo),
        riskAssessment: assessRisk(issue, sourceInfo),
      };
    }
  }

  return null;
}

// ===== Stack Trace Parsing =====

interface SourceLocation {
  file: string;         // Absolute path to source file
  line: number;
  column?: number;
  functionName?: string;
}

/**
 * Parse a stack trace and resolve to TypeScript source locations.
 */
function parseStackTrace(stack: string, config: CrawlConfig): SourceLocation | null {
  // Match patterns like:
  //   at FunctionName (file:line:col)
  //   at file:line:col
  //   at FunctionName (/path/to/file.ts:123:45)
  const frameRegex = /at\s+(?:(\S+)\s+)?\(?([^():]+):(\d+):(\d+)\)?/g;
  let match;

  while ((match = frameRegex.exec(stack)) !== null) {
    const [, funcName, filePath, lineStr, colStr] = match;
    const line = parseInt(lineStr, 10);
    const col = parseInt(colStr, 10);

    // Skip node_modules and internal frames
    if (filePath.includes('node_modules') || filePath.includes('internal/')) continue;

    // Resolve relative to project root
    let resolvedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      resolvedPath = path.resolve(config.projectRoot, filePath);
    }

    // Check if file exists
    if (fs.existsSync(resolvedPath)) {
      return { file: resolvedPath, line, column: col, functionName: funcName };
    }

    // Try resolving from electron-dist/ → electron/ (compiled → source)
    if (resolvedPath.includes('electron-dist')) {
      const tsPath = resolvedPath.replace('electron-dist/', '').replace('.js', '.ts');
      if (fs.existsSync(tsPath)) {
        return { file: tsPath, line, column: col, functionName: funcName };
      }
    }
  }

  return null;
}

// ===== IPC Handler Correlation =====

interface IpcHandlerInfo {
  file: string;
  line: number;
  channel: string;
}

/**
 * Find the IPC handler for a given channel name in ipc-handlers.ts.
 */
function findIpcHandler(channel: string, config: CrawlConfig): IpcHandlerInfo | null {
  const handlersFile = path.join(config.projectRoot, 'electron', 'ipc-handlers.ts');
  if (!fs.existsSync(handlersFile)) return null;

  const content = fs.readFileSync(handlersFile, 'utf-8');
  const lines = content.split('\n');

  // Search for ipcMain.handle('channel-name', ...)
  // The channel from IPC monitoring is like "electronAPI.db.getDeals"
  // We need to map it back to the raw channel name
  const rawChannel = mapIpcChannelToRaw(channel);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`'${rawChannel}'`) || lines[i].includes(`"${rawChannel}"`)) {
      return { file: handlersFile, line: i + 1, channel: rawChannel };
    }
  }

  return null;
}

/**
 * Map IPC monitor channel names back to raw ipcMain.handle channel names.
 */
function mapIpcChannelToRaw(monitorChannel: string): string {
  // electronAPI.db.getDeals → db:deals:getAll
  const mappings: Record<string, string> = {
    'electronAPI.db.getDeals': 'db:deals:getAll',
    'electronAPI.db.getDealById': 'db:deals:getById',
    'electronAPI.db.insertDeal': 'db:deals:insert',
    'electronAPI.db.updateDeal': 'db:deals:update',
    'electronAPI.db.deleteDeal': 'db:deals:delete',
    'electronAPI.db.getTasks': 'db:tasks:getAll',
    'electronAPI.db.getTasksByDealId': 'db:tasks:getByDealId',
    'electronAPI.db.updateTask': 'db:tasks:update',
    'electronAPI.db.updateTaskWithLog': 'db:tasks:updateWithLog',
    'electronAPI.ai.askQuestion': 'ai:ask',
    'electronAPI.ai.analyzeDeal': 'ai:analyzeDeal',
    'electronAPI.kpi.getDashboardData': 'kpi:getDashboardData',
    'electronAPI.kpi.getCeoBrief': 'kpi:getCeoBrief',
    'electronAPI.settings.getAll': 'settings:getAll',
    'electronAPI.settings.get': 'settings:get',
    'electronAPI.settings.set': 'settings:set',
    'electronAPI.deadlines.getUpcoming': 'deadlines:getUpcoming',
    'electronAPI.deadlines.getAll': 'deadlines:getAll',
  };

  return mappings[monitorChannel] || monitorChannel;
}

// ===== Root Cause Inference =====

function inferRootCause(issue: Issue, source: SourceLocation): string {
  const desc = issue.description.toLowerCase();

  if (desc.includes('cannot read properties of null') || desc.includes('cannot read properties of undefined')) {
    return `Null/undefined access at ${source.file}:${source.line} — missing null guard`;
  }

  if (desc.includes('is not a function')) {
    return `Type error at ${source.file}:${source.line} — called non-function value`;
  }

  if (desc.includes('sqlite') || desc.includes('database')) {
    return `Database error at ${source.file}:${source.line} — ${issue.description}`;
  }

  return `Runtime error at ${source.file}:${source.line} — ${issue.description.slice(0, 100)}`;
}

function inferFix(issue: Issue, source: SourceLocation): string {
  const desc = issue.description.toLowerCase();

  if (desc.includes('cannot read properties of null') || desc.includes('cannot read properties of undefined')) {
    return `Add optional chaining (?.) or null guard at ${source.file}:${source.line}`;
  }

  if (desc.includes('is not a function')) {
    return `Add type check before function call at ${source.file}:${source.line}`;
  }

  if (issue.category === 'ipc') {
    return `Wrap IPC handler in try/catch with proper error return at ${source.file}:${source.line}`;
  }

  return `Investigate and fix error at ${source.file}:${source.line}`;
}

function assessRisk(issue: Issue, source: SourceLocation): 'low' | 'medium' | 'high' {
  // Check if file is in forbidden list
  if (source.file.includes('fub-client.ts')) return 'high';
  if (source.file.includes('migrations')) return 'high';

  // IPC handler fixes are usually low risk
  if (source.file.includes('ipc-handlers.ts')) return 'low';

  // Renderer component fixes are low risk
  if (source.file.includes('components/') || source.file.includes('pages/')) return 'low';

  return 'medium';
}

// ===== Description-based inference =====

function inferFromDescription(description: string, config: CrawlConfig): SourceLocation | null {
  // Look for file references in the description
  const fileRefRegex = /(?:at\s+)?([A-Za-z_/]+\.(?:tsx?|jsx?))(?::(\d+))?/;
  const match = description.match(fileRefRegex);

  if (match) {
    const filePath = path.resolve(config.projectRoot, match[1]);
    const line = match[2] ? parseInt(match[2], 10) : 1;

    if (fs.existsSync(filePath)) {
      return { file: filePath, line };
    }
  }

  return null;
}
