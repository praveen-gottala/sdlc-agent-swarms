/**
 * Browser renderer bridge — wraps the production openBrowserSession()
 * from @agentforge/designspec-renderer so the harness renders specs
 * with the real Vite+React+shadcn pipeline instead of mini-renderer.
 *
 * Converts between the harness's DesignSpec / DOMNodeData formats
 * and the production DesignSpecV2 / DOMLayoutData formats.
 */
import {
  openBrowserSession,
  loadCatalogForRenderer,
  type BrowserSession,
  type DesignSpecV2,
  type DOMLayoutData,
  type RendererTokens,
  type CatalogMap,
} from "@agentforge/designspec-renderer";
import { writeFileSync } from "fs";
import type { DesignSpec, DOMNodeData } from "./types.js";
import { SEMANTIC_TOKENS, TYPOGRAPHY } from "./types.js";

// ── Default tokens & catalog ────────────────────────────────────────

let _tokens: RendererTokens | null = null;
let _catalog: CatalogMap | null = null;

function getTokensAndCatalog(): { tokens: RendererTokens; catalog: CatalogMap } {
  if (_tokens && _catalog) return { tokens: _tokens, catalog: _catalog };

  // Build RendererTokens from harness's SEMANTIC_TOKENS + TYPOGRAPHY
  _tokens = {
    colors: {
      primitive: Object.fromEntries(
        Object.entries(SEMANTIC_TOKENS)
          .filter(([, v]) => v.startsWith("#") || v.startsWith("rgb")),
      ),
      semantic: Object.fromEntries(
        Object.entries(SEMANTIC_TOKENS).map(([k, v]) => {
          // If the value is a hex/rgba, use a self-referencing key name
          // Otherwise, treat it as a reference to a primitive
          return [k, k];
        }),
      ),
    },
    typography: {
      font_families: { display: "DM Sans", body: "DM Mono" },
      scale: Object.entries(TYPOGRAPHY).map(([role, t]) => ({
        role,
        size: t.size,
        weight: t.weight,
        family: role.startsWith("heading") ? "display" : "body",
        line_height: t.lineHeight,
      })),
    },
    elevation: {
      levels: [
        { level: 0, shadow: "none", description: "flat" },
        { level: 1, shadow: "0 1px 4px rgba(0,0,0,0.3)", description: "sm" },
        { level: 2, shadow: "0 4px 16px rgba(0,0,0,0.4)", description: "md" },
        { level: 3, shadow: "0 12px 32px rgba(0,0,0,0.5)", description: "lg" },
      ],
    },
    borders: { radius: { sm: 4, md: 8, lg: 12, xl: 16 } },
    spacing: { unit: 4, scale: [4, 8, 12, 16, 24, 32, 48] },
  };

  // Use built-in V2 catalog (no project-specific overrides)
  _catalog = loadCatalogForRenderer();

  return { tokens: _tokens, catalog: _catalog };
}

// ── Spec conversion ─────────────────────────────────────────────────

function toDesignSpecV2(spec: DesignSpec): DesignSpecV2 {
  const nodes: Record<string, Record<string, unknown>> = {};
  for (const [id, node] of Object.entries(spec.nodes)) {
    const mapped: Record<string, unknown> = { ...node };

    // Map CSS flex align/justify values to production short names
    if (node.layout) {
      const layout: Record<string, unknown> = { ...node.layout };
      const alignMap: Record<string, string> = {
        "flex-start": "start", "flex-end": "end", center: "center", stretch: "stretch",
      };
      const justifyMap: Record<string, string> = {
        "flex-start": "start", "flex-end": "end", center: "center",
        "space-between": "space-between", "space-around": "space-between",
      };
      if (layout.align) layout.align = alignMap[layout.align as string] ?? layout.align;
      if (layout.justify) layout.justify = justifyMap[layout.justify as string] ?? layout.justify;
      mapped.layout = layout;
    }

    nodes[id] = mapped;
  }

  return {
    screen: spec.screen,
    width: spec.width,
    nodes: nodes as unknown as DesignSpecV2["nodes"],
  };
}

// ── DOM conversion ──────────────────────────────────────────────────

function toDOMNodeDataArray(dom: DOMLayoutData): DOMNodeData[] {
  return Object.values(dom.nodes).map((node) => ({
    nodeId: node.nodeId,
    tagName: "div",
    rect: {
      x: node.rect.x,
      y: node.rect.y,
      width: node.rect.width,
      height: node.rect.height,
      top: node.rect.y,
      right: node.rect.x + node.rect.width,
      bottom: node.rect.y + node.rect.height,
      left: node.rect.x,
    },
    scrollWidth: node.scrollWidth,
    scrollHeight: node.scrollHeight,
    clientWidth: node.clientWidth,
    clientHeight: node.clientHeight,
    computedStyles: {
      display: node.computed.display,
      flexDirection: "row",
      overflow: node.computed.overflow,
      visibility: "visible",
    },
    textContent: node.textContent,
    childCount: node.childNodeIds.length,
    parentNodeId: node.parentNodeId,
    dataCatalog: node.dataCatalog,
  }));
}

// ── Session management ──────────────────────────────────────────────

let _session: BrowserSession | null = null;

export async function closeBrowserSession(): Promise<void> {
  if (_session) {
    await _session.close();
    _session = null;
  }
}

// ── Public API ──────────────────────────────────────────────────────

export interface BrowserRenderResult {
  domData: DOMNodeData[];
  screenshotPath: string;
  html: string;
}

/**
 * Render a harness DesignSpec using the production browser renderer,
 * extract DOM data, and take a screenshot.
 */
export async function renderAndExtract(
  spec: DesignSpec,
  screenshotPath: string,
): Promise<BrowserRenderResult> {
  const { tokens, catalog } = getTokensAndCatalog();
  const v2Spec = toDesignSpecV2(spec);

  // Close previous session if any
  if (_session) {
    await _session.close();
    _session = null;
  }

  const { session, initial } = await openBrowserSession(v2Spec, tokens, catalog, {
    width: spec.width,
  });
  _session = session;

  // Save screenshot
  writeFileSync(screenshotPath, initial.screenshot);

  // Extract DOM
  const domLayout = await session.extractDOM();
  const domData = toDOMNodeDataArray(domLayout);

  // Close session (each spec gets its own)
  await session.close();
  _session = null;

  return {
    domData,
    screenshotPath,
    html: initial.html,
  };
}
