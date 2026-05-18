/**
 * @module gates/rubric-gates
 *
 * 3 deterministic gates extracted from /review-plan-impl rubric.
 * Requires optional plan file path for coverage checks.
 */

import type { Diff } from '@agentforge/core';
import type { GateResult } from '../../../types.js';

export function runRubricGates(
  diff: Diff | null,
  planFilePaths: readonly string[] | null,
): GateResult[] {
  if (!diff) return [];

  const results: GateResult[] = [];
  const diffPaths = diff.files.map((f) => f.path);

  // Gate: plan-file-coverage — non-blocking (plan may not be available)
  if (planFilePaths && planFilePaths.length > 0) {
    const missingFromDiff = planFilePaths.filter((p) => !diffPaths.includes(p));
    results.push({
      name: 'plan-file-coverage',
      passed: missingFromDiff.length === 0,
      detail: missingFromDiff.length === 0
        ? `All ${planFilePaths.length} plan files present in diff`
        : `Plan files missing from diff: ${missingFromDiff.join(', ')}`,
    });
  } else {
    results.push({
      name: 'plan-file-coverage',
      passed: true,
      detail: 'No plan file paths available — skipping coverage check',
    });
  }

  // Gate: scope-creep-classification — non-blocking
  if (planFilePaths && planFilePaths.length > 0) {
    const plannedSet = new Set(planFilePaths);
    const unplanned = diffPaths.filter((p) => !plannedSet.has(p));
    results.push({
      name: 'scope-creep-classification',
      passed: unplanned.length === 0,
      detail: unplanned.length === 0
        ? 'No files outside plan scope'
        : `Unplanned files (needs classification): ${unplanned.join(', ')}`,
    });
  } else {
    results.push({
      name: 'scope-creep-classification',
      passed: true,
      detail: 'No plan available — cannot classify scope',
    });
  }

  // Gate: dead-code-hint — non-blocking
  const unusedImportPattern = /^[+]\s*import\s+.*from\s+['"].*['"]\s*;?\s*$/;
  const addedImports: { path: string; importLine: string }[] = [];
  for (const file of diff.files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.content.split('\n')) {
        if (unusedImportPattern.test(line)) {
          addedImports.push({ path: file.path, importLine: line.replace(/^\+\s*/, '').trim() });
        }
      }
    }
  }

  const removedLines = new Set<string>();
  for (const file of diff.files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.content.split('\n')) {
        if (line.startsWith('-')) {
          removedLines.add(line.slice(1).trim());
        }
      }
    }
  }

  const possiblyUnused = addedImports.filter((imp) => {
    const importedName = imp.importLine.match(/import\s+(?:type\s+)?{\s*([^}]+)\s*}/);
    if (!importedName) return false;
    const names = importedName[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!.trim());
    return names.some((name) => {
      const usagePattern = new RegExp(`\\b${name}\\b`);
      const fileHunks = diff.files
        .filter((f) => f.path === imp.path)
        .flatMap((f) => f.hunks)
        .map((h) => h.content)
        .join('\n');
      const addedContent = fileHunks
        .split('\n')
        .filter((l) => l.startsWith('+') && !unusedImportPattern.test(l))
        .join('\n');
      return !usagePattern.test(addedContent) && !removedLines.has(imp.importLine);
    });
  });

  results.push({
    name: 'dead-code-hint',
    passed: possiblyUnused.length === 0,
    detail: possiblyUnused.length === 0
      ? 'No potentially unused imports detected in diff'
      : `Possibly unused imports: ${possiblyUnused.map((i) => `${i.path}: ${i.importLine.slice(0, 60)}`).join('; ')}`,
  });

  return results;
}
