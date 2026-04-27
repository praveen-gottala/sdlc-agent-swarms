/**
 * @module @agentforge/designspec-renderer/renderer/browser/verify-properties
 *
 * Browser-safe property verification: compares DesignSpec JSON properties
 * against computed DOM styles. Pure functions with zero Node.js dependencies.
 *
 * Used by:
 * - verify-design-render.ts (CLI, via Playwright)
 * - Dashboard audit tab (browser, via iframe bridge DOM extraction)
 */
import type { NodeSpec, LayoutSpec } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { DOMComputedStyles, DOMAttributes } from './dom-extraction.js';

// ─── Types ──────────────────────────────────────────────

export type Verdict = 'PASS' | 'FAIL' | 'DROP' | 'SKIP' | 'DATA-PASS' | 'DATA-FAIL' | 'DATA-SKIP';

export interface PropertyCheck {
  property: string;
  specValue: string;
  computedValue: string;
  verdict: Verdict;
  note?: string;
}

export interface NodeReport {
  nodeId: string;
  nodeType: string;
  checks: PropertyCheck[];
}

export interface DOMNodeInfo {
  computed: DOMComputedStyles;
  attributes: DOMAttributes;
  textContent: string;
}

// ─── Override key sets ──────────────────────────────────

export const SAFE_OVERRIDE_KEYS = new Set([
  'maxWidth', 'minWidth', 'maxHeight', 'minHeight',
  'height', 'flex',
  'padding', 'marginInline',
  'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'gap',
  'border', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight',
  'borderRadius', 'borderRadiusTop',
  'borderColor',
  'position', 'top', 'left', 'right', 'bottom',
  'zIndex',
  'flexBasis', 'flexShrink', 'flexGrow',
  'overflow', 'overflowX', 'overflowY',
  'pointerEvents', 'cursor', 'opacity',
  'whiteSpace',
  'fontSize', 'fontFamily', 'fontWeight',
  'display', 'alignItems', 'justifyContent',
  'flexDirection', 'flexWrap',
  'background', 'backgroundColor', 'color',
  'hidden', 'visibility',
  'textAlign',
]);

const ATTR_OVERRIDE_KEYS = new Set(['role', 'aria-label', 'href']);
const CONTENT_OVERRIDE_KEYS = new Set(['brand_name', 'initials', 'caption']);
const SKIP_OVERRIDE_KEYS = new Set([
  'nav_links', 'active_link', 'aria-sort', 'sortable', 'scope',
  'columns', 'rows', 'variant', 'icon', 'iconPosition', 'size',
  'selected', 'checked', 'tabs', 'name', 'alt', 'direction',
  'positionX', 'positionY',
  'progressRing', 'progressValue', 'strokeWidth', 'strokeColor',
  'trackColor', 'ringStyle',
  'hidePlaceholder', 'style', 'type',
]);

// ─── Token resolution (simplified) ─────────────────────

export function buildSimpleTokenMap(tokens: RendererTokens): Record<string, string> {
  const map: Record<string, string> = {};
  const colors = (tokens as Record<string, unknown>).colors as Record<string, Record<string, string>> | undefined;
  if (!colors) return map;

  const primitiveMap: Record<string, string> = {};
  const primitive = colors.primitive as Record<string, string> | undefined;
  if (primitive) {
    for (const [key, val] of Object.entries(primitive)) {
      if (typeof val === 'string') {
        primitiveMap[key] = val;
        map[key] = val;
      }
    }
  }

  const semantic = colors.semantic as Record<string, string> | undefined;
  if (semantic) {
    for (const [key, val] of Object.entries(semantic)) {
      if (typeof val !== 'string') continue;
      if (val.startsWith('#') || val.startsWith('rgb')) {
        map[key] = val;
      } else if (primitiveMap[val]) {
        map[key] = primitiveMap[val];
      }
    }
  }
  return map;
}

// ─── Comparison helpers ─────────────────────────────────

export function parsePx(v: string): number | null {
  const m = v.match(/^(-?[\d.]+)px$/);
  return m ? parseFloat(m[1]) : null;
}

export function approxEq(a: number, b: number, tol = 2): boolean {
  return Math.abs(a - b) <= tol;
}

export function normalizeColor(c: string): string {
  return c.toLowerCase().replace(/\s+/g, '');
}

export function colorsMatch(spec: string, computed: string): boolean {
  if (!spec || !computed) return false;
  const s = normalizeColor(spec);
  const c = normalizeColor(computed);
  if (s === c) return true;
  if (s === 'transparent' && (c === 'rgba(0,0,0,0)' || c === 'transparent')) return true;
  if (s.startsWith('#') && c.startsWith('rgb')) {
    const hex = s.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return c.includes(`${r},${g},${b}`) || c.includes(`${r}, ${g}, ${b}`);
  }
  return false;
}

// ─── Property verification ─────────────────────────────

export function verifyNode(
  nodeId: string,
  nodeSpec: NodeSpec,
  computed: DOMComputedStyles | undefined,
  tokenMap: Record<string, string>,
  domData?: DOMNodeInfo,
): NodeReport {
  const checks: PropertyCheck[] = [];
  const nodeType = nodeSpec.type
    ? `type:${nodeSpec.type}`
    : nodeSpec.catalog
      ? `catalog:${nodeSpec.catalog}`
      : 'unknown';

  if (!computed) {
    checks.push({
      property: '*',
      specValue: '-',
      computedValue: '-',
      verdict: 'FAIL',
      note: 'Node not found in DOM (no [data-node] element)',
    });
    return { nodeId, nodeType, checks };
  }

  // Width
  if (nodeSpec.width !== undefined) {
    if (nodeSpec.width === 'fill') {
      const flex = computed.flex;
      const growVal = parseFloat(computed.flexGrow);
      const pass = flex.startsWith('1') || growVal >= 1;
      checks.push({
        property: 'width',
        specValue: 'fill',
        computedValue: `flex:${flex}`,
        verdict: pass ? 'PASS' : 'FAIL',
      });
    } else if (typeof nodeSpec.width === 'number') {
      const computedPx = parsePx(computed.width);
      const pass = computedPx !== null && approxEq(computedPx, nodeSpec.width);
      checks.push({
        property: 'width',
        specValue: `${nodeSpec.width}px`,
        computedValue: computed.width,
        verdict: pass ? 'PASS' : 'FAIL',
      });
    }
  }

  // Height
  if (typeof nodeSpec.height === 'number') {
    const computedPx = parsePx(computed.height);
    const pass = computedPx !== null && approxEq(computedPx, nodeSpec.height);
    checks.push({
      property: 'height',
      specValue: `${nodeSpec.height}px`,
      computedValue: computed.height,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  // Radius
  if (nodeSpec.radius !== undefined) {
    const computedPx = parsePx(computed.borderRadius);
    const pass = computedPx !== null && approxEq(computedPx, nodeSpec.radius);
    checks.push({
      property: 'radius',
      specValue: `${nodeSpec.radius}px`,
      computedValue: computed.borderRadius,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  // Background (skip if an override explicitly sets background-color)
  if (nodeSpec.background) {
    const bgOverride = nodeSpec.overrides?.['background-color']
      ?? nodeSpec.overrides?.['backgroundColor']
      ?? nodeSpec.overrides?.['background'];
    if (bgOverride) {
      checks.push({
        property: 'background',
        specValue: `${nodeSpec.background} (overridden by overrides.background-color)`,
        computedValue: computed.backgroundColor,
        verdict: 'PASS',
        note: 'Override takes precedence over node background',
      });
    } else {
      const expectedHex = tokenMap[nodeSpec.background] ?? nodeSpec.background;
      const pass = colorsMatch(expectedHex, computed.backgroundColor);
      checks.push({
        property: 'background',
        specValue: `${nodeSpec.background} (${expectedHex})`,
        computedValue: computed.backgroundColor,
        verdict: pass ? 'PASS' : 'FAIL',
      });
    }
  }

  // Shadow
  if (nodeSpec.shadow) {
    const pass = computed.boxShadow !== 'none' && computed.boxShadow !== '';
    checks.push({
      property: 'shadow',
      specValue: nodeSpec.shadow,
      computedValue: computed.boxShadow.substring(0, 50),
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  // Layout properties
  verifyLayout(nodeSpec.layout, computed, checks);

  // Overrides
  verifyOverrides(nodeSpec.overrides, domData, checks);

  return { nodeId, nodeType, checks };
}

function verifyLayout(
  layout: LayoutSpec | undefined,
  computed: DOMComputedStyles,
  checks: PropertyCheck[],
): void {
  if (!layout) return;

  if (layout.dir) {
    const expected = layout.dir;
    const pass = computed.flexDirection === expected;
    checks.push({
      property: 'layout.dir',
      specValue: expected,
      computedValue: computed.flexDirection,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  if (layout.gap !== undefined) {
    const gapPx = parsePx(computed.gap);
    const pass = (gapPx !== null && approxEq(gapPx, layout.gap))
      || (layout.gap === 0 && (computed.gap === 'normal' || computed.gap === '0px'));
    checks.push({
      property: 'layout.gap',
      specValue: `${layout.gap}px`,
      computedValue: computed.gap,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  if (layout.align) {
    const alignMap: Record<string, string> = {
      start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch',
    };
    const expected = alignMap[layout.align] ?? layout.align;
    const pass = computed.alignItems === expected || computed.alignItems === layout.align;
    checks.push({
      property: 'layout.align',
      specValue: layout.align,
      computedValue: computed.alignItems,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  if (layout.justify) {
    const justifyMap: Record<string, string> = {
      start: 'flex-start', end: 'flex-end', center: 'center',
      'space-between': 'space-between',
    };
    const expected = justifyMap[layout.justify] ?? layout.justify;
    const pass = computed.justifyContent === expected || computed.justifyContent === layout.justify;
    checks.push({
      property: 'layout.justify',
      specValue: layout.justify,
      computedValue: computed.justifyContent,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  if (layout.px !== undefined) {
    const l = parsePx(computed.paddingLeft);
    const r = parsePx(computed.paddingRight);
    const pass = l !== null && r !== null && approxEq(l, layout.px) && approxEq(r, layout.px);
    checks.push({
      property: 'layout.px',
      specValue: `${layout.px}px`,
      computedValue: `L:${computed.paddingLeft} R:${computed.paddingRight}`,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  if (layout.py !== undefined) {
    const t = parsePx(computed.paddingTop);
    const b = parsePx(computed.paddingBottom);
    const pass = t !== null && b !== null && approxEq(t, layout.py) && approxEq(b, layout.py);
    checks.push({
      property: 'layout.py',
      specValue: `${layout.py}px`,
      computedValue: `T:${computed.paddingTop} B:${computed.paddingBottom}`,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  if (layout.pt !== undefined) {
    const t = parsePx(computed.paddingTop);
    const pass = t !== null && approxEq(t, layout.pt);
    checks.push({
      property: 'layout.pt',
      specValue: `${layout.pt}px`,
      computedValue: computed.paddingTop,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  if (layout.pb !== undefined) {
    const b = parsePx(computed.paddingBottom);
    const pass = b !== null && approxEq(b, layout.pb);
    checks.push({
      property: 'layout.pb',
      specValue: `${layout.pb}px`,
      computedValue: computed.paddingBottom,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  if (layout.wrap) {
    const pass = computed.flexWrap === 'wrap';
    checks.push({
      property: 'layout.wrap',
      specValue: 'true',
      computedValue: computed.flexWrap,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }

  if (layout.display === 'grid') {
    const pass = computed.display === 'grid';
    checks.push({
      property: 'layout.display',
      specValue: 'grid',
      computedValue: computed.display,
      verdict: pass ? 'PASS' : 'FAIL',
    });
  }
}

function verifyOverrides(
  overrides: Readonly<Record<string, unknown>> | undefined,
  domNode: DOMNodeInfo | undefined,
  checks: PropertyCheck[],
): void {
  if (!overrides) return;

  for (const [key, value] of Object.entries(overrides)) {
    if (ATTR_OVERRIDE_KEYS.has(key)) {
      if (!domNode) {
        checks.push({ property: `overrides.${key}`, specValue: String(value).substring(0, 60), computedValue: '-', verdict: 'DATA-FAIL', note: 'Node not in DOM' });
        continue;
      }
      const attrKey = key as keyof DOMAttributes;
      const actual = domNode.attributes[attrKey];
      const expected = String(value);
      const pass = actual !== null && actual === expected;
      checks.push({
        property: `overrides.${key}`,
        specValue: expected.substring(0, 60),
        computedValue: actual ?? '(missing)',
        verdict: pass ? 'DATA-PASS' : 'DATA-FAIL',
        note: pass ? 'HTML attribute matches' : 'HTML attribute missing or mismatched',
      });
      continue;
    }

    if (CONTENT_OVERRIDE_KEYS.has(key)) {
      if (!domNode) {
        checks.push({ property: `overrides.${key}`, specValue: String(value).substring(0, 60), computedValue: '-', verdict: 'DATA-FAIL', note: 'Node not in DOM' });
        continue;
      }
      const expected = String(value);
      const pass = domNode.textContent.includes(expected);
      checks.push({
        property: `overrides.${key}`,
        specValue: expected.substring(0, 60),
        computedValue: pass ? '(found in textContent)' : domNode.textContent.substring(0, 60),
        verdict: pass ? 'DATA-PASS' : 'DATA-FAIL',
        note: pass ? 'Text content contains expected value' : 'Expected text not found in rendered content',
      });
      continue;
    }

    if (SKIP_OVERRIDE_KEYS.has(key)) {
      checks.push({
        property: `overrides.${key}`,
        specValue: typeof value === 'string' ? value.substring(0, 40) : JSON.stringify(value).substring(0, 40),
        computedValue: '-',
        verdict: 'DATA-SKIP',
        note: 'Component-specific override (needs component-level tests)',
      });
      continue;
    }

    if (!SAFE_OVERRIDE_KEYS.has(key)) {
      const normalizedKey = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
        .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      if (!SAFE_OVERRIDE_KEYS.has(normalizedKey)) {
        checks.push({
          property: `overrides.${key}`,
          specValue: String(value).substring(0, 40),
          computedValue: '-',
          verdict: 'DROP',
          note: 'Not in SAFE_OVERRIDE_KEYS — silently filtered by renderer',
        });
        continue;
      }
    }

    checks.push({
      property: `overrides.${key}`,
      specValue: String(value).substring(0, 40),
      computedValue: '(applied via style builder)',
      verdict: 'PASS',
      note: 'In SAFE_OVERRIDE_KEYS — applied by renderer',
    });
  }
}
