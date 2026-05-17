/**
 * Tests for deterministic screen-impact classifier (R9 §2).
 *
 * Uses a temporary directory with stub design spec files to test the
 * classification algorithm without requiring the full CashPulse fixture.
 * The algorithm matches PRD screen names to existing design files by
 * normalized substring comparison.
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ScreenRef } from '@agentforge/core';
import { classifyScreenImpact } from './screen-impact.js';

function makeTmpProject(designs: Record<string, Record<string, unknown>>): string {
  const dir = join(tmpdir(), `screen-impact-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const designsDir = join(dir, 'agentforge', 'designs');
  mkdirSync(designsDir, { recursive: true });
  for (const [pageId, spec] of Object.entries(designs)) {
    writeFileSync(join(designsDir, `${pageId}.json`), JSON.stringify(spec));
  }
  return dir;
}

function makeScreenRef(overrides: Partial<ScreenRef> & { id: string; name: string }): ScreenRef {
  return {
    description: '',
    ...overrides,
  };
}

const STUB_SPEC = (nodeCount: number) => ({
  screen: 'test',
  width: 1440,
  nodes: Object.fromEntries(
    Array.from({ length: nodeCount }, (_, i) => [`node-${i}`, { parent: i === 0 ? null : 'node-0', order: i }]),
  ),
});

let projectRoot: string;

afterEach(() => {
  if (projectRoot) {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

describe('classifyScreenImpact', () => {
  it('classifies matching PRD screens as modified', () => {
    projectRoot = makeTmpProject({
      dashboard: STUB_SPEC(10),
      'add-expense': STUB_SPEC(5),
    });

    const result = classifyScreenImpact({
      projectRoot,
      prdScreens: [
        makeScreenRef({ id: 's-1', name: 'Dashboard — Upcoming Recurring Card' }),
      ],
    });

    const modified = result.affectedScreens.filter(s => s.impact === 'modified');
    const unchanged = result.affectedScreens.filter(s => s.impact === 'unchanged');

    expect(modified).toHaveLength(1);
    expect(modified[0].screenId).toBe('dashboard');
    expect(modified[0].existingNodeCount).toBe(10);
    expect(modified[0].existingSpecPath).toContain('dashboard.json');
    expect(unchanged).toHaveLength(1);
    expect(unchanged[0].screenId).toBe('add-expense');
  });

  it('classifies unmatched PRD screens as new', () => {
    projectRoot = makeTmpProject({
      dashboard: STUB_SPEC(3),
    });

    const result = classifyScreenImpact({
      projectRoot,
      prdScreens: [
        makeScreenRef({ id: 's-1', name: 'Manage Recurring Transactions Drawer' }),
      ],
    });

    const newScreens = result.affectedScreens.filter(s => s.impact === 'new');
    expect(newScreens).toHaveLength(1);
    expect(newScreens[0].screenId).toBe('manage-recurring-transactions-drawer');
  });

  it('marks unreferenced existing specs as unchanged', () => {
    projectRoot = makeTmpProject({
      dashboard: STUB_SPEC(10),
      settings: STUB_SPEC(8),
      'spending-insights': STUB_SPEC(6),
    });

    const result = classifyScreenImpact({
      projectRoot,
      prdScreens: [
        makeScreenRef({ id: 's-1', name: 'Dashboard — Badge on Rows' }),
      ],
    });

    const unchanged = result.affectedScreens.filter(s => s.impact === 'unchanged');
    expect(unchanged).toHaveLength(2);
    expect(unchanged.map(s => s.screenId).sort()).toEqual(['settings', 'spending-insights']);
  });

  it('collapses multiple PRD screens targeting the same spec', () => {
    projectRoot = makeTmpProject({
      dashboard: STUB_SPEC(10),
    });

    const result = classifyScreenImpact({
      projectRoot,
      prdScreens: [
        makeScreenRef({ id: 's-1', name: 'Dashboard — Upcoming Recurring Card' }),
        makeScreenRef({ id: 's-2', name: 'Dashboard — Recurring Badge on Expense Rows' }),
      ],
    });

    const modified = result.affectedScreens.filter(s => s.impact === 'modified');
    expect(modified).toHaveLength(1);
    expect(modified[0].screenId).toBe('dashboard');
  });

  it('excludes prototype.json, shared-chrome.json, and backup files', () => {
    projectRoot = makeTmpProject({
      dashboard: STUB_SPEC(5),
    });
    const designsDir = join(projectRoot, 'agentforge', 'designs');
    writeFileSync(join(designsDir, 'prototype.json'), '{}');
    writeFileSync(join(designsDir, 'shared-chrome.json'), '{}');
    writeFileSync(join(designsDir, 'dashboard.backup.json'), '{}');

    const result = classifyScreenImpact({
      projectRoot,
      prdScreens: [],
    });

    const allIds = result.affectedScreens.map(s => s.screenId);
    expect(allIds).toEqual(['dashboard']);
    expect(allIds).not.toContain('prototype');
    expect(allIds).not.toContain('shared-chrome');
  });

  it('handles empty designs directory', () => {
    projectRoot = makeTmpProject({});

    const result = classifyScreenImpact({
      projectRoot,
      prdScreens: [
        makeScreenRef({ id: 's-1', name: 'New Screen' }),
      ],
    });

    expect(result.affectedScreens).toHaveLength(1);
    expect(result.affectedScreens[0].impact).toBe('new');
  });

  it('handles missing designs directory', () => {
    projectRoot = join(tmpdir(), `screen-impact-empty-${Date.now()}`);
    mkdirSync(projectRoot, { recursive: true });

    const result = classifyScreenImpact({
      projectRoot,
      prdScreens: [
        makeScreenRef({ id: 's-1', name: 'Dashboard' }),
      ],
    });

    expect(result.affectedScreens).toHaveLength(1);
    expect(result.affectedScreens[0].impact).toBe('new');
  });

  it('produces brownfield fixture-compatible output', () => {
    projectRoot = makeTmpProject({
      dashboard: STUB_SPEC(159),
      'add-expense': STUB_SPEC(157),
      'confirm-delete': STUB_SPEC(22),
      settings: STUB_SPEC(10),
      'spending-insights': STUB_SPEC(15),
    });

    const prdScreens: ScreenRef[] = [
      makeScreenRef({ id: 'screen-001', name: 'Dashboard — Upcoming Recurring Card', screenType: 'page' }),
      makeScreenRef({ id: 'screen-002', name: 'Add Expense — Recurrence Configuration', screenType: 'page' }),
      makeScreenRef({ id: 'screen-003', name: 'Expense Detail Popover — Recurring Info', screenType: 'modal' }),
      makeScreenRef({ id: 'screen-004', name: 'Manage Recurring Transactions Drawer', screenType: 'drawer' }),
      makeScreenRef({ id: 'screen-005', name: 'Delete Recurring Expense Confirmation', screenType: 'modal' }),
      makeScreenRef({ id: 'screen-006', name: 'Dashboard — Recurring Badge on Expense Rows', screenType: 'page' }),
    ];

    const result = classifyScreenImpact({ projectRoot, prdScreens });
    const byImpact = (impact: string) => result.affectedScreens.filter(s => s.impact === impact);

    const modified = byImpact('modified');
    const newScreens = byImpact('new');
    const unchanged = byImpact('unchanged');

    expect(modified.map(s => s.screenId).sort()).toEqual(['add-expense', 'confirm-delete', 'dashboard']);
    expect(modified.find(s => s.screenId === 'dashboard')?.existingNodeCount).toBe(159);
    expect(modified.find(s => s.screenId === 'add-expense')?.existingNodeCount).toBe(157);

    expect(newScreens.map(s => s.screenId).sort()).toEqual([
      'expense-detail-popover-recurring-info',
      'manage-recurring-transactions-drawer',
    ]);

    // shared-chrome excluded by EXCLUDED_FILES — only settings and spending-insights remain unchanged
    expect(unchanged.map(s => s.screenId).sort()).toEqual(['settings', 'spending-insights']);
  });
});
