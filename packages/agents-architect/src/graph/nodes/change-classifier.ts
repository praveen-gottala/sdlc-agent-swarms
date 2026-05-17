/**
 * @module @agentforge/agents-architect/graph/nodes/change-classifier
 *
 * Node 0.5 — Change Classifier (brownfield only).
 * Classifies the change request against the existing codebase to produce
 * a ChangeClassification (scope axes, blast radius, affected modules).
 * Also populates the existingFiles channel from the repo snapshot.
 *
 * Phase 2 (M4): deterministic screen-impact baseline from R9 §2.
 * LLM enrichment (changeDescription, confidence adjustment) is wired but
 * requires the LLM call to be added in a later phase.
 */

import { debugLog } from '@agentforge/core';
import type { ChangeClassification, AffectedScreen, ScopeAxis } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../deps.js';
import type { ArchitectStateType } from '../state.js';
import { classifyScreenImpact } from '../../impact/screen-impact.js';

/** Create the Change Classifier node (Node 0.5). */
export function createChangeClassifier(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('changeClassifier: ENTER');

    const snapshot = state.existingRepoSnapshot;
    const existingFiles = snapshot
      ? new Set(snapshot.filePaths) as ReadonlySet<string>
      : null;

    const req = state.enrichedRequirement;
    let changeClassification: ChangeClassification | null = null;

    if (req && state.mode === 'brownfield') {
      const prdScreens = req.prd.screens ?? [];
      let affectedScreens: AffectedScreen[] = [];

      if (prdScreens.length > 0) {
        const impact = classifyScreenImpact({
          projectRoot: deps.projectRoot,
          prdScreens,
        });
        affectedScreens = impact.affectedScreens;
      }

      const scopeAxes = deriveScopeAxes(req, affectedScreens);

      changeClassification = {
        id: `cc-${Date.now()}`,
        changeRequestId: req.id,
        scopeAxes: scopeAxes.length > 0 ? scopeAxes : ['ui'],
        blastRadius: deriveBlastRadius(affectedScreens),
        affectedModules: deriveAffectedModules(affectedScreens),
        confidence: 0.8,
        affectedScreens: affectedScreens.length > 0 ? affectedScreens : undefined,
      };

      debugLog(
        `changeClassifier: classified ${affectedScreens.length} screens ` +
        `(${affectedScreens.filter(s => s.impact === 'modified').length} modified, ` +
        `${affectedScreens.filter(s => s.impact === 'new').length} new)`,
      );
    }

    debugLog(`changeClassifier: EXIT existingFiles=${existingFiles?.size ?? 0}`);
    return { existingFiles, changeClassification };
  };
}

function deriveScopeAxes(
  req: NonNullable<ArchitectStateType['enrichedRequirement']>,
  affectedScreens: AffectedScreen[],
): ScopeAxis[] {
  const axes = new Set<ScopeAxis>();
  if (affectedScreens.some(s => s.impact === 'modified' || s.impact === 'new')) {
    axes.add('ui');
    axes.add('component');
  }
  if (req.prd.dataEntities.length > 0) {
    axes.add('data-model');
  }
  return [...axes];
}

function deriveBlastRadius(
  affectedScreens: AffectedScreen[],
): 'low' | 'medium' | 'high' | 'critical' {
  const modifiedCount = affectedScreens.filter(s => s.impact === 'modified').length;
  if (modifiedCount >= 5) return 'high';
  if (modifiedCount >= 2) return 'medium';
  return 'low';
}

function deriveAffectedModules(affectedScreens: AffectedScreen[]): string[] {
  return affectedScreens
    .filter(s => s.impact !== 'unchanged')
    .map(s => `screen:${s.screenId}`);
}
