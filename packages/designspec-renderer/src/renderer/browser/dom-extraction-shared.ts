/**
 * @module @agentforge/designspec-renderer/renderer/browser/dom-extraction-shared
 *
 * Browser-safe DOM extraction function. Pure DOM API — no Playwright dependency.
 *
 * Used by:
 * - dom-extraction.ts (Playwright path: page.evaluate(extractDOMFromDocument))
 * - iframe-bridge.ts (browser path: called directly in iframe)
 */
import type { DOMLayoutData, DOMNodeLayout, DOMComputedStyles, DOMAttributes } from './dom-extraction.js';

/**
 * Extract layout data from all [data-node] elements in the current document.
 * Returns DOMLayoutData with computed styles, rects, attributes, and parent/child relationships.
 *
 * This function uses only standard DOM APIs (document, getComputedStyle, getBoundingClientRect).
 */
export function extractDOMFromDocument(): DOMLayoutData {
  const elements = document.querySelectorAll('[data-node]');
  const nodes: Record<string, DOMNodeLayout> = {};

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

    const computed: DOMComputedStyles = {
      overflow: style.overflow,
      display: style.display,
      position: style.position,
      width: style.width,
      height: style.height,
      flex: style.flex,
      flexShrink: style.flexShrink,
      flexGrow: style.flexGrow,
      flexBasis: style.flexBasis,
      minWidth: style.minWidth,
      maxWidth: style.maxWidth,
      minHeight: style.minHeight,
      maxHeight: style.maxHeight,
      flexDirection: style.flexDirection,
      flexWrap: style.flexWrap,
      gap: style.gap,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent,
      gridTemplateColumns: style.gridTemplateColumns,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      marginTop: style.marginTop,
      marginRight: style.marginRight,
      marginBottom: style.marginBottom,
      marginLeft: style.marginLeft,
      backgroundColor: style.backgroundColor,
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      textAlign: style.textAlign,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      border: style.border,
      opacity: style.opacity,
      zIndex: style.zIndex,
      top: style.top,
      left: style.left,
      right: style.right,
      bottom: style.bottom,
    };

    const attributes: DOMAttributes = {
      'aria-label': ariaLabel,
      role: role,
      href: href,
    };

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
      computed,
      attributes,
    };
  }

  return {
    nodes,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}
