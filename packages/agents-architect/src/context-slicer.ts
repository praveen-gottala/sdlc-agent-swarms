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
  DesignSliceStrategy,
} from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import { extractStructure, extractLabelsAndBindings } from './design-slice/index.js';

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

/** Resolved design specs keyed by pageId, supplied by the caller via readDesignSpec. */
export interface DesignSpecLookup {
  readonly [pageId: string]: DesignSpecV2;
}

/** Result of slicing with design context attached. */
export interface SlicedBundleWithDesign {
  bundle: Partial<ContractBundle>;
  existingDesignSpecs: Record<string, DesignSpecV2>;
}

/**
 * Apply a DesignSliceStrategy to a raw DesignSpecV2.
 * Returns the sliced spec or undefined when strategy is 'none'.
 */
export function applyDesignSlice(
  spec: DesignSpecV2,
  strategy: DesignSliceStrategy,
): DesignSpecV2 | undefined {
  switch (strategy) {
    case 'none':
      return undefined;
    case 'full':
      return spec;
    case 'labels-only':
      return extractLabelsAndBindings(spec);
    case 'structure-only':
      return extractStructure(spec);
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

/**
 * Filter a partial ContractBundle to include only elements matching the given ContextRefs.
 * Each ref kind maps to a specific bundle field:
 *   - `dataModel.entity` → filters `dataModel.entities` by entity id
 *   - `apiChangeSet` → filters `apiChangeSets` by changeset id
 *   - `componentComposition` → includes `componentComposition` if screenId matches
 *   - `screenPlan` → filters `screenPlans` by plan id
 *   - `pattern` → filters `architectureSpec.implementationPatterns` by pattern id
 *   - `existingDesign` → attaches sliced design spec (strategy from task mode)
 *   - `designDelta` → reserved for Phase 3 brownfield delta emission
 *
 * Fields not referenced by any ContextRef are omitted from the result.
 * Structural wrappers (projectId, etc.) are preserved when any child matches.
 *
 * @param designSpecs - Pre-resolved design specs keyed by pageId. Caller reads from disk.
 * @param sliceStrategy - How to slice design specs (ADR-057). Defaults to 'none'.
 */
export function sliceContractBundle(
  contextRefs: readonly ContextRef[],
  bundle: Partial<ContractBundle>,
  designSpecs?: DesignSpecLookup,
  sliceStrategy?: DesignSliceStrategy,
): SlicedBundleWithDesign {
  if (contextRefs.length === 0) return { bundle: {}, existingDesignSpecs: {} };

  const result: Partial<ContractBundle> = {};
  const existingDesignSpecs: Record<string, DesignSpecV2> = {};

  const entityIds = new Set<string>();
  const apiChangeSetIds = new Set<string>();
  const compositionScreenIds = new Set<string>();
  const screenPlanIds = new Set<string>();
  const patternIds = new Set<string>();
  const designPageIds = new Set<string>();

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
      case 'existingDesign':
        designPageIds.add(ref.id);
        break;
      case 'designDelta':
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

  if (designPageIds.size > 0 && designSpecs) {
    const strategy = sliceStrategy ?? 'none';
    for (const pageId of designPageIds) {
      const raw = designSpecs[pageId];
      if (!raw) continue;
      const sliced = applyDesignSlice(raw, strategy);
      if (sliced) {
        existingDesignSpecs[pageId] = sliced;
      }
    }
  }

  return { bundle: result, existingDesignSpecs };
}
