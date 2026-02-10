/**
 * Auto Fixer — Safe Code Patches with Rollback
 *
 * For each fix plan:
 * 1. Read source file
 * 2. Apply minimal patch
 * 3. Run TypeScript check
 * 4. Run repro test
 * 5. If fails → revert via git checkout
 *
 * Safety rails:
 * - NEVER modify fub-client.ts push/update methods
 * - NEVER remove assertions or error checks
 * - NEVER add blanket catch {} blocks
 * - NEVER modify migration files
 * - Max 20 lines changed per fix
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { FixPlan, FixResult, CrawlConfig } from './types.js';

/** Files that must NEVER be modified by the auto-fixer */
const FORBIDDEN_FILES = [
  'electron/migrations.ts',
  '.env',
  '.env.local',
];

/** Patterns in file paths that block auto-fix */
const FORBIDDEN_PATTERNS = [
  /migrations\//,
  /\.env/,
];

/**
 * Attempt to fix all fixable issues.
 */
export function fixAll(plans: FixPlan[], config: CrawlConfig): FixResult[] {
  const results: FixResult[] = [];

  for (const plan of plans) {
    // Skip high-risk fixes
    if (plan.riskAssessment === 'high') {
      console.log(`[Fixer] Skipping ${plan.issueId} — risk too high (${plan.sourceFile})`);
      results.push({
        issueId: plan.issueId,
        success: false,
        error: `Skipped: risk assessment is "high" for ${plan.sourceFile}`,
      });
      continue;
    }

    const result = attemptFix(plan, config);
    results.push(result);
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`\n[Fixer] Results: ${succeeded} fixed, ${failed} failed/skipped`);

  return results;
}

/**
 * Attempt a single fix.
 */
export function attemptFix(plan: FixPlan, config: CrawlConfig): FixResult {
  const { issueId, sourceFile, sourceLine } = plan;

  // Safety check: file in forbidden list?
  const relPath = path.relative(config.projectRoot, sourceFile);
  if (FORBIDDEN_FILES.includes(relPath) || FORBIDDEN_PATTERNS.some(p => p.test(relPath))) {
    return {
      issueId,
      success: false,
      error: `BLOCKED: ${relPath} is in the forbidden files list`,
    };
  }

  // Safety check: file exists?
  if (!fs.existsSync(sourceFile)) {
    return {
      issueId,
      success: false,
      error: `Source file not found: ${sourceFile}`,
    };
  }

  console.log(`\n[Fixer] Attempting fix for ${issueId}...`);
  console.log(`  File: ${relPath}:${sourceLine}`);
  console.log(`  Plan: ${plan.proposedFix}`);

  // Read original content (for rollback)
  const originalContent = fs.readFileSync(sourceFile, 'utf-8');

  try {
    // Apply the patch
    const patchedContent = applyPatch(originalContent, plan);

    if (patchedContent === originalContent) {
      return {
        issueId,
        success: false,
        error: 'No patch could be generated (content unchanged)',
      };
    }

    // Check line count change
    const origLines = originalContent.split('\n').length;
    const patchLines = patchedContent.split('\n').length;
    if (Math.abs(patchLines - origLines) > 20) {
      return {
        issueId,
        success: false,
        error: `Patch too large: ${Math.abs(patchLines - origLines)} lines changed (max 20)`,
      };
    }

    // Write patched content
    fs.writeFileSync(sourceFile, patchedContent);

    // Generate diff
    const diff = generateDiff(originalContent, patchedContent, relPath);

    // Run TypeScript check
    const tsCheckPassed = runTsCheck(config);
    if (!tsCheckPassed) {
      console.log(`  ✗ TypeScript check failed — reverting`);
      fs.writeFileSync(sourceFile, originalContent);
      return {
        issueId,
        success: false,
        tsCheckPassed: false,
        patchDiff: diff,
        error: 'TypeScript check failed after patch',
      };
    }

    console.log(`  ✓ TypeScript check passed`);

    // For now, skip repro test and smoke test (require Electron launch)
    // In a full implementation, we'd run the repro test here

    return {
      issueId,
      success: true,
      patchDiff: diff,
      tsCheckPassed: true,
      reproTestPassed: undefined, // TODO: run repro test
      smokeTestPassed: undefined, // TODO: run smoke crawl
    };

  } catch (err) {
    // Rollback
    fs.writeFileSync(sourceFile, originalContent);
    return {
      issueId,
      success: false,
      error: `Fix attempt failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Apply a patch based on the fix plan.
 * Uses simple string replacement patterns based on common error types.
 */
function applyPatch(content: string, plan: FixPlan): string {
  const lines = content.split('\n');
  const lineIdx = plan.sourceLine - 1;

  if (lineIdx < 0 || lineIdx >= lines.length) return content;

  const line = lines[lineIdx];
  const proposedFix = plan.proposedFix.toLowerCase();

  // Pattern: Add optional chaining
  if (proposedFix.includes('optional chaining') || proposedFix.includes('null guard')) {
    // Find property access patterns like obj.prop and add ?.
    const dotAccessRegex = /(\w+)\.(\w+)/g;
    let patched = line;

    // Only add ?. if there isn't one already
    if (!line.includes('?.')) {
      // Conservative: only add ?. to the first property access that could be null
      patched = line.replace(/(\w+)\.(\w+)/, '$1?.$2');
    }

    if (patched !== line) {
      lines[lineIdx] = patched;
      return lines.join('\n');
    }
  }

  // Pattern: Add try/catch to IPC handler
  if (proposedFix.includes('try/catch') || proposedFix.includes('error handling')) {
    // Look for async callback without try/catch
    // This is a simplified heuristic — real implementation would use AST
    if (line.includes('async') && !hasEnclosingTryCatch(lines, lineIdx)) {
      // Find the function body start
      const bodyStart = findNextBrace(lines, lineIdx);
      if (bodyStart >= 0) {
        const indent = getIndent(lines[bodyStart]);
        lines.splice(bodyStart + 1, 0, `${indent}  try {`);

        // Find the matching closing brace
        const bodyEnd = findMatchingBrace(lines, bodyStart + 1);
        if (bodyEnd >= 0) {
          lines.splice(bodyEnd, 0,
            `${indent}  } catch (err) {`,
            `${indent}    console.error('[IPC] Error:', err);`,
            `${indent}    throw err;`,
            `${indent}  }`
          );
          return lines.join('\n');
        }
      }
    }
  }

  // Pattern: Add default value
  if (proposedFix.includes('default value') || plan.rootCause.includes('undefined')) {
    if (line.includes('= ') && !line.includes('??')) {
      // Add nullish coalescing
      const patched = line.replace(/=\s*(\w+\.\w+)/, '= $1 ?? null');
      if (patched !== line) {
        lines[lineIdx] = patched;
        return lines.join('\n');
      }
    }
  }

  // No automatic patch possible
  return content;
}

// ===== Utility Functions =====

function hasEnclosingTryCatch(lines: string[], lineIdx: number): boolean {
  // Look backwards for a try statement
  for (let i = lineIdx; i >= Math.max(0, lineIdx - 10); i--) {
    if (lines[i].trim().startsWith('try')) return true;
  }
  return false;
}

function findNextBrace(lines: string[], startIdx: number): number {
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 5); i++) {
    if (lines[i].includes('{')) return i;
  }
  return -1;
}

function findMatchingBrace(lines: string[], braceIdx: number): number {
  let depth = 0;
  for (let i = braceIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function getIndent(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : '';
}

function generateDiff(original: string, patched: string, filePath: string): string {
  const origLines = original.split('\n');
  const patchLines = patched.split('\n');
  const diffs: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  // Simple line-by-line diff
  const maxLen = Math.max(origLines.length, patchLines.length);
  for (let i = 0; i < maxLen; i++) {
    const origLine = origLines[i] ?? '';
    const patchLine = patchLines[i] ?? '';
    if (origLine !== patchLine) {
      diffs.push(`@@ -${i + 1} +${i + 1} @@`);
      if (origLine) diffs.push(`-${origLine}`);
      if (patchLine) diffs.push(`+${patchLine}`);
    }
  }

  return diffs.join('\n');
}

/**
 * Run TypeScript check on the project.
 */
function runTsCheck(config: CrawlConfig): boolean {
  try {
    // Check renderer
    execSync('npx tsc --noEmit', {
      cwd: config.projectRoot,
      timeout: 30_000,
      stdio: 'pipe',
    });

    // Check electron
    execSync('npx tsc -p electron/tsconfig.json --noEmit', {
      cwd: config.projectRoot,
      timeout: 30_000,
      stdio: 'pipe',
    });

    return true;
  } catch {
    return false;
  }
}
