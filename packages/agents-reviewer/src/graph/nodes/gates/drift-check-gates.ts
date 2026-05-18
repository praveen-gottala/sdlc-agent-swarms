/**
 * @module gates/drift-check-gates
 *
 * 8 deterministic gates extracted from /mid-session-drift-check.
 * Scans diff content for process violations.
 */

import type { Diff, ContractBundle } from '@agentforge/core';
import type { GateResult } from '../../../types.js';

function getAddedLines(diff: Diff): { path: string; line: string }[] {
  const added: { path: string; line: string }[] = [];
  for (const file of diff.files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.content.split('\n')) {
        if (line.startsWith('+')) {
          added.push({ path: file.path, line });
        }
      }
    }
  }
  return added;
}

function isTestFile(path: string): boolean {
  return path.includes('.test.') || path.includes('__tests__') || path.includes('__fixtures__');
}

function isScriptFile(path: string): boolean {
  return path.includes('/scripts/') || path.startsWith('scripts/') ||
    path.includes('/bin/') || path.startsWith('bin/');
}

export function runDriftCheckGates(
  diff: Diff | null,
  contractBundle: Partial<ContractBundle> | null,
): GateResult[] {
  if (!diff) return [];

  const results: GateResult[] = [];
  const addedLines = getAddedLines(diff);
  const prodAdded = addedLines.filter((l) => !isTestFile(l.path));
  const prodNonScript = prodAdded.filter((l) => !isScriptFile(l.path));

  // Gate: mocks-in-prod — BLOCKING
  const mockPatterns = /jest\.fn\(\)|vi\.fn\(\)|jest\.mock\(|vi\.mock\(|createMock/;
  const mockHits = prodAdded.filter((l) => mockPatterns.test(l.line));
  results.push({
    name: 'mocks-in-prod',
    passed: mockHits.length === 0,
    detail: mockHits.length === 0
      ? 'No mock patterns in production files'
      : `Mock patterns found: ${mockHits.map((h) => h.path).join(', ')}`,
  });

  // Gate: test-coverage-gap — non-blocking
  const newTsFiles = diff.files
    .filter((f) => f.operation === 'add' && f.path.endsWith('.ts') && !isTestFile(f.path))
    .map((f) => f.path);
  const testFiles = new Set(diff.files.map((f) => f.path).filter(isTestFile));
  const uncoveredNew = newTsFiles.filter((p) => {
    const expectedTest = p.replace('.ts', '.test.ts');
    return !testFiles.has(expectedTest);
  });
  results.push({
    name: 'test-coverage-gap',
    passed: uncoveredNew.length === 0,
    detail: uncoveredNew.length === 0
      ? 'All new .ts files have .test.ts companions'
      : `New files without tests: ${uncoveredNew.join(', ')}`,
  });

  // Gate: skipped-tests — BLOCKING
  const skipPatterns = /\.skip\(|\.only\(|\bxit\(|\bxdescribe\(|test\.fixme/;
  const testAdded = addedLines.filter((l) => isTestFile(l.path));
  const skipHits = testAdded.filter((l) => skipPatterns.test(l.line));
  results.push({
    name: 'skipped-tests',
    passed: skipHits.length === 0,
    detail: skipHits.length === 0
      ? 'No skipped/focused test markers in diff'
      : `Skipped test markers: ${skipHits.map((h) => `${h.path}: ${h.line.trim().slice(0, 80)}`).join('; ')}`,
  });

  // Gate: commented-out-code — non-blocking
  const codeCommentPattern = /^[+]\s*\/\/\s*(import|export|function|const|let|var|class|interface|type|return|if|for|while)\b/;
  const commentHits = prodAdded.filter((l) => codeCommentPattern.test(l.line));
  results.push({
    name: 'commented-out-code',
    passed: commentHits.length === 0,
    detail: commentHits.length === 0
      ? 'No commented-out code patterns in production files'
      : `Commented-out code: ${commentHits.length} occurrence(s) in ${[...new Set(commentHits.map((h) => h.path))].join(', ')}`,
  });

  // Gate: any-type-usage — non-blocking
  const anyPattern = /:\s*any\b|as\s+any\b/;
  const anyHits = prodAdded.filter((l) => anyPattern.test(l.line));
  results.push({
    name: 'any-type-usage',
    passed: anyHits.length === 0,
    detail: anyHits.length === 0
      ? 'No `any` type usage in production files'
      : `any usage: ${anyHits.map((h) => h.path).join(', ')}`,
  });

  // Gate: console-log-in-prod — non-blocking
  const consolePattern = /console\.log\(/;
  const consoleHits = prodNonScript.filter((l) => consolePattern.test(l.line));
  results.push({
    name: 'console-log-in-prod',
    passed: consoleHits.length === 0,
    detail: consoleHits.length === 0
      ? 'No console.log in production files'
      : `console.log found: ${[...new Set(consoleHits.map((h) => h.path))].join(', ')}`,
  });

  // Gate: scope-creep-vs-taskplan — non-blocking
  if (contractBundle?.taskPlan) {
    const plannedFiles = new Set(
      contractBundle.taskPlan.tasks.flatMap((t) => t.filePaths),
    );
    const unplannedFiles = diff.files
      .map((f) => f.path)
      .filter((p) => !plannedFiles.has(p));
    results.push({
      name: 'scope-creep-vs-taskplan',
      passed: unplannedFiles.length === 0,
      detail: unplannedFiles.length === 0
        ? 'All diff files are in the task plan'
        : `Files not in task plan: ${unplannedFiles.join(', ')}`,
    });
  } else {
    results.push({
      name: 'scope-creep-vs-taskplan',
      passed: true,
      detail: 'No task plan available — skipping scope check',
    });
  }

  // Gate: superseded-pattern — non-blocking
  const supersededPatterns = [
    { pattern: /EventEmitter.*coordination|coordination.*EventEmitter/i, name: 'EventEmitter for coordination' },
    { pattern: /createMockFs\(\)/i, name: 'createMockFs in production' },
    { pattern: /require\s*\(/i, name: 'CJS require in ESM' },
  ];
  const supersededHits: string[] = [];
  for (const { pattern, name } of supersededPatterns) {
    const hits = prodAdded.filter((l) => pattern.test(l.line));
    if (hits.length > 0) {
      supersededHits.push(`${name} in ${hits[0].path}`);
    }
  }
  results.push({
    name: 'superseded-pattern',
    passed: supersededHits.length === 0,
    detail: supersededHits.length === 0
      ? 'No superseded patterns detected'
      : `Superseded patterns: ${supersededHits.join('; ')}`,
  });

  return results;
}
