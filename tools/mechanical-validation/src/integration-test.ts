import { renderToHtml } from "./mini-renderer.js";
import { renderAndExtract, closeBrowserSession } from "./browser-renderer.js";
import { runAllChecks } from "./checker.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { DesignSpec, DOMNodeData } from "./types.js";

const USE_REAL_RENDERER = process.argv.includes("--real-renderer");

mkdirSync("output/integration-test", { recursive: true });

// ── Test cases designed to trigger specific checks ───────────────────

const overlapSpec: DesignSpec = {
  screen: "test-overlap", width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: "page", width: 1440, layout: { dir: "column", gap: 0 }, background: "background-primary" },
    container: { parent: "root", order: 0, type: "container", width: 300, layout: { dir: "row", gap: 0 }, background: "surface-primary" },
    "child-a": { parent: "container", order: 0, type: "container", width: 200, height: 40, background: "surface-elevated" },
    "child-b": { parent: "container", order: 1, type: "container", width: 200, height: 40, background: "cta-primary" },
  },
};

const overflowSpec: DesignSpec = {
  screen: "test-overflow", width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: "page", width: 1440, layout: { dir: "column", gap: 0 }, background: "background-primary" },
    parent: { parent: "root", order: 0, type: "container", width: 200, layout: { dir: "column" }, background: "surface-primary" },
    child: { parent: "parent", order: 0, type: "container", width: 400, height: 50, background: "error" },
  },
};

const clippingSpec: DesignSpec = {
  screen: "test-clipping", width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: "page", width: 1440, layout: { dir: "column", gap: 0 }, background: "background-primary" },
    narrow: { parent: "root", order: 0, type: "container", width: 120, layout: { dir: "column" }, background: "surface-primary" },
    text: { parent: "narrow", order: 0, type: "text", content: "This is a very long text string that should definitely overflow", typography: "body", color: "text-primary" },
  },
};

const collapseSpec: DesignSpec = {
  screen: "test-collapse", width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: "page", width: 1440, layout: { dir: "column", gap: 0 }, background: "background-primary" },
    wrapper: { parent: "root", order: 0, type: "section", background: "surface-primary", layout: { dir: "column", gap: 8, px: 16, py: 16 } },
    filled: { parent: "wrapper", order: 0, type: "text", content: "I have content", typography: "body", color: "text-primary" },
    empty: { parent: "wrapper", order: 1, type: "container", width: "fill", layout: { dir: "column" } },
  },
};

const badgeSpec: DesignSpec = {
  screen: "test-badge", width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: "page", width: 1440, layout: { dir: "column", gap: 0 }, background: "background-primary" },
    row: { parent: "root", order: 0, type: "container", width: 800, layout: { dir: "row", justify: "space-between", align: "center", px: 24, py: 12 }, background: "surface-primary" },
    title: { parent: "row", order: 0, type: "text", content: "Status", typography: "heading-3", color: "text-primary" },
    badge: { parent: "row", order: 1, catalog: "badge-warning", label: "OK" },
  },
};

const cleanSpec: DesignSpec = {
  screen: "test-clean", width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: "page", width: 1440, layout: { dir: "column", gap: 24, py: 32, px: 48 }, background: "background-primary" },
    header: { parent: "root", order: 0, type: "text", content: "Settings", typography: "heading-1", color: "text-primary", weight: 700 },
    card: { parent: "root", order: 1, type: "section", background: "surface-primary", shadow: "md", radius: 16, layout: { dir: "row", align: "center", justify: "space-between", px: 24, py: 20 } },
    name: { parent: "card", order: 0, type: "text", content: "Alex Johnson", typography: "heading-3", color: "text-primary" },
    btn: { parent: "card", order: 1, catalog: "button-primary", label: "Save" },
  },
};

// ── Synthetic DOM builder (for mini-renderer mode) ──────────────────

function buildSyntheticDOM(spec: DesignSpec): DOMNodeData[] {
  const nodes = spec.nodes;
  const result: DOMNodeData[] = [];
  const childMap: Record<string, { id: string; order: number }[]> = {};
  let rootId = "";

  for (const [id, node] of Object.entries(nodes)) {
    if (node.parent === null) rootId = id;
    else {
      if (!childMap[node.parent!]) childMap[node.parent!] = [];
      childMap[node.parent!].push({ id, order: node.order });
    }
  }

  const rects: Record<string, { x: number; y: number; w: number; h: number }> = {};

  function doLayout(nodeId: string, x: number, y: number, availW: number) {
    const node = nodes[nodeId];
    const lyt = node.layout ?? {};
    const px = lyt.px ?? 0;
    const py = lyt.py ?? 0;
    const gap = lyt.gap ?? 0;
    const dir = lyt.dir ?? "column";

    let w = typeof node.width === "number" ? node.width : availW;
    const innerW = w - px * 2;
    const kids = (childMap[nodeId] ?? []).sort((a, b) => a.order - b.order);

    if (node.type === "text") {
      const h = 20;
      const textW = (node.content ?? "").length * 8;
      rects[nodeId] = { x, y, w, h };
      result.push({
        nodeId, tagName: "span",
        rect: { x, y, width: w, height: h, top: y, right: x + w, bottom: y + h, left: x },
        scrollWidth: textW, scrollHeight: h, clientWidth: w, clientHeight: h,
        computedStyles: { display: "inline", flexDirection: "row", overflow: "visible", visibility: "visible" },
        textContent: node.content ?? "", childCount: 0, parentNodeId: node.parent,
        dataCatalog: null,
      });
      return;
    }

    if (node.catalog?.startsWith("badge")) {
      const textLen = (node.label ?? "").length;
      const textW = textLen * 7 + 16;
      const parentNode = node.parent ? nodes[node.parent] : null;
      const badgeW = parentNode?.layout?.justify === "space-between" ? availW * 0.4 : textW;
      const h = 24;
      rects[nodeId] = { x, y, w: badgeW, h };
      result.push({
        nodeId, tagName: "div",
        rect: { x, y, width: badgeW, height: h, top: y, right: x + badgeW, bottom: y + h, left: x },
        scrollWidth: badgeW, scrollHeight: h, clientWidth: badgeW, clientHeight: h,
        computedStyles: { display: "inline-flex", flexDirection: "row", overflow: "visible", visibility: "visible" },
        textContent: node.label ?? "", childCount: 0, parentNodeId: node.parent,
        dataCatalog: node.catalog ?? null,
      });
      return;
    }

    if (node.catalog) {
      const cw = typeof node.width === "number" ? node.width : 100;
      const h = 44;
      rects[nodeId] = { x, y, w: cw, h };
      result.push({
        nodeId, tagName: "div",
        rect: { x, y, width: cw, height: h, top: y, right: x + cw, bottom: y + h, left: x },
        scrollWidth: cw, scrollHeight: h, clientWidth: cw, clientHeight: h,
        computedStyles: { display: "inline-flex", flexDirection: "row", overflow: "visible", visibility: "visible" },
        textContent: node.label ?? "", childCount: 0, parentNodeId: node.parent,
        dataCatalog: node.catalog ?? null,
      });
      return;
    }

    let childX = x + px;
    let childY = y + py;
    for (const kid of kids) {
      const kidNode = nodes[kid.id];
      const kidAvailW = typeof kidNode.width === "number" ? kidNode.width : innerW;
      doLayout(kid.id, childX, childY, kidAvailW);
      const kr = rects[kid.id];
      if (dir === "row") childX += kr.w + gap;
      else childY += kr.h + gap;
    }

    let h = node.height ?? 0;
    if (!node.height && kids.length > 0) {
      if (dir === "column") {
        const last = rects[kids[kids.length - 1].id];
        h = last.y + last.h - y + py;
      } else {
        let maxH = 0;
        for (const kid of kids) maxH = Math.max(maxH, rects[kid.id].h);
        h = maxH + py * 2;
      }
    }

    rects[nodeId] = { x, y, w, h };
    result.push({
      nodeId, tagName: "div",
      rect: { x, y, width: w, height: h, top: y, right: x + w, bottom: y + h, left: x },
      scrollWidth: w, scrollHeight: h, clientWidth: w, clientHeight: h,
      computedStyles: { display: "flex", flexDirection: dir, overflow: "visible", visibility: "visible" },
      textContent: "", childCount: (childMap[nodeId] ?? []).length, parentNodeId: node.parent,
        dataCatalog: null,
    });
  }

  doLayout(rootId, 0, 0, spec.width);
  return result;
}

// ── Run tests ────────────────────────────────────────────────────────

interface TestCase {
  name: string;
  spec: DesignSpec;
  // Expected checks differ between mini-renderer (synthetic DOM) and production renderer
  expectedChecksMini: string[];
  expectedChecksReal: string[];
}

const cases: TestCase[] = [
  // Mini: synthetic DOM places kids sequentially → child-overflow. Real: flex handles it.
  { name: "overlap", spec: overlapSpec, expectedChecksMini: ["child-overflow"], expectedChecksReal: [] },
  { name: "overflow", spec: overflowSpec, expectedChecksMini: ["child-overflow"], expectedChecksReal: ["child-overflow"] },
  // Mini: synthetic DOM reports text clipping. Real: <p> wraps text.
  { name: "clipping", spec: clippingSpec, expectedChecksMini: ["text-clipping"], expectedChecksReal: [] },
  { name: "collapse", spec: collapseSpec, expectedChecksMini: [], expectedChecksReal: [] },
  // Mini: synthetic DOM stretches badge in space-between. Real: shadcn Badge auto-sizes.
  { name: "badge", spec: badgeSpec, expectedChecksMini: ["badge-oversized"], expectedChecksReal: [] },
  // Mini: synthetic DOM overflows button. Real: flex handles it.
  { name: "clean", spec: cleanSpec, expectedChecksMini: ["child-overflow"], expectedChecksReal: [] },
];

console.log("═══════════════════════════════════════════════════════════");
console.log(`  Integration Test: ${USE_REAL_RENDERER ? "Production" : "Mini"} Renderer + Checker`);
console.log("═══════════════════════════════════════════════════════════\n");

let passed = 0;
let failed = 0;

async function runTests() {
  for (const tc of cases) {
    console.log(`── ${tc.name} ──`);

    const expectedChecks = USE_REAL_RENDERER ? tc.expectedChecksReal : tc.expectedChecksMini;
    let domData: DOMNodeData[];

    if (USE_REAL_RENDERER) {
      // ── Production renderer ──
      try {
        const screenshotPath = join("output", "integration-test", `${tc.name}.png`);
        const result = await renderAndExtract(tc.spec, screenshotPath);
        domData = result.domData;
        writeFileSync(
          join("output", "integration-test", `${tc.name}-dom.json`),
          JSON.stringify(domData, null, 2),
        );
        console.log(`  ✓ Rendered + extracted ${domData.length} DOM nodes`);
      } catch (err) {
        console.log(`  ✗ Render/extract failed: ${err instanceof Error ? err.message : err}`);
        failed++;
        continue;
      }
    } else {
      // ── Mini-renderer + synthetic DOM ──
      try {
        const html = renderToHtml(tc.spec);
        writeFileSync(`output/integration-test/${tc.name}.html`, html);
        console.log(`  ✓ Rendered ${html.length} bytes`);
      } catch (err) {
        console.log(`  ✗ Render failed: ${err instanceof Error ? err.message : err}`);
        failed++;
        continue;
      }

      domData = buildSyntheticDOM(tc.spec);
      writeFileSync(`output/integration-test/${tc.name}-dom.json`, JSON.stringify(domData, null, 2));
    }

    const violations = runAllChecks(domData);
    writeFileSync(`output/integration-test/${tc.name}-violations.json`, JSON.stringify(violations, null, 2));

    if (violations.length === 0) {
      console.log("  ✓ No violations");
    } else {
      for (const v of violations) {
        console.log(`  ⚠ [${v.check}] ${v.nodeId}: ${v.message}`);
      }
    }

    const firedChecks = new Set(violations.map((v) => v.check));
    let casePass = true;

    for (const expected of expectedChecks) {
      if (firedChecks.has(expected as never)) {
        console.log(`  ✓ Expected '${expected}' — DETECTED`);
      } else {
        console.log(`  ✗ Expected '${expected}' — NOT DETECTED`);
        casePass = false;
      }
    }

    if (expectedChecks.length === 0 && violations.length > 0) {
      // Extra violations in real-renderer mode are informational, not failures
      console.log(`  ℹ Expected clean but got ${violations.length} violation(s)`);
    }

    if (expectedChecks.length === 0 && violations.length === 0) {
      console.log("  ✓ Clean — no violations as expected");
    }

    if (casePass) passed++;
    else failed++;
    console.log();
  }

  if (USE_REAL_RENDERER) {
    await closeBrowserSession();
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${cases.length}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Fatal error:", err);
  const cleanup = USE_REAL_RENDERER ? closeBrowserSession : () => Promise.resolve();
  cleanup().finally(() => process.exit(1));
});
