/**
 * @module @agentforge/designspec-renderer/renderer/browser/dom-extraction
 *
 * Extracts DOM layout data from a rendered DesignSpec page via Playwright.
 * Single page.evaluate() call that queries all [data-node] elements and
 * collects bounding rects, scroll dimensions, computed styles, and
 * parent/child relationships.
 */

// Playwright Page type — kept as any to avoid hard dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlaywrightPage = any;

/** Layout data for a single DOM node with data-node attribute. */
export interface DOMNodeLayout {
  nodeId: string;
  dataCatalog: string | null;
  rect: { x: number; y: number; width: number; height: number };
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  textContent: string;
  parentNodeId: string | null;
  childNodeIds: string[];
  computed: { overflow: string; display: string; position: string };
}

/** Complete DOM layout data for a rendered DesignSpec page. */
export interface DOMLayoutData {
  nodes: Record<string, DOMNodeLayout>;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * Extract layout data from all [data-node] elements on the page.
 * Runs a single page.evaluate() call for efficiency.
 */
export async function extractDOMLayout(page: PlaywrightPage): Promise<DOMLayoutData> {
  const result = await page.evaluate(() => {
    const elements = document.querySelectorAll('[data-node]');
    const nodes: Record<string, {
      nodeId: string;
      dataCatalog: string | null;
      rect: { x: number; y: number; width: number; height: number };
      scrollWidth: number;
      clientWidth: number;
      scrollHeight: number;
      clientHeight: number;
      textContent: string;
      parentNodeId: string | null;
      childNodeIds: string[];
      computed: { overflow: string; display: string; position: string };
    }> = {};

    // First pass: collect all data-node elements
    const elementMap = new Map<string, Element>();
    for (const el of elements) {
      const nodeId = (el as HTMLElement).dataset.node!;
      elementMap.set(nodeId, el);
    }

    // Second pass: extract data
    for (const el of elements) {
      const htmlEl = el as HTMLElement;
      const nodeId = htmlEl.dataset.node!;
      const dataCatalog = htmlEl.dataset.catalog ?? null;
      const rect = htmlEl.getBoundingClientRect();
      const style = getComputedStyle(htmlEl);

      // Find parent: walk up DOM to nearest [data-node] ancestor
      let parentNodeId: string | null = null;
      let ancestor = htmlEl.parentElement;
      while (ancestor) {
        if (ancestor.dataset && ancestor.dataset.node) {
          parentNodeId = ancestor.dataset.node;
          break;
        }
        ancestor = ancestor.parentElement;
      }

      // Find children: direct [data-node] descendants (not nested deeper)
      const childNodeIds: string[] = [];
      const directChildren = htmlEl.querySelectorAll('[data-node]');
      for (const child of directChildren) {
        const childHtml = child as HTMLElement;
        const childId = childHtml.dataset.node!;
        if (childId === nodeId) continue;
        // Check that this child's nearest [data-node] ancestor is us
        let childAncestor = childHtml.parentElement;
        while (childAncestor && childAncestor !== htmlEl) {
          if (childAncestor.dataset && childAncestor.dataset.node) break;
          childAncestor = childAncestor.parentElement;
        }
        if (childAncestor === htmlEl) {
          childNodeIds.push(childId);
        }
      }

      // Get text content (trimmed, limited length)
      const text = htmlEl.textContent?.trim().slice(0, 200) ?? '';

      nodes[nodeId] = {
        nodeId,
        dataCatalog,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        scrollWidth: htmlEl.scrollWidth,
        clientWidth: htmlEl.clientWidth,
        scrollHeight: htmlEl.scrollHeight,
        clientHeight: htmlEl.clientHeight,
        textContent: text,
        parentNodeId,
        childNodeIds,
        computed: {
          overflow: style.overflow,
          display: style.display,
          position: style.position,
        },
      };
    }

    return {
      nodes,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  return result as DOMLayoutData;
}
