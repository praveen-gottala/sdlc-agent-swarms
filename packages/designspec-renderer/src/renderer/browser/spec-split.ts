/**
 * Pure utilities to slice DesignSpec v2 flat graphs for LayoutShell (chrome vs content).
 */
import type { DesignSpecV2, NodeSpec } from '../../types/design-spec-v2.js';
import type { SharedChromeSpec } from '../../types/shared-chrome.js';

function findRootId(spec: DesignSpecV2): string {
  const entry = Object.entries(spec.nodes).find(([, n]) => n.parent === null);
  return entry ? entry[0] : 'root';
}

function collectSubtreeIds(spec: DesignSpecV2, rootIds: readonly string[]): Set<string> {
  const keep = new Set<string>(rootIds);
  const queue = [...rootIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const [childId, node] of Object.entries(spec.nodes)) {
      if (node.parent === id && !keep.has(childId)) {
        keep.add(childId);
        queue.push(childId);
      }
    }
  }
  return keep;
}

/**
 * Returns a new spec containing the listed root-level child IDs and all transitive descendants.
 * The `root` node is always kept. Empty `keepRootChildren` yields only `root` in `nodes`.
 *
 * The returned spec's `root` is coerced from `type: 'page'` to `type: 'container'`.
 * A filtered chrome region (header / sidebar / footer) is a fragment of the full
 * page, not a standalone page — if `root` stays `page`, DesignSpecRenderer would
 * apply `min-height: 100vh` to it, causing (for example) the header to occupy
 * the entire viewport and collapse the content slot to 0px.
 */
export function filterSpecToNodes(
  spec: DesignSpecV2,
  keepRootChildren: readonly string[],
): DesignSpecV2 {
  const rootId = findRootId(spec);
  const subtree = collectSubtreeIds(spec, [...keepRootChildren]);
  const keep = new Set<string>([rootId, ...subtree]);

  const nodes: Record<string, NodeSpec> = {};
  for (const [id, node] of Object.entries(spec.nodes)) {
    if (!keep.has(id)) continue;
    if (id === rootId && (node as { type?: string }).type === 'page') {
      nodes[id] = { ...node, type: 'container' } as NodeSpec;
    } else {
      nodes[id] = node;
    }
  }
  return { ...spec, nodes };
}

/**
 * Returns a new spec with the given root-level children (and their descendants) removed.
 * Unknown ids in `dropRootChildren` are ignored.
 *
 * Empty root-level spacer nodes (type === 'spacer' with no children) are also
 * stripped — they are layout artifacts from chrome-adjacent design. Spacers
 * that contain children are kept (the LLM sometimes mislabels content
 * containers as spacers).
 *
 * The root node is coerced from `type: 'page'` to `type: 'container'` because
 * the stripped spec is a fragment inside LayoutShell, not a standalone page.
 */
export function stripChromeFromSpec(
  spec: DesignSpecV2,
  dropRootChildren: readonly string[],
): DesignSpecV2 {
  if (dropRootChildren.length === 0) {
    return spec;
  }
  const rootId = findRootId(spec);
  const hasChildren = (id: string): boolean =>
    Object.values(spec.nodes).some((n) => n.parent === id);
  const emptySpacerIds = Object.entries(spec.nodes)
    .filter(([id, n]) => n.parent === rootId
      && (n as { type?: string }).type === 'spacer'
      && !hasChildren(id))
    .map(([id]) => id);
  const drop = collectSubtreeIds(spec, [...dropRootChildren, ...emptySpacerIds]);
  const nodes: Record<string, NodeSpec> = {};
  for (const [id, node] of Object.entries(spec.nodes)) {
    if (drop.has(id)) continue;
    if (id === rootId && (node as { type?: string }).type === 'page') {
      nodes[id] = { ...node, type: 'container' } as NodeSpec;
    } else if (node.parent === rootId
      && (node as { type?: string }).type === 'spacer'
      && hasChildren(id)) {
      nodes[id] = { ...node, type: 'container' } as NodeSpec;
    } else {
      nodes[id] = node;
    }
  }
  return { ...spec, nodes };
}

const compactId = (s: string): string => s.replace(/-/g, '').toLowerCase();

const CHROME_REGION_ID_PATTERNS: Readonly<Record<string, RegExp>> = {
  header: /^(top-?bar|header|app-?bar|nav-?bar)(-|$)/i,
  footer: /^(nav-?tabs?|bottom-?nav|tab-?bar|footer)(-|$)/i,
  sidebar: /^(side-?nav|sidebar|side-?bar)(-|$)/i,
};

const CHROME_REGION_TYPES: Readonly<Record<string, string>> = {
  header: 'header',
  footer: 'footer',
};

/**
 * Resolve the page-spec root-child node ids that correspond to the given chrome
 * region roots. The Chrome Pass is a separate LLM run and may use different IDs
 * than per-page specs (e.g. chrome generates `topbar` while pages use `top-bar`).
 *
 * For each chrome region root, pick the matching page root-child via, in order:
 *   1. Exact ID
 *   2. Compact (hyphen-stripped, lowercased) ID
 *   3. Region-specific pattern on id or `node.type`
 *
 * Returns a deduplicated list of page root-child ids to strip when the content
 * slot renders, so the LayoutShell's chrome is not visually duplicated.
 */
export function findPageChromeRootIds(
  pageSpec: DesignSpecV2,
  regions: SharedChromeSpec['regions'] | undefined,
): string[] {
  if (!regions) return [];
  const rootId = Object.entries(pageSpec.nodes).find(([, n]) => n.parent === null)?.[0] ?? 'root';
  const rootChildren: Array<[string, NodeSpec]> = Object.entries(pageSpec.nodes)
    .filter(([, n]) => n.parent === rootId);
  const out = new Set<string>();
  for (const [region, chromeIds] of Object.entries(regions)) {
    if (!chromeIds || chromeIds.length === 0) continue;
    const pattern = CHROME_REGION_ID_PATTERNS[region];
    const typ = CHROME_REGION_TYPES[region];
    for (const chromeId of chromeIds) {
      const exact = rootChildren.find(([id]) => id === chromeId);
      if (exact) { out.add(exact[0]); continue; }
      const byCompact = rootChildren.find(([id]) => compactId(id) === compactId(chromeId));
      if (byCompact) { out.add(byCompact[0]); continue; }
      if (pattern || typ) {
        const byPattern = rootChildren.find(
          ([id, n]) =>
            (!!pattern && pattern.test(id))
            || (!!typ && (n as { type?: string }).type === typ),
        );
        if (byPattern) out.add(byPattern[0]);
      }
    }
  }
  return [...out];
}

/**
 * A root-level node with `position: absolute|fixed` and a backdrop-like
 * background ("overlay", "scrim", "modal-bg") is a full-viewport modal shell
 * that the LLM embedded into the page but has no open/close state. In the
 * prototype it would cover the real content every time the page renders.
 * Return true for those nodes so callers can hide them.
 */
export function isPersistentOverlayBackdrop(node: NodeSpec): boolean {
  const overrides = (node as { overrides?: Record<string, unknown> }).overrides ?? {};
  const pos = overrides.position;
  if (pos !== 'absolute' && pos !== 'fixed') return false;
  const bg = ((node as { background?: string }).background ?? '').toLowerCase();
  return /^(overlay|scrim|modal-?(bg|backdrop)|backdrop)$/i.test(bg);
}

/**
 * Strip any root-level absolute/fixed overlay backdrops from the spec.
 * Safe to call on specs that have none — returns the input unchanged.
 */
export function stripPersistentOverlays(spec: DesignSpecV2): DesignSpecV2 {
  const rootId = findRootId(spec);
  const overlayRoots = Object.entries(spec.nodes)
    .filter(([, n]) => n.parent === rootId && isPersistentOverlayBackdrop(n))
    .map(([id]) => id);
  if (overlayRoots.length === 0) return spec;
  return stripChromeFromSpec(spec, overlayRoots);
}

/** Flatten region map into unique root node ids (preserves header → sidebar → footer order). */
export function collectChromeRootIds(regions: SharedChromeSpec['regions']): string[] {
  if (!regions) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of ['header', 'sidebar', 'footer'] as const) {
    const ids = regions[key];
    if (!ids) continue;
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

type MutableNode = NodeSpec & { active?: boolean };

/**
 * Clone shared chrome and set `active` on tab-like nodes from `navigateTo === activePageId`.
 */
export function applyChromeActiveForPage(
  chrome: SharedChromeSpec,
  activePageId: string,
): SharedChromeSpec {
  const nodes: Record<string, NodeSpec> = {};
  for (const [id, node] of Object.entries(chrome.nodes)) {
    const next: MutableNode = { ...node } as MutableNode;
    const isTab = next.catalog === 'tab' || !!next.navigateTo;
    if (isTab && next.navigateTo) {
      next.active = next.navigateTo === activePageId;
    } else if (isTab) {
      delete next.active;
    }
    nodes[id] = next;
  }
  return { ...chrome, nodes };
}
