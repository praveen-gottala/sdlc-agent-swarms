/**
 * @module deterministic-gates
 *
 * Reviewer Node 1: deterministic quality gates run before LLM review.
 * Checks file-path coverage, single-writer compliance, PRD criterion
 * references, and governance scans (license/secret).
 *
 * Vision Layer 9 pass 1 — deterministic gates.
 */

import { debugLog } from '@agentforge/core';
import type { ReviewerDeps, ReviewerNodeFn } from '../../deps.js';
import type { ReviewerStateType } from '../state.js';
import type { GateResult } from '../../types.js';

export function createDeterministicGates(_deps: ReviewerDeps): ReviewerNodeFn {
  return async (state: ReviewerStateType): Promise<Partial<ReviewerStateType>> => {
    debugLog('deterministicGates: ENTER');

    const results: GateResult[] = [];
    const diff = state.diff;
    const report = state.taskCompletionReport;

    // Gate 1: File-path coverage — every file in the diff must be
    // in the task's declared filePaths (via completionReport.filesWritten).
    if (diff && report) {
      const declaredFiles = new Set(report.filesWritten);
      const undeclaredFiles = diff.files
        .map((f) => f.path)
        .filter((p) => !declaredFiles.has(p));

      results.push({
        name: 'file-path-coverage',
        passed: undeclaredFiles.length === 0,
        detail: undeclaredFiles.length === 0
          ? `All ${diff.files.length} diff files declared in completion report`
          : `Undeclared files in diff: ${undeclaredFiles.join(', ')}`,
      });
    } else {
      results.push({
        name: 'file-path-coverage',
        passed: false,
        detail: 'Missing diff or task completion report — cannot verify coverage',
      });
    }

    // Gate 2: Single-writer check — no file should appear in more
    // than one diff hunk with conflicting operations.
    if (diff) {
      const filePaths = diff.files.map((f) => f.path);
      const duplicates = filePaths.filter(
        (p, i) => filePaths.indexOf(p) !== i,
      );

      results.push({
        name: 'single-writer',
        passed: duplicates.length === 0,
        detail: duplicates.length === 0
          ? 'No duplicate file entries in diff'
          : `Duplicate file entries: ${[...new Set(duplicates)].join(', ')}`,
      });
    }

    // Gate 3: PRD criterion coverage — completion report should reference
    // patterns applied (acceptance criteria IDs).
    if (report) {
      results.push({
        name: 'prd-criterion-refs',
        passed: true,
        detail: report.patternsApplied.length > 0
          ? `Patterns applied: ${report.patternsApplied.join(', ')}`
          : 'No patterns referenced (informational — not blocking in v1)',
      });
    }

    // Gate 4: Governance — license/secret scan (placeholder for
    // governance integration; checks deviationsFromContract).
    if (report) {
      const governanceIssues = report.deviationsFromContract.filter(
        (d) => d.toLowerCase().includes('license') || d.toLowerCase().includes('secret'),
      );

      results.push({
        name: 'governance-scan',
        passed: governanceIssues.length === 0,
        detail: governanceIssues.length === 0
          ? 'No license/secret governance issues'
          : `Governance issues: ${governanceIssues.join('; ')}`,
      });
    }

    // Gate 5: Diff sanity — diff must have at least one file.
    if (diff) {
      results.push({
        name: 'diff-non-empty',
        passed: diff.files.length > 0,
        detail: diff.files.length > 0
          ? `Diff contains ${diff.files.length} file(s)`
          : 'Empty diff — nothing to review',
      });
    }

    const allPassed = results.every((r) => r.passed);

    debugLog(
      `deterministicGates: EXIT — ${results.length} gates, ` +
      `${results.filter((r) => r.passed).length} passed, ` +
      `${results.filter((r) => !r.passed).length} failed`,
    );

    return { gateResults: results, gatesPassed: allPassed };
  };
}
