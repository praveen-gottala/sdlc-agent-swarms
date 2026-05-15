/**
 * @module @agentforge/agents-architect/graph/nodes/contract-designer
 *
 * Node 4 — Contract Designer entry point.
 * Runs 5 specialists sequentially: data-model → api → components → screens → design-system-diff.
 * Brownfield: ChangeClassification.scopeAxes controls which specialists run.
 * Greenfield: all 5 run.
 */

import { debugLog } from '@agentforge/core';
import type { ScopeAxis } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../../deps.js';
import type { ArchitectStateType } from '../../state.js';
import { createDataModelSpecialist } from './data-model.js';
import { createApiSpecialist } from './api.js';
import { createComponentsSpecialist } from './components.js';
import { createScreensSpecialist } from './screens.js';
import { createDesignSystemDiffSpecialist } from './design-system-diff.js';

interface SpecialistEntry {
  readonly name: string;
  readonly scopeAxis: ScopeAxis;
  readonly factory: (deps: ArchitectDeps) => ArchitectNodeFn;
}

const SPECIALISTS: readonly SpecialistEntry[] = [
  { name: 'data-model', scopeAxis: 'data-model', factory: createDataModelSpecialist },
  { name: 'api', scopeAxis: 'api', factory: createApiSpecialist },
  { name: 'components', scopeAxis: 'component', factory: createComponentsSpecialist },
  { name: 'screens', scopeAxis: 'ui', factory: createScreensSpecialist },
  { name: 'design-system-diff', scopeAxis: 'design-system', factory: createDesignSystemDiffSpecialist },
];

/** Determine which specialists should run based on brownfield scope. */
export function selectSpecialists(
  scopeAxes: readonly ScopeAxis[] | undefined,
): readonly SpecialistEntry[] {
  if (!scopeAxes) return SPECIALISTS;
  const axisSet = new Set(scopeAxes);
  return SPECIALISTS.filter((s) => axisSet.has(s.scopeAxis));
}

/** Create Node 4 — Contract Designer (sequential specialist dispatch). */
export function createContractDesigner(deps: ArchitectDeps): ArchitectNodeFn {
  const specialistFnMap = new Map(
    SPECIALISTS.map((s) => [s.name, { ...s, fn: s.factory(deps) }]),
  );

  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('contractDesigner: ENTER');

    if (!state.architectureSpec) {
      debugLog('contractDesigner: EXIT (no architectureSpec — Node 3 skipped or failed)');
      return {};
    }

    const active = selectSpecialists(state.changeClassification?.scopeAxes);
    const accumulated: Partial<ArchitectStateType> = {};

    for (const entry of active) {
      const specialist = specialistFnMap.get(entry.name)!;
      const mergedState: ArchitectStateType = { ...state, ...accumulated };
      debugLog(`contractDesigner/${specialist.name}: DISPATCH`);
      const result = await specialist.fn(mergedState);
      Object.assign(accumulated, result);
    }

    const skipped = SPECIALISTS.length - active.length;
    if (skipped > 0) {
      debugLog(`contractDesigner: ${skipped} specialist(s) skipped (brownfield scopeAxes)`);
    }

    debugLog(
      `contractDesigner: EXIT ` +
      `dataModel=${accumulated.dataModelSpec ? 'yes' : 'no'} ` +
      `api=${(accumulated.apiChangeSets as readonly unknown[] | undefined)?.length ?? 0} ` +
      `components=${(accumulated.componentCompositions as readonly unknown[] | undefined)?.length ?? 0} ` +
      `screens=${(accumulated.screenPlans as readonly unknown[] | undefined)?.length ?? 0} ` +
      `designSystemDiff=${accumulated.designSystemDiff ? 'yes' : 'no'}`,
    );

    return accumulated;
  };
}

export { createDataModelSpecialist } from './data-model.js';
export { createApiSpecialist } from './api.js';
export { createComponentsSpecialist } from './components.js';
export { createScreensSpecialist } from './screens.js';
export { createDesignSystemDiffSpecialist } from './design-system-diff.js';
