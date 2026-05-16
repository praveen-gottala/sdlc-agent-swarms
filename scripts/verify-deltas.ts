/**
 * Verify hand-crafted DesignSpecDelta files against their existing specs.
 *
 * For each delta:
 * 1. Load existing DesignSpecV2
 * 2. Load DesignSpecDelta
 * 3. Run deltaApply(existing, delta)
 * 4. Validate: result is Ok, node count math, existing node preservation
 *
 * Usage: npx tsx scripts/verify-deltas.ts
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaApply } from '@agentforge/designspec-renderer';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { DesignSpecDelta } from '@agentforge/designspec-renderer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'fixtures', 'personal-expense-tracker', 'agentforge');

interface DeltaTask {
  readonly label: string;
  readonly existingSpecPath: string;
  readonly deltaPath: string;
}

const TASKS: readonly DeltaTask[] = [
  {
    label: 'Dashboard — Add Recurring Card',
    existingSpecPath: join(FIXTURE, 'designs', 'dashboard.json'),
    deltaPath: join(FIXTURE, 'deltas', 'dashboard-add-recurring-card.delta.json'),
  },
  {
    label: 'Add Expense — Recurrence Toggle',
    existingSpecPath: join(FIXTURE, 'designs', 'add-expense.json'),
    deltaPath: join(FIXTURE, 'deltas', 'add-expense-recurrence-toggle.delta.json'),
  },
  {
    label: 'Dashboard — Recurring Badge',
    existingSpecPath: join(FIXTURE, 'designs', 'dashboard.json'),
    deltaPath: join(FIXTURE, 'deltas', 'transactions-list-recurring-badge.delta.json'),
  },
];

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

let allPassed = true;

for (const task of TASKS) {
  log(`\n=== ${task.label} ===`);

  const existing: DesignSpecV2 = JSON.parse(readFileSync(task.existingSpecPath, 'utf-8'));
  const delta: DesignSpecDelta = JSON.parse(readFileSync(task.deltaPath, 'utf-8'));

  const existingNodeCount = Object.keys(existing.nodes).length;
  const addedCount = Object.keys(delta.added).length;
  const removedCount = delta.removed.length;
  const modifiedCount = Object.keys(delta.modified).length;
  const reorderedCount = delta.reordered.length;

  log(`  Existing nodes: ${existingNodeCount}`);
  log(`  Delta: +${addedCount} added, ~${modifiedCount} modified, -${removedCount} removed, ↕${reorderedCount} reordered`);

  // Apply
  const result = deltaApply(existing, delta);

  if (!result.ok) {
    log(`  FAIL: deltaApply returned error: ${result.error.message}`);
    allPassed = false;
    continue;
  }

  const applied = result.value;
  const appliedNodeCount = Object.keys(applied.nodes).length;
  const expectedNodeCount = existingNodeCount + addedCount - removedCount;

  // Check node count math
  if (appliedNodeCount !== expectedNodeCount) {
    log(`  FAIL: Node count mismatch. Expected ${expectedNodeCount}, got ${appliedNodeCount}`);
    allPassed = false;
    continue;
  }
  log(`  Node count: ${appliedNodeCount} (expected ${expectedNodeCount}) ✓`);

  // Check all existing nodes preserved (minus removed)
  const removedSet = new Set(delta.removed);
  let preservedCount = 0;
  let missingCount = 0;
  for (const id of Object.keys(existing.nodes)) {
    if (removedSet.has(id)) continue;
    if (!applied.nodes[id]) {
      log(`  FAIL: Existing node "${id}" missing from applied result`);
      missingCount++;
    } else {
      preservedCount++;
    }
  }

  if (missingCount > 0) {
    allPassed = false;
    continue;
  }
  log(`  Existing nodes preserved: ${preservedCount}/${existingNodeCount - removedCount} ✓`);

  // Check all added nodes present
  let addedPresent = 0;
  for (const id of Object.keys(delta.added)) {
    if (!applied.nodes[id]) {
      log(`  FAIL: Added node "${id}" missing from applied result`);
      allPassed = false;
    } else {
      addedPresent++;
    }
  }
  log(`  Added nodes present: ${addedPresent}/${addedCount} ✓`);

  // Check reordered nodes have updated order
  for (const entry of delta.reordered) {
    const node = applied.nodes[entry.nodeId];
    if (!node) {
      log(`  FAIL: Reordered node "${entry.nodeId}" missing from applied result`);
      allPassed = false;
      continue;
    }
    if (entry.newOrder !== undefined && node.order !== entry.newOrder) {
      log(`  FAIL: Reordered node "${entry.nodeId}" has order ${node.order}, expected ${entry.newOrder}`);
      allPassed = false;
    }
    if (entry.newParent !== undefined && node.parent !== entry.newParent) {
      log(`  FAIL: Reordered node "${entry.nodeId}" has parent "${node.parent}", expected "${entry.newParent}"`);
      allPassed = false;
    }
  }
  if (reorderedCount > 0) {
    log(`  Reorder entries applied: ${reorderedCount} ✓`);
  }

  // Check parent references are valid
  let orphanCount = 0;
  for (const [id, node] of Object.entries(applied.nodes)) {
    if (node.parent !== null && !applied.nodes[node.parent]) {
      log(`  FAIL: Node "${id}" references non-existent parent "${node.parent}"`);
      orphanCount++;
    }
  }
  if (orphanCount > 0) {
    allPassed = false;
  } else {
    log(`  Parent references valid: all ${appliedNodeCount} nodes ✓`);
  }

  log(`  PASS ✓`);
}

log(`\n${'='.repeat(40)}`);
if (allPassed) {
  log('All 3 deltas verified successfully.');
} else {
  log('SOME DELTAS FAILED — see errors above.');
  process.exitCode = 1;
}
