/**
 * Merge shared chrome from the Chrome Pass into per-page DesignSpecs and build shared-chrome.json payload.
 */

import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { NodeSpec } from '@agentforge/designspec-renderer';
import type { PageEntry } from '@agentforge/core';
import type { SharedChrome } from './resolve-shared-components.js';
import { componentNameToKebab } from './resolve-shared-components.js';

type MutableNode = NodeSpec & { active?: boolean };

function cloneSpec(spec: DesignSpecV2): DesignSpecV2 {
  return {
    ...spec,
    nodes: { ...spec.nodes } as DesignSpecV2['nodes'],
  };
}

/**
 * Find the primary node id for a component (direct child of root preferred).
 */
export function findNodeIdByCatalog(
  spec: DesignSpecV2,
  catalog: string,
): string | undefined {
  for (const [id, n] of Object.entries(spec.nodes)) {
    if (n.catalog === catalog && n.parent === 'root') {
      return id;
    }
  }
  for (const [id, n] of Object.entries(spec.nodes)) {
    if (n.catalog === catalog) {
      return id;
    }
  }
  return undefined;
}

/** Direct children of `root`, ordered by `order`. */
function rootChildEntries(spec: DesignSpecV2): Array<[string, NodeSpec]> {
  return Object.entries(spec.nodes)
    .filter(([, n]) => n.parent === 'root')
    .sort((a, b) => a[1].order - b[1].order);
}

const compact = (s: string): string => s.replace(/-/g, '');

/**
 * Map a page-spec component name (e.g. TopBar) to a root node id. The V2 LLM
 * often omits `catalog` and uses id `top-bar` or `nav-tabs` instead of catalog ids.
 */
export function findSharedChromeRootNodeId(
  spec: DesignSpecV2,
  componentName: string,
): string | undefined {
  const kebab = componentNameToKebab(componentName);
  const fromCatalog = findNodeIdByCatalog(spec, kebab);
  if (fromCatalog) return fromCatalog;
  if (spec.nodes[kebab]?.parent === 'root') return kebab;
  const children = rootChildEntries(spec);
  for (const [id] of children) {
    if (id === kebab) return id;
  }
  for (const [id] of children) {
    if (compact(id) === compact(kebab)) return id;
  }
  // Substring match: split component name into keyword segments and check if
  // all segments appear in a root child ID (e.g. NavigationHeader → ["nav","header"]
  // matches "nav-header"). Catches LLM abbreviation mismatches.
  const segments = kebab.split('-');
  if (segments.length >= 2) {
    for (const [id] of children) {
      if (segments.every(seg => id.includes(seg.slice(0, 3)))) return id;
    }
  }
  if (componentName === 'NavigationTabs') {
    const hit = children.find(([id]) => /nav-tabs|bottom-nav|tab-bar/i.test(id));
    if (hit) return hit[0];
  }
  if (componentName === 'TopBar') {
    const hit = children.find(([id]) => /top-bar|app-bar|header/i.test(id));
    if (hit) return hit[0];
  }
  if (componentName === 'NavigationHeader') {
    const hit = children.find(([id]) => /nav-header|navigation|top-nav/i.test(id));
    if (hit) return hit[0];
  }
  return undefined;
}

/**
 * List every node id in the subtree under `rootId` (inclusive).
 */
function collectSubtreeIds(
  spec: DesignSpecV2,
  rootId: string,
): Set<string> {
  const out = new Set<string>();
  const visit = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    for (const [nid, n] of Object.entries(spec.nodes)) {
      if (n.parent === id) visit(nid);
    }
  };
  visit(rootId);
  return out;
}

/**
 * Overwrite page chrome nodes with the frozen shared spec; set tab `active` from `pageId` vs `navigateTo`.
 */
export function applyFrozenChromeToPageSpec(
  pageSpec: DesignSpecV2,
  frozen: DesignSpecV2,
  pageId: string,
): DesignSpecV2 {
  const result = cloneSpec(pageSpec);
  const mutable = result.nodes as Record<string, MutableNode>;

  for (const [id, src] of Object.entries(frozen.nodes)) {
    const next: MutableNode = { ...src } as MutableNode;
    const isTab = next.catalog === 'tab' || !!next.navigateTo;
    if (isTab && next.navigateTo) {
      next.active = next.navigateTo === pageId;
    } else {
      delete next.active;
    }
    mutable[id] = next;
  }

  return { ...result, nodes: mutable as DesignSpecV2['nodes'] };
}

/**
 * Build `regions` map (header/footer/sidebar → root node ids) for shared-chrome.json.
 */
export function buildSharedChromeRegions(
  spec: DesignSpecV2,
  shared: SharedChrome,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const region of shared.regions) {
    const ids: string[] = [];
    for (const comp of region.components) {
      const id = findSharedChromeRootNodeId(spec, comp);
      if (id) ids.push(id);
    }
    if (ids.length > 0) {
      out[region.position] = ids;
    }
  }
  return out;
}

/**
 * Payload written to `.agentforge/previews/shared-chrome.json` (DesignSpec + `regions` + `screen: __chrome__`).
 */
export function buildSharedChromeFilePayload(
  spec: DesignSpecV2,
  shared: SharedChrome,
): Record<string, unknown> {
  const llmRegions = spec.regions && Object.keys(spec.regions).length > 0
    ? spec.regions
    : null;
  const regions = llmRegions ?? buildSharedChromeRegions(spec, shared);
  return {
    ...spec,
    screen: '__chrome__',
    regions,
  };
}

/**
 * Derive chrome region placement from a fully-designed page spec.
 *
 * After Stage 3 merges frozen chrome into a page spec, root-level children
 * have both chrome nodes (with frozen order values) and content nodes.
 * Chrome nodes before the first content root child → header.
 * Chrome nodes after the last content root child → footer.
 */
export function deriveRegionsFromPageSpec(
  refPageSpec: DesignSpecV2,
  chromeSpec: DesignSpecV2,
  sharedComponentNames: readonly string[],
): Record<string, string[]> | null {
  const chromeNodeIds = new Set<string>();
  for (const name of sharedComponentNames) {
    const id = findSharedChromeRootNodeId(chromeSpec, name);
    if (id) chromeNodeIds.add(id);
  }
  if (chromeNodeIds.size === 0) return null;

  const rootChildren = rootChildEntries(refPageSpec);

  const firstContentIdx = rootChildren.findIndex(([id]) => !chromeNodeIds.has(id));
  let lastContentIdx = -1;
  for (let i = rootChildren.length - 1; i >= 0; i--) {
    if (!chromeNodeIds.has(rootChildren[i][0])) {
      lastContentIdx = i;
      break;
    }
  }

  const header: string[] = [];
  const footer: string[] = [];

  for (let i = 0; i < rootChildren.length; i++) {
    const [id] = rootChildren[i];
    if (!chromeNodeIds.has(id)) continue;

    if (firstContentIdx === -1) {
      header.push(id);
    } else if (i < firstContentIdx) {
      header.push(id);
    } else if (lastContentIdx !== -1 && i > lastContentIdx) {
      footer.push(id);
    } else {
      header.push(id);
    }
  }

  const regions: Record<string, string[]> = {};
  if (header.length > 0) regions.header = header;
  if (footer.length > 0) regions.footer = footer;
  return regions;
}

/**
 * Collect text content from a node and its descendants in a DesignSpec.
 */
function collectNodeText(spec: DesignSpecV2, nodeId: string): string {
  const node = spec.nodes[nodeId];
  if (!node) return '';
  const parts: string[] = [];
  if ((node as { content?: string }).content) parts.push((node as { content?: string }).content!);
  if ((node as { label?: string }).label) parts.push((node as { label?: string }).label!);
  for (const [id, n] of Object.entries(spec.nodes)) {
    if (n.parent === nodeId) parts.push(collectNodeText(spec, id));
  }
  return parts.join(' ').trim();
}

/**
 * Propagate `navigateTo` to chrome tab nodes by matching their text
 * content against page names and IDs.
 *
 * The Chrome Pass LLM may omit `navigateTo` on tab nodes because it
 * designs chrome in isolation. This function adds it deterministically
 * so DesignSpecRenderer can create click handlers for navigation.
 */
export function propagateNavigateToChromeTabs(
  chromeSpec: DesignSpecV2,
  pages: readonly PageEntry[],
): DesignSpecV2 {
  const pageScreens = pages.filter(
    (p) => p.status === 'approved' && (p.screen_type ?? 'page') === 'page',
  );
  if (pageScreens.length === 0) return chromeSpec;

  const nodes = { ...chromeSpec.nodes } as Record<string, NodeSpec>;
  let changed = false;

  for (const [id, node] of Object.entries(nodes)) {
    if ((node as { navigateTo?: string }).navigateTo) continue;
    if (node.parent === 'root') continue;
    const parentNode = node.parent ? nodes[node.parent] : null;
    if (!parentNode) continue;
    const isTabContainer = parentNode.parent === 'root'
      && /tab|nav/i.test(node.parent ?? '');
    if (!isTabContainer) continue;

    const text = collectNodeText(chromeSpec, id).toLowerCase();
    if (!text) continue;

    for (const page of pageScreens) {
      const pageName = page.name.toLowerCase();
      const pageId = page.id.toLowerCase();
      if (text === pageName || text === pageId
        || pageName.includes(text) || text.includes(pageName)) {
        nodes[id] = { ...node, navigateTo: page.id } as NodeSpec;
        changed = true;
        break;
      }
    }
  }

  return changed ? { ...chromeSpec, nodes } : chromeSpec;
}

/**
 * Ids to mention in the design prompt (frozen chrome subtree roots and descendants).
 */
export function listFrozenChromeNodeIds(
  spec: DesignSpecV2,
  shared: SharedChrome,
): string[] {
  const ids = new Set<string>();
  for (const comp of shared.components) {
    const rootId = findSharedChromeRootNodeId(spec, comp);
    if (!rootId) continue;
    for (const d of collectSubtreeIds(spec, rootId)) {
      ids.add(d);
    }
  }
  return [...ids].sort();
}
