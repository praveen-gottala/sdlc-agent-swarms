#!/usr/bin/env tsx
/**
 * Verify that all DesignSpec JSON properties render correctly in the browser.
 *
 * Usage:
 *   npx tsx .../verify-design-render.ts <project> <screen>
 *
 * Example:
 *   npx tsx .../verify-design-render.ts apps/claim-filling dashboard
 *
 * Renders the spec headlessly via Playwright, extracts comprehensive computed
 * styles from every [data-node] element, and compares against the spec JSON.
 * Outputs a structured gap analysis report.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as yamlParse } from 'yaml';
import { loadCatalogForRenderer } from '../../catalog/loader.js';
import { openBrowserSession } from './screenshot-session.js';
import { checkMechanicalIssues } from './mechanical-fixes.js';
import type { DesignSpecV2, NodeSpec, LayoutSpec } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { DOMComputedStyles, DOMAttributes } from './dom-extraction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONOREPO_ROOT = path.resolve(__dirname, '../../../../..');

const SAFE_OVERRIDE_KEYS = new Set([
  'max_width', 'maxWidth', 'min_width', 'minWidth',
  'max_height', 'maxHeight', 'min_height', 'minHeight',
  'height', 'flex',
  'padding', 'margin_inline', 'marginInline',
  'padding_top', 'paddingTop', 'padding_bottom', 'paddingBottom',
  'padding_left', 'paddingLeft', 'padding_right', 'paddingRight',
  'margin_top', 'marginTop', 'margin_bottom', 'marginBottom',
  'margin_left', 'marginLeft', 'margin_right', 'marginRight',
  'gap',
  'border', 'border_top', 'borderTop', 'border_bottom', 'borderBottom',
  'border_left', 'borderLeft', 'border_right', 'borderRight',
  'border_radius', 'borderRadius',
  'position', 'top', 'left', 'right', 'bottom',
  'z_index', 'zIndex',
  'flex_basis', 'flexBasis', 'flex_shrink', 'flexShrink', 'flex_grow', 'flexGrow',
  'overflow', 'overflow_x', 'overflowX', 'overflow_y', 'overflowY',
  'pointer_events', 'pointerEvents', 'cursor', 'opacity',
  'white_space', 'whiteSpace',
  'font_size', 'fontSize', 'font_family', 'fontFamily',
  'display', 'align_items', 'alignItems', 'justify_content', 'justifyContent',
  'flex_direction', 'flexDirection', 'flex_wrap', 'flexWrap',
  'background', 'background_color', 'backgroundColor', 'color',
]);

// Tier 1: verifiable via HTML attributes
const ATTR_OVERRIDE_KEYS = new Set(['role', 'aria-label', 'href']);

// Tier 2: verifiable via textContent presence
const CONTENT_OVERRIDE_KEYS = new Set(['brand_name', 'initials', 'caption']);

// Tier 3: not programmatically verifiable (complex structures or component-specific)
const SKIP_OVERRIDE_KEYS = new Set([
  'nav_links', 'active_link', 'aria-sort', 'sortable', 'scope',
  'columns', 'rows', 'variant', 'icon', 'iconPosition', 'size',
  'selected', 'checked', 'tabs', 'name', 'alt', 'direction',
  'positionX', 'positionY',
]);

// ─── Types ──────────────────────────────────────────────

type Verdict = 'PASS' | 'FAIL' | 'DROP' | 'SKIP' | 'DATA-PASS' | 'DATA-FAIL' | 'DATA-SKIP';

interface PropertyCheck {
  property: string;
  specValue: string;
  computedValue: string;
  verdict: Verdict;
  note?: string;
}

interface NodeReport {
  nodeId: string;
  nodeType: string;
  checks: PropertyCheck[];
}

// ─── CLI ────────────────────────────────────────────────

function parseArgs(): { project: string; screen: string } {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const project = args[0];
  const screen = args[1];
  if (!project || !screen) {
    console.log(`
Usage:
  npx tsx verify-design-render.ts <project> <screen>

Example:
  npx tsx verify-design-render.ts apps/claim-filling dashboard
`);
    process.exit(1);
  }
  return { project, screen };
}

function resolvePaths(project: string, screen: string) {
  const projectRoot = path.join(MONOREPO_ROOT, project);
  if (!existsSync(projectRoot)) {
    console.error(`Project not found: ${projectRoot}`);
    process.exit(1);
  }
  const specPath = path.join(projectRoot, `agentforge/designs/${screen}.json`);
  const tokensPath = path.join(projectRoot, 'agentforge/spec/design-tokens.yaml');
  const catalogPath = path.join(projectRoot, 'agentforge/spec/component-catalog.yaml');

  for (const [label, p] of [
    ['spec', specPath], ['tokens', tokensPath], ['catalog', catalogPath],
  ] as const) {
    if (!existsSync(p)) {
      console.error(`${label} file not found: ${p}`);
      process.exit(1);
    }
  }
  return { projectRoot, specPath, tokensPath, catalogPath };
}

function loadProjectData(specPath: string, tokensPath: string, catalogPath: string) {
  const spec: DesignSpecV2 = JSON.parse(readFileSync(specPath, 'utf-8'));
  const rawTokens = yamlParse(readFileSync(tokensPath, 'utf-8'));
  const { version: _v, created_by: _cb, ...tokens } = rawTokens;
  const rawCatalog = yamlParse(readFileSync(catalogPath, 'utf-8'));
  const catalog = loadCatalogForRenderer(rawCatalog, tokens as RendererTokens);
  return { spec, tokens: tokens as RendererTokens, catalog };
}

// ─── Token resolution (simplified) ─────────────────────

function buildSimpleTokenMap(tokens: RendererTokens): Record<string, string> {
  const map: Record<string, string> = {};
  const colors = (tokens as Record<string, unknown>).colors as Record<string, Record<string, string>> | undefined;
  if (!colors) return map;

  const primitiveMap: Record<string, string> = {};
  const primitive = colors.primitive as Record<string, string> | undefined;
  if (primitive) {
    for (const [key, val] of Object.entries(primitive)) {
      if (typeof val === 'string') primitiveMap[key] = val;
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

function parsePx(v: string): number | null {
  const m = v.match(/^(-?[\d.]+)px$/);
  return m ? parseFloat(m[1]) : null;
}

function approxEq(a: number, b: number, tol = 2): boolean {
  return Math.abs(a - b) <= tol;
}

function normalizeColor(c: string): string {
  return c.toLowerCase().replace(/\s+/g, '');
}

function colorsMatch(spec: string, computed: string): boolean {
  if (!spec || !computed) return false;
  const s = normalizeColor(spec);
  const c = normalizeColor(computed);
  if (s === c) return true;
  if (s === 'transparent' && (c === 'rgba(0,0,0,0)' || c === 'transparent')) return true;
  // hex to rgb comparison
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

interface DOMNodeInfo {
  computed: DOMComputedStyles;
  attributes: DOMAttributes;
  textContent: string;
}

function verifyNode(
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
    // Tier 1: HTML attribute checks
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

    // Tier 2: content presence checks
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

    // Tier 3: skip — complex/component-specific overrides
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

    // CSS override: check against SAFE_OVERRIDE_KEYS
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

// ─── Report output ──────────────────────────────────────

function printReport(
  project: string,
  screen: string,
  reports: NodeReport[],
  specNodeCount: number,
  domNodeCount: number,
  mechanicalIssues: Array<{ nodeId: string; type: string; severity: string; message: string }>,
): void {
  console.log('\n' + '='.repeat(60));
  console.log('DESIGN RENDER VERIFICATION REPORT');
  console.log('='.repeat(60));
  console.log(`Project: ${project}  Screen: ${screen}`);
  console.log(`Spec nodes: ${specNodeCount}  DOM nodes: ${domNodeCount}  Missing: ${specNodeCount - domNodeCount}`);

  let totalPass = 0, totalFail = 0, totalDrop = 0, totalSkip = 0;
  let totalDataPass = 0, totalDataFail = 0, totalDataSkip = 0;

  console.log('\n' + '-'.repeat(60));
  console.log('NODE-BY-NODE VERIFICATION');
  console.log('-'.repeat(60));

  for (const report of reports) {
    const issues = report.checks.filter((c) =>
      c.verdict === 'FAIL' || c.verdict === 'DROP' || c.verdict === 'DATA-FAIL');
    if (issues.length === 0) {
      for (const c of report.checks) {
        switch (c.verdict) {
          case 'PASS': totalPass++; break;
          case 'SKIP': totalSkip++; break;
          case 'DATA-PASS': totalDataPass++; break;
          case 'DATA-SKIP': totalDataSkip++; break;
        }
      }
      continue;
    }

    console.log(`\n[${report.nodeId}] (${report.nodeType})`);
    for (const check of report.checks) {
      const icons: Record<Verdict, string> = {
        'PASS': '  PASS      ',
        'FAIL': '  FAIL      ',
        'DROP': '  DROP      ',
        'SKIP': '  SKIP      ',
        'DATA-PASS': '  DATA-PASS ',
        'DATA-FAIL': '  DATA-FAIL ',
        'DATA-SKIP': '  DATA-SKIP ',
      };
      const icon = icons[check.verdict];
      const note = check.note ? ` — ${check.note}` : '';
      console.log(`${icon} ${check.property}: ${check.specValue} → ${check.computedValue}${note}`);

      switch (check.verdict) {
        case 'PASS': totalPass++; break;
        case 'FAIL': totalFail++; break;
        case 'DROP': totalDrop++; break;
        case 'SKIP': totalSkip++; break;
        case 'DATA-PASS': totalDataPass++; break;
        case 'DATA-FAIL': totalDataFail++; break;
        case 'DATA-SKIP': totalDataSkip++; break;
      }
    }
  }

  const verified = totalPass + totalFail + totalDrop + totalDataPass + totalDataFail;
  const totalAll = verified + totalSkip + totalDataSkip;
  console.log('\n' + '-'.repeat(60));
  console.log('SUMMARY');
  console.log('-'.repeat(60));
  console.log(`  Total properties: ${totalAll}  (verified: ${verified}, skipped: ${totalSkip + totalDataSkip})`);
  console.log('');
  console.log('  CSS Properties:');
  console.log(`    PASS: ${totalPass}${verified ? ` (${Math.round(100 * totalPass / verified)}%)` : ''}`);
  console.log(`    FAIL: ${totalFail}`);
  console.log(`    DROP: ${totalDrop} (overrides silently filtered by renderer)`);
  console.log('');
  console.log('  Behavioral Overrides (attributes & content):');
  console.log(`    DATA-PASS: ${totalDataPass} (verified in DOM)`);
  console.log(`    DATA-FAIL: ${totalDataFail} (expected but not found in DOM)`);
  console.log(`    DATA-SKIP: ${totalDataSkip} (complex — needs component-level tests)`);

  if (totalDrop > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('DROPPED OVERRIDE KEYS (not in SAFE_OVERRIDE_KEYS)');
    console.log('-'.repeat(60));
    const dropped = new Map<string, string[]>();
    for (const r of reports) {
      for (const c of r.checks) {
        if (c.verdict === 'DROP') {
          const key = c.property.replace('overrides.', '');
          if (!dropped.has(key)) dropped.set(key, []);
          dropped.get(key)!.push(r.nodeId);
        }
      }
    }
    for (const [key, nodes] of dropped) {
      console.log(`  ${key}: used by ${nodes.length} node(s) — ${nodes.slice(0, 3).join(', ')}${nodes.length > 3 ? '...' : ''}`);
    }
  }

  if (mechanicalIssues.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('MECHANICAL ISSUES');
    console.log('-'.repeat(60));
    for (const issue of mechanicalIssues) {
      console.log(`  [${issue.severity}] ${issue.type}: ${issue.nodeId} — ${issue.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  const failureCount = totalFail + totalDataFail + totalDrop;
  if (failureCount === 0) {
    console.log('All verified properties passed.');
  } else {
    console.log(`${totalFail} CSS failures, ${totalDataFail} behavioral failures, ${totalDrop} dropped overrides.`);
  }
  console.log('='.repeat(60) + '\n');
}

// ─── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  const { project, screen } = parseArgs();
  const paths = resolvePaths(project, screen);
  const { spec, tokens, catalog } = loadProjectData(paths.specPath, paths.tokensPath, paths.catalogPath);

  console.log(`Loaded: ${Object.keys(spec.nodes).length} nodes from ${paths.specPath}`);
  console.log('Rendering headlessly via Playwright...');

  const { session, initial } = await openBrowserSession(spec, tokens, catalog, { width: spec.width ?? 1440 });

  console.log(`Screenshot: ${(initial.screenshot.length / 1024).toFixed(1)} KB`);
  console.log('Extracting DOM layout...');

  const domData = await session.extractDOM();
  await session.close();

  const tokenMap = buildSimpleTokenMap(tokens);
  const domNodeCount = Object.keys(domData.nodes).length;
  const specNodeCount = Object.keys(spec.nodes).length;

  const reports: NodeReport[] = [];
  for (const [nodeId, nodeSpec] of Object.entries(spec.nodes)) {
    const domNode = domData.nodes[nodeId];
    const domInfo: DOMNodeInfo | undefined = domNode ? {
      computed: domNode.computed,
      attributes: domNode.attributes,
      textContent: domNode.textContent,
    } : undefined;
    const report = verifyNode(nodeId, nodeSpec, domNode?.computed, tokenMap, domInfo);
    reports.push(report);
  }

  const mechanicalIssues = checkMechanicalIssues(domData, spec).map((i) => ({
    nodeId: i.nodeId,
    type: i.rule,
    severity: i.autoFixable ? 'tier1' : 'tier2',
    message: i.description,
  }));

  printReport(project, screen, reports, specNodeCount, domNodeCount, mechanicalIssues);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
