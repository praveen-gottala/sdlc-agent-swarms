/**
 * @module gates/m4-gates
 *
 * Original 5 deterministic gates from M4 Reviewer.
 * Extracted to modular file for Phase 2 composition.
 */

import type { Diff, TaskCompletionReport } from '@agentforge/core';
import type { GateResult } from '../../../types.js';

export function runM4Gates(
  diff: Diff | null,
  report: TaskCompletionReport | null,
): GateResult[] {
  const results: GateResult[] = [];

  // Gate 1: File-path coverage
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

  // Gate 2: Single-writer check
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

  // Gate 3: PRD criterion coverage
  if (report) {
    results.push({
      name: 'prd-criterion-refs',
      passed: true,
      detail: report.patternsApplied.length > 0
        ? `Patterns applied: ${report.patternsApplied.join(', ')}`
        : 'No patterns referenced (informational — not blocking in v1)',
    });
  }

  // Gate 4: Governance scan
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

  // Gate 5: Diff sanity
  if (diff) {
    results.push({
      name: 'diff-non-empty',
      passed: diff.files.length > 0,
      detail: diff.files.length > 0
        ? `Diff contains ${diff.files.length} file(s)`
        : 'Empty diff — nothing to review',
    });
  }

  return results;
}
