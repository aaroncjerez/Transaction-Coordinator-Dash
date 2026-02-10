/**
 * Core types for the TC Dashboard App Crawler + Auto Debugger/Fixer.
 */

// ===== Crawl Graph =====

export interface CrawlNode {
  id: string;                    // e.g. "page:/" or "modal:deal-detail"
  type: 'page' | 'modal' | 'dropdown' | 'form';
  route: string;                 // HashRouter path, e.g. "/pipeline"
  screenshot?: string;           // Path to screenshot artifact
  domSnapshot?: string;          // Path to HTML DOM snapshot
  interactiveElements: number;   // Count of discovered interactive elements
  timestamp: number;             // When this node was visited
}

export interface CrawlEdge {
  from: string;                  // Source CrawlNode.id
  to: string;                    // Target CrawlNode.id
  action: string;                // Human-readable action, e.g. "click sidebar link 'Pipeline'"
  selector: string;              // CSS selector used
  timestamp: number;
}

export interface CrawlGraph {
  nodes: CrawlNode[];
  edges: CrawlEdge[];
  startedAt: number;
  completedAt: number;
  totalActions: number;
}

// ===== Issue Detection =====

export type IssueSeverity = 'critical' | 'error' | 'warning';
export type IssueCategory = 'renderer' | 'main' | 'ipc' | 'network' | 'ui';

export interface Issue {
  id: string;                    // "ISS-001"
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  description: string;
  reproSteps: string[];          // Ordered steps to reproduce
  route: string;                 // Route where issue was found
  screenshot?: string;           // Screenshot at time of issue
  stackTrace?: string;           // Error stack trace if available
  sourceFile?: string;           // Resolved source file path
  sourceLine?: number;           // Line number in source
  consoleMessages?: string[];    // Related console messages
  ipcChannel?: string;           // IPC channel if IPC error
  timestamp: number;
  fixAttempted?: boolean;
  fixSucceeded?: boolean;
  fixDiff?: string;              // Patch diff if fix was applied
}

// ===== Fix Results =====

export interface FixPlan {
  issueId: string;
  rootCause: string;
  sourceFile: string;
  sourceLine: number;
  proposedFix: string;
  riskAssessment: 'low' | 'medium' | 'high';
}

export interface FixResult {
  issueId: string;
  success: boolean;
  patchDiff?: string;            // Unified diff of the change
  tsCheckPassed?: boolean;       // TypeScript compile check
  reproTestPassed?: boolean;     // Repro test passed after fix
  smokeTestPassed?: boolean;     // Quick smoke crawl passed
  error?: string;                // Why it failed
  revertedTo?: string;           // Git ref if reverted
}

// ===== Crawl Session =====

export interface CrawlSession {
  id: string;
  startedAt: number;
  completedAt?: number;
  graph: CrawlGraph;
  issues: Issue[];
  fixes: FixResult[];
  config: CrawlConfig;
}

// ===== Configuration =====

export interface CrawlConfig {
  /** Path to Electron binary or packaged app */
  electronPath: string;
  /** Use dev mode (localhost:3000) instead of packaged app */
  devMode: boolean;
  /** Block all external API calls */
  mockExternal: boolean;
  /** Block destructive actions */
  safeMode: boolean;
  /** IPC channels that must NEVER be invoked */
  forbiddenActions: string[];
  /** Keywords in button/action text that require opt-in */
  destructiveKeywords: string[];
  /** Max BFS depth for crawl */
  maxDepth: number;
  /** Max total actions before stopping */
  maxActions: number;
  /** Crawl timeout in milliseconds */
  timeout: number;
  /** Verbose logging */
  verbose: boolean;
  /** Project root (parent of tools/crawler/) */
  projectRoot: string;
}

// ===== Detector Hooks =====

export interface DetectorContext {
  route: string;
  action?: string;
  selector?: string;
}

export interface DetectedIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  description: string;
  stackTrace?: string;
  ipcChannel?: string;
  consoleMessages?: string[];
}

// ===== IPC Monitoring =====

export interface IpcCall {
  channel: string;
  args: any[];
  startedAt: number;
  completedAt?: number;
  duration?: number;
  result?: any;
  error?: string;
  timedOut?: boolean;
}
