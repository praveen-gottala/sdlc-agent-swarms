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

/** Comprehensive computed styles extracted from the DOM. */
export interface DOMComputedStyles {
  overflow: string;
  display: string;
  position: string;
  // Sizing
  width: string;
  height: string;
  flex: string;
  flexShrink: string;
  flexGrow: string;
  flexBasis: string;
  minWidth: string;
  maxWidth: string;
  minHeight: string;
  maxHeight: string;
  // Layout
  flexDirection: string;
  flexWrap: string;
  gap: string;
  alignItems: string;
  justifyContent: string;
  gridTemplateColumns: string;
  // Spacing
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  // Colors
  backgroundColor: string;
  color: string;
  // Typography
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  textAlign: string;
  // Visual
  borderRadius: string;
  boxShadow: string;
  border: string;
  opacity: string;
  // Positioning
  zIndex: string;
  top: string;
  left: string;
  right: string;
  bottom: string;
}

/** Default computed styles for test helpers. */
export function defaultComputedStyles(): DOMComputedStyles {
  return {
    overflow: 'visible', display: 'block', position: 'static',
    width: '0px', height: '0px', flex: '0 1 auto',
    flexShrink: '1', flexGrow: '0', flexBasis: 'auto',
    minWidth: '0px', maxWidth: 'none', minHeight: '0px', maxHeight: 'none',
    flexDirection: 'row', flexWrap: 'nowrap', gap: 'normal',
    alignItems: 'normal', justifyContent: 'normal', gridTemplateColumns: 'none',
    paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px',
    marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px',
    backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)',
    fontFamily: 'serif', fontSize: '16px', fontWeight: '400', lineHeight: 'normal',
    textAlign: 'start',
    borderRadius: '0px', boxShadow: 'none', border: '0px none rgb(0, 0, 0)', opacity: '1',
    zIndex: 'auto', top: 'auto', left: 'auto', right: 'auto', bottom: 'auto',
  };
}

/** HTML attributes extracted from the DOM element. */
export interface DOMAttributes {
  'aria-label': string | null;
  role: string | null;
  href: string | null;
}

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
  directTextContent: string;
  parentNodeId: string | null;
  childNodeIds: string[];
  computed: DOMComputedStyles;
  attributes: DOMAttributes;
}

/** Complete DOM layout data for a rendered DesignSpec page. */
export interface DOMLayoutData {
  nodes: Record<string, DOMNodeLayout>;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * Extract layout data from all [data-node] elements on the page.
 * Delegates to extractDOMFromDocument() which runs inside page.evaluate().
 */
export async function extractDOMLayout(page: PlaywrightPage): Promise<DOMLayoutData> {
  // extractDOMFromDocument is a pure browser function — we inline its body
  // into page.evaluate() so it runs in the browser context.
  const result = await page.evaluate(() => {
    // Inline extraction (must be self-contained for Playwright serialization).
    // The canonical shared version is in dom-extraction-shared.ts.
    const elements = document.querySelectorAll('[data-node]');
    const nodes: Record<string, unknown> = {};

    const elementMap = new Map<string, Element>();
    for (const el of elements) {
      const nodeId = (el as HTMLElement).dataset.node!;
      elementMap.set(nodeId, el);
    }

    for (const el of elements) {
      const htmlEl = el as HTMLElement;
      const nodeId = htmlEl.dataset.node!;
      const dataCatalog = htmlEl.dataset.catalog ?? null;
      const rect = htmlEl.getBoundingClientRect();
      const style = getComputedStyle(htmlEl);

      let parentNodeId: string | null = null;
      let ancestor = htmlEl.parentElement;
      while (ancestor) {
        if (ancestor.dataset && ancestor.dataset.node) {
          parentNodeId = ancestor.dataset.node;
          break;
        }
        ancestor = ancestor.parentElement;
      }

      const childNodeIds: string[] = [];
      const directChildren = htmlEl.querySelectorAll('[data-node]');
      for (const child of directChildren) {
        const childHtml = child as HTMLElement;
        const childId = childHtml.dataset.node!;
        if (childId === nodeId) continue;
        let childAncestor = childHtml.parentElement;
        while (childAncestor && childAncestor !== htmlEl) {
          if (childAncestor.dataset && childAncestor.dataset.node) break;
          childAncestor = childAncestor.parentElement;
        }
        if (childAncestor === htmlEl) {
          childNodeIds.push(childId);
        }
      }

      const text = htmlEl.textContent?.trim().slice(0, 200) ?? '';
      let directText = '';
      for (const child of htmlEl.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          directText += child.textContent ?? '';
        }
      }
      directText = directText.trim().slice(0, 200);

      const ariaLabel = htmlEl.getAttribute('aria-label');
      const role = htmlEl.getAttribute('role');
      let href = htmlEl.getAttribute('href');
      if (!href) {
        const firstLink = htmlEl.querySelector('a[href]');
        if (firstLink) href = firstLink.getAttribute('href');
      }

      nodes[nodeId] = {
        nodeId,
        dataCatalog,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        scrollWidth: htmlEl.scrollWidth,
        clientWidth: htmlEl.clientWidth,
        scrollHeight: htmlEl.scrollHeight,
        clientHeight: htmlEl.clientHeight,
        textContent: text,
        directTextContent: directText,
        parentNodeId,
        childNodeIds,
        attributes: { 'aria-label': ariaLabel, role, href },
        computed: {
          overflow: style.overflow, display: style.display, position: style.position,
          width: style.width, height: style.height, flex: style.flex,
          flexShrink: style.flexShrink, flexGrow: style.flexGrow, flexBasis: style.flexBasis,
          minWidth: style.minWidth, maxWidth: style.maxWidth,
          minHeight: style.minHeight, maxHeight: style.maxHeight,
          flexDirection: style.flexDirection, flexWrap: style.flexWrap, gap: style.gap,
          alignItems: style.alignItems, justifyContent: style.justifyContent,
          gridTemplateColumns: style.gridTemplateColumns,
          paddingTop: style.paddingTop, paddingRight: style.paddingRight,
          paddingBottom: style.paddingBottom, paddingLeft: style.paddingLeft,
          marginTop: style.marginTop, marginRight: style.marginRight,
          marginBottom: style.marginBottom, marginLeft: style.marginLeft,
          backgroundColor: style.backgroundColor, color: style.color,
          fontFamily: style.fontFamily, fontSize: style.fontSize,
          fontWeight: style.fontWeight, lineHeight: style.lineHeight, textAlign: style.textAlign,
          borderRadius: style.borderRadius, boxShadow: style.boxShadow, border: style.border,
          opacity: style.opacity, zIndex: style.zIndex,
          top: style.top, left: style.left, right: style.right, bottom: style.bottom,
        },
      };
    }

    return { nodes, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
  });

  return result as DOMLayoutData;
}
