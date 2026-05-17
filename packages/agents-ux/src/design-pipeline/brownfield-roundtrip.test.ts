/**
 * Round-trip test: delta fixture + base spec → deltaApply → structural quality gate.
 *
 * Verifies that real M3.6 delta fixtures applied to the production dashboard
 * spec produce valid specs that pass the structural quality gate. This is the
 * Phase 3 confidence check that brownfield deltas compose correctly with real
 * production-scale specs (159 nodes).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import { deltaApply } from '@agentforge/designspec-renderer';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { DesignSpecDelta } from '@agentforge/designspec-renderer';
import { runStructuralQualityGate } from '../ux-design/structural-quality-gate.js';

const MONOREPO_ROOT = path.resolve(__dirname, '../../../..');

function loadDashboardSpec(): DesignSpecV2 {
  const fixturePath = path.join(
    MONOREPO_ROOT,
    'fixtures/personal-expense-tracker/agentforge/designs/dashboard.json',
  );
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as DesignSpecV2;
}

interface DeltaFixtureData {
  metadata: { description: string; targetPage: string; taskId: string };
  delta: {
    screenId: string;
    baseWidth: number;
    added: Record<string, Record<string, unknown>>;
    modified: Record<string, Record<string, unknown>>;
    removed: string[];
    reordered: Array<{ nodeId: string; newParent?: string; newOrder?: number }>;
  };
}

function loadFixtureDelta(name: string): DeltaFixtureData {
  const fixturePath = path.join(
    MONOREPO_ROOT,
    'packages/eval/src/fixtures/deltas',
    `${name}.yaml`,
  );
  return parse(fs.readFileSync(fixturePath, 'utf-8')) as DeltaFixtureData;
}

describe('brownfield round-trip: fixture delta → deltaApply → structural quality gate', () => {
  it('cashpulse-recurring-badge delta applies cleanly and passes quality gate', () => {
    const baseSpec = loadDashboardSpec();
    const fixture = loadFixtureDelta('cashpulse-recurring-badge');

    const delta: DesignSpecDelta = {
      screenId: fixture.delta.screenId,
      baseWidth: fixture.delta.baseWidth,
      added: fixture.delta.added as unknown as Record<string, import('@agentforge/designspec-renderer').NodeSpec>,
      modified: fixture.delta.modified as unknown as Record<string, Partial<import('@agentforge/designspec-renderer').NodeSpec>>,
      removed: fixture.delta.removed,
      reordered: fixture.delta.reordered,
    };

    const result = deltaApply(baseSpec, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const baseNodeCount = Object.keys(baseSpec.nodes).length;
    const appliedNodeCount = Object.keys(result.value.nodes).length;
    expect(appliedNodeCount).toBe(baseNodeCount + Object.keys(delta.added).length);

    const quality = runStructuralQualityGate(result.value);
    expect(quality.score).toBeGreaterThanOrEqual(80);
  });

  it('synthetic modify delta on add-expense applies cleanly and passes quality gate', () => {
    const baseSpecPath = path.join(
      MONOREPO_ROOT,
      'fixtures/personal-expense-tracker/agentforge/designs/add-expense.json',
    );
    const baseSpec = JSON.parse(fs.readFileSync(baseSpecPath, 'utf-8')) as DesignSpecV2;
    const rootId = Object.keys(baseSpec.nodes).find(
      id => baseSpec.nodes[id].parent === null,
    )!;

    const delta: DesignSpecDelta = {
      screenId: baseSpec.screen,
      baseWidth: baseSpec.width,
      added: {
        'new-info-banner': {
          parent: rootId, order: 99, type: 'container',
          label: 'Info Banner', background: 'surface-secondary',
          layout: { dir: 'column' },
        } as unknown as import('@agentforge/designspec-renderer').NodeSpec,
      },
      modified: {},
      removed: [],
      reordered: [],
    };

    const result = deltaApply(baseSpec, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.value.nodes).length).toBe(
      Object.keys(baseSpec.nodes).length + 1,
    );

    const quality = runStructuralQualityGate(result.value);
    expect(quality.score).toBeGreaterThanOrEqual(80);
  });

  it('empty delta preserves base spec exactly', () => {
    const baseSpec = loadDashboardSpec();
    const emptyDelta: DesignSpecDelta = {
      screenId: 'dashboard',
      baseWidth: baseSpec.width,
      added: {},
      modified: {},
      removed: [],
      reordered: [],
    };

    const result = deltaApply(baseSpec, emptyDelta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.value.nodes).length).toBe(Object.keys(baseSpec.nodes).length);
    expect(result.value.nodes).toEqual(baseSpec.nodes);
  });
});
