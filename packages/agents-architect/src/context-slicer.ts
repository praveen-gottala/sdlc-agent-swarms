/**
 * @module @agentforge/agents-architect/context-slicer
 *
 * Slices a ContractBundle to include only the elements referenced by ContextRefs.
 * Reduces token load for downstream consumers (R3 §3 — ~70% reduction).
 *
 * Also bridges the singular/plural mismatch: ContractBundle.componentComposition
 * is singular while ArchitectStateType.componentCompositions is plural.
 * `stateCompositionsToBundle()` converts the array form to the first matching
 * element for bundle consumption.
 */

import type {
  ComponentComposition,
  ContractBundle,
  ContextRef,
  DataModelSpec,
} from '@agentforge/core';

/**
 * Bridge ArchitectStateType.componentCompositions (plural array) to
 * ContractBundle.componentComposition (singular). Returns the first
 * composition matching any of the given screenIds, or the first element
 * if no filter is provided.
 */
export function stateCompositionsToBundle(
  compositions: readonly ComponentComposition[],
  filterScreenIds?: ReadonlySet<string>,
): ComponentComposition | undefined {
  if (compositions.length === 0) return undefined;
  if (!filterScreenIds) return compositions[0];
  return compositions.find((c) => filterScreenIds.has(c.screenId));
}

/**
 * Filter a partial ContractBundle to include only elements matching the given ContextRefs.
 * Each ref kind maps to a specific bundle field:
 *   - `dataModel.entity` → filters `dataModel.entities` by entity id
 *   - `apiChangeSet` → filters `apiChangeSets` by changeset id
 *   - `componentComposition` → includes `componentComposition` if screenId matches
 *   - `screenPlan` → filters `screenPlans` by plan id
 *   - `pattern` → filters `architectureSpec.implementationPatterns` by pattern id
 *
 * Fields not referenced by any ContextRef are omitted from the result.
 * Structural wrappers (projectId, etc.) are preserved when any child matches.
 */
export function sliceContractBundle(
  contextRefs: readonly ContextRef[],
  bundle: Partial<ContractBundle>,
): Partial<ContractBundle> {
  if (contextRefs.length === 0) return {};

  const result: Partial<ContractBundle> = {};

  const entityIds = new Set<string>();
  const apiChangeSetIds = new Set<string>();
  const compositionScreenIds = new Set<string>();
  const screenPlanIds = new Set<string>();
  const patternIds = new Set<string>();

  for (const ref of contextRefs) {
    switch (ref.kind) {
      case 'dataModel.entity':
        entityIds.add(ref.id);
        break;
      case 'apiChangeSet':
        apiChangeSetIds.add(ref.id);
        break;
      case 'componentComposition':
        compositionScreenIds.add(ref.id);
        break;
      case 'screenPlan':
        screenPlanIds.add(ref.id);
        break;
      case 'pattern':
        patternIds.add(ref.id);
        break;
    }
  }

  if (entityIds.size > 0 && bundle.dataModel) {
    const filtered = bundle.dataModel.entities.filter((e) => entityIds.has(e.id));
    if (filtered.length > 0) {
      const sliced: DataModelSpec = {
        projectId: bundle.dataModel.projectId,
        entities: filtered,
      };
      result.dataModel = sliced;
    }
  }

  if (apiChangeSetIds.size > 0 && bundle.apiChangeSets) {
    const filtered = bundle.apiChangeSets.filter((cs) => apiChangeSetIds.has(cs.id));
    if (filtered.length > 0) {
      result.apiChangeSets = filtered;
    }
  }

  if (compositionScreenIds.size > 0 && bundle.componentComposition) {
    if (compositionScreenIds.has(bundle.componentComposition.screenId)) {
      result.componentComposition = bundle.componentComposition;
    }
  }

  if (screenPlanIds.size > 0 && bundle.screenPlans) {
    const filtered = bundle.screenPlans.filter((sp) => screenPlanIds.has(sp.id));
    if (filtered.length > 0) {
      result.screenPlans = filtered;
    }
  }

  if (patternIds.size > 0 && bundle.architectureSpec) {
    const patterns = bundle.architectureSpec.implementationPatterns ?? [];
    const filtered = patterns.filter((p) => patternIds.has(p.id));
    if (filtered.length > 0) {
      result.architectureSpec = {
        ...bundle.architectureSpec,
        implementationPatterns: filtered,
      };
    }
  }

  return result;
}
