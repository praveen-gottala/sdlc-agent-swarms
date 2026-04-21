/**
 * Post-LLM repair: ensure every planning `navigateTo` binding is reflected in DesignSpecV2
 * (Stage 4 — Plan B Phase B0b).
 */
import type { DesignSpecV2, NodeSpec } from '@agentforge/designspec-renderer';
import type { ComponentTreeNode } from '../types.js';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';

const NAV_CATALOG_IDS = new Set(['tab', 'nav-item', 'link', 'button']);
const LAYOUT_BAR_CATALOG = 'navigation-bar';

export interface NavigateToInjectionResult {
  readonly stillMissing: readonly { readonly componentName: string; readonly target: string }[];
  readonly applied: readonly { readonly componentName: string; readonly target: string; readonly nodeId: string }[];
}

type MutableNode = NodeSpec & { navigateTo?: string };
type MutableNodes = Record<string, MutableNode>;

/** PascalCase → kebab (NavItemHome → nav-item-home). */
export function planningNameToKebab(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

export function walkComponentTreeForNavigateTo(
  nodes: readonly ComponentTreeNode[],
  out: Array<{ name: string; target: string }>,
): void {
  for (const node of nodes) {
    if (node.navigateTo) {
      out.push({ name: node.name, target: node.navigateTo });
    }
    if (node.children && node.children.length > 0) {
      walkComponentTreeForNavigateTo(node.children, out);
    }
  }
}

function countNavigateToByTarget(spec: DesignSpecV2, target: string): number {
  let n = 0;
  for (const node of Object.values(spec.nodes)) {
    if (node.navigateTo === target) n++;
  }
  return n;
}

function hasNavigationBarAncestor(spec: DesignSpecV2, startId: string): boolean {
  const seen = new Set<string>();
  let id: string | null = startId;
  for (let d = 0; d < 256 && id; d++) {
    const cur: string = id;
    if (seen.has(cur)) return false;
    seen.add(cur);
    const node: NodeSpec | undefined = spec.nodes[cur];
    if (node?.catalog === LAYOUT_BAR_CATALOG) return true;
    const parent: string | null = node?.parent == null || node?.parent === undefined
      ? null
      : node.parent;
    id = parent;
  }
  return false;
}

/**
 * Deterministic best match for a planning (name, target) pair.
 * Rules: exact kebab id → id contains kebab → id contains target → nav catalog under navigation-bar.
 * Excludes `used` node ids.
 */
export function findNavigateToNodeId(
  spec: DesignSpecV2,
  componentName: string,
  target: string,
  used: ReadonlySet<string>,
): string | null {
  const keyKebab = planningNameToKebab(componentName);
  const nodeKeys = Object.keys(spec.nodes).filter(k => k !== 'root');
  const sorted = [...nodeKeys].sort((a, b) => a.localeCompare(b));

  for (const id of sorted) {
    if (used.has(id) || !spec.nodes[id]) continue;
    if (id === keyKebab) return id;
  }
  for (const id of sorted) {
    if (used.has(id) || !spec.nodes[id]) continue;
    if (id.includes(keyKebab)) return id;
  }
  for (const id of sorted) {
    if (used.has(id) || !spec.nodes[id]) continue;
    if (id.includes(target)) return id;
  }
  for (const id of sorted) {
    if (used.has(id) || !spec.nodes[id]) continue;
    const n = spec.nodes[id];
    if (!n.catalog || !NAV_CATALOG_IDS.has(n.catalog)) continue;
    if (hasNavigationBarAncestor(spec, id)) return id;
  }
  return null;
}

/**
 * For every planning (name, target) pair, ensure `need` spec nodes with that `navigateTo`
 * exist, injecting in pair order. Mutates `spec.nodes`.
 */
export function injectMissingNavigateToInPlace(
  spec: DesignSpecV2,
  planningOutput: UXPlanningOutput,
): NavigateToInjectionResult {
  const pairs: Array<{ name: string; target: string }> = [];
  walkComponentTreeForNavigateTo(planningOutput.componentTree, pairs);
  if (pairs.length === 0) {
    return { stillMissing: [], applied: [] };
  }

  const needByTarget = new Map<string, number>();
  for (const p of pairs) {
    needByTarget.set(p.target, (needByTarget.get(p.target) ?? 0) + 1);
  }

  const applied: Array<{ componentName: string; target: string; nodeId: string }> = [];
  const stillMissing: Array<{ componentName: string; target: string }> = [];
  const used = new Set<string>();
  const mut = spec.nodes as unknown as MutableNodes;

  for (const { name: componentName, target } of pairs) {
    const need = needByTarget.get(target) ?? 0;
    if (countNavigateToByTarget(spec, target) >= need) {
      continue;
    }

    const id = findNavigateToNodeId(spec, componentName, target, used);
    if (id) {
      mut[id] = { ...mut[id], navigateTo: target } as MutableNode;
      used.add(id);
      applied.push({ componentName, target, nodeId: id });
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[validate-navigate-to] No DesignSpec node for navigateTo "${target}" (planning component "${componentName}")`,
      );
      stillMissing.push({ componentName, target });
    }
  }

  for (const [target, need] of needByTarget) {
    if (countNavigateToByTarget(spec, target) < need) {
      const p = pairs.find(x => x.target === target);
      if (p && !stillMissing.some(m => m.target === target)) {
        stillMissing.push({ componentName: p.name, target });
      }
    }
  }

  return { stillMissing, applied };
}

export function countPlanningNavigateTo(planning: UXPlanningOutput): number {
  const out: Array<{ name: string; target: string }> = [];
  walkComponentTreeForNavigateTo(planning.componentTree, out);
  return out.length;
}

export function countSpecNavigateTo(spec: DesignSpecV2): number {
  let c = 0;
  for (const n of Object.values(spec.nodes)) {
    if (n.navigateTo) c++;
  }
  return c;
}
