/**
 * Phase A smoke test — run with: npx tsx packages/designspec-renderer/src/renderer/browser/__tests__/smoke-test.ts
 *
 * Exercises:
 *  1. openBrowserSession() — persistent browser + screenshot
 *  2. session.extractDOM() — DOM layout extraction with data-catalog
 *  3. checkMechanicalIssues() — mechanical layout checks
 *  4. session.close() — cleanup
 */
import { openBrowserSession } from '../screenshot-session.js';
import { checkMechanicalIssues } from '../mechanical-fixes.js';
import { SAMPLE_TOKENS } from '../../../__fixtures__/design-tokens.js';
import { V2_BUILTIN_CATALOG } from '../../../__fixtures__/catalog-entries.js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import type { DesignSpecV2 } from '../../../types/design-spec-v2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('=== Phase A Smoke Test ===\n');

  // ─── Load fixtures ─────────────────────────────────────
  const specPath = join(__dirname, '..', '..', '..', '__fixtures__', 'settings-form.json');
  const spec: DesignSpecV2 = JSON.parse(readFileSync(specPath, 'utf-8'));
  const tokens = SAMPLE_TOKENS;
  const catalog = V2_BUILTIN_CATALOG;
  console.log(`Spec: "${spec.screen}", ${Object.keys(spec.nodes).length} nodes, width=${spec.width}`);
  console.log(`Tokens: ${Object.keys(tokens.colors.semantic).length} semantic colors`);
  console.log(`Catalog: ${Object.keys(catalog).length} entries\n`);

  // ─── Step 1: openBrowserSession ────────────────────────
  console.log('--- Step 1: openBrowserSession() ---');
  const t0 = Date.now();
  const { session, initial } = await openBrowserSession(spec, tokens, catalog);
  const sessionMs = Date.now() - t0;

  console.log(`  Session opened in ${sessionMs}ms`);
  console.log(`  Screenshot: ${initial.screenshot.length} bytes (PNG)`);
  console.log(`  PNG magic: ${initial.screenshot[0] === 0x89 && initial.screenshot[1] === 0x50 ? 'VALID' : 'INVALID'}`);
  console.log(`  HTML length: ${initial.html.length} chars`);

  // Save screenshot for visual inspection
  const screenshotPath = join(tmpdir(), 'smoke-test-screenshot.png');
  writeFileSync(screenshotPath, initial.screenshot);
  console.log(`  Screenshot saved: ${screenshotPath}\n`);

  // ─── Step 2: extractDOM ────────────────────────────────
  console.log('--- Step 2: session.extractDOM() ---');
  const t1 = Date.now();
  const dom = await session.extractDOM();
  const domMs = Date.now() - t1;

  const domNodeIds = Object.keys(dom.nodes);
  const specNodeIds = Object.keys(spec.nodes);
  console.log(`  Extracted ${domNodeIds.length} DOM nodes in ${domMs}ms`);
  console.log(`  Viewport: ${dom.viewportWidth}x${dom.viewportHeight}`);

  // Verify all spec nodeIds appear in DOM
  const missing: string[] = [];
  for (const id of specNodeIds) {
    if (!dom.nodes[id]) missing.push(id);
  }
  if (missing.length === 0) {
    console.log(`  ✓ All ${specNodeIds.length} spec nodeIds found in DOM`);
  } else {
    console.log(`  ✗ Missing nodeIds: ${missing.join(', ')}`);
  }

  // Check data-catalog on catalog components
  const catalogNodes = Object.values(dom.nodes).filter(n => n.dataCatalog !== null);
  console.log(`  Catalog-annotated nodes: ${catalogNodes.length}`);
  for (const n of catalogNodes) {
    console.log(`    ${n.nodeId}: data-catalog="${n.dataCatalog}"`);
  }

  // Verify specific catalog attributes from the settings-form fixture
  // Find nodes that use catalog entries in the spec
  const catalogSpecNodes = Object.entries(spec.nodes).filter(([_, node]) => node.catalog);
  for (const [id, node] of catalogSpecNodes) {
    const domNode = dom.nodes[id];
    if (domNode) {
      const expected = node.catalog;
      const actual = domNode.dataCatalog;
      const match = actual === expected;
      console.log(`  ${match ? '✓' : '✗'} Node "${id}": expected catalog="${expected}", got="${actual}"`);
    }
  }

  // Verify all rects have positive dimensions
  let zeroCount = 0;
  for (const n of Object.values(dom.nodes)) {
    if (n.rect.width <= 0 || n.rect.height <= 0) {
      zeroCount++;
      console.log(`  ✗ Node "${n.nodeId}" has zero/negative rect: ${n.rect.width}x${n.rect.height}`);
    }
  }
  if (zeroCount === 0) {
    console.log(`  ✓ All ${domNodeIds.length} nodes have positive dimensions`);
  }

  // Parent-child consistency
  let parentChildErrors = 0;
  for (const n of Object.values(dom.nodes)) {
    for (const childId of n.childNodeIds) {
      const child = dom.nodes[childId];
      if (child && child.parentNodeId !== n.nodeId) {
        parentChildErrors++;
        console.log(`  ✗ Parent-child mismatch: ${n.nodeId} claims child ${childId}, but child.parent=${child.parentNodeId}`);
      }
    }
  }
  if (parentChildErrors === 0) {
    console.log(`  ✓ Parent-child relationships consistent`);
  }
  console.log();

  // ─── Step 3: checkMechanicalIssues ─────────────────────
  console.log('--- Step 3: checkMechanicalIssues() ---');
  const issues = checkMechanicalIssues(dom, spec);
  console.log(`  Found ${issues.length} issue(s)`);

  const tier1 = issues.filter(i => i.autoFixable);
  const tier2 = issues.filter(i => !i.autoFixable);
  console.log(`  Tier 1 (auto-fixable): ${tier1.length}`);
  console.log(`  Tier 2 (report-only):  ${tier2.length}`);

  for (const issue of issues) {
    const tier = issue.autoFixable ? 'T1' : 'T2';
    console.log(`  [${tier}] ${issue.rule}: ${issue.description}`);
  }
  console.log();

  // ─── Step 4: close ─────────────────────────────────────
  console.log('--- Step 4: session.close() ---');
  await session.close();
  console.log('  Session closed.\n');

  console.log('=== Smoke Test Complete ===');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
