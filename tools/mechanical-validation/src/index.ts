import { writeFile, mkdir } from "fs/promises";
import { resolve, join } from "path";
import { PROMPTS } from "./prompts.js";
import { generateTestCase } from "./generator.js";
import { renderToHtml } from "./mini-renderer.js";
import { launchBrowser, closeBrowser, extractDOM } from "./dom-extractor.js";
import { renderAndExtract, closeBrowserSession } from "./browser-renderer.js";
import { runAllChecks } from "./checker.js";
import type {
  TestCaseResult,
  RunSummary,
  CheckCategory,
  PromptCategory,
} from "./types.js";

// ── CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const DRY_RUN = args.includes("--dry-run");
const USE_REAL_RENDERER = args.includes("--real-renderer");
const categoryArg = args.find((a) => a.startsWith("--category="));
const CATEGORY_FILTER: PromptCategory | null = categoryArg
  ? (categoryArg.split("=")[1] as PromptCategory)
  : null;
const countArg = args.find((a) => a.startsWith("--runs="));
const RUNS_PER_CATEGORY = countArg ? parseInt(countArg.split("=")[1], 10) : 3;

// ── Output directory ──────────────────────────────────────────────────

const RUN_ID = `run-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
const OUTPUT_DIR = resolve(process.cwd(), "output", RUN_ID);

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  AgentForge Mechanical Validation Harness");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Run ID:     ${RUN_ID}`);
  console.log(`  Mode:       ${DRY_RUN ? "DRY RUN (no LLM calls, no rendering)" : "FULL"}`);
  console.log(`  Renderer:   ${USE_REAL_RENDERER ? "production (openBrowserSession + Vite+React+shadcn)" : "mini-renderer (fast CSS flexbox approximation)"}`);
  console.log(`  Category:   ${CATEGORY_FILTER ?? "ALL"}`);
  console.log(`  Runs/cat:   ${RUNS_PER_CATEGORY}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // Filter prompts by category if specified
  let prompts = PROMPTS;
  if (CATEGORY_FILTER) {
    prompts = prompts.filter((p) => p.category === CATEGORY_FILTER);
    if (prompts.length === 0) {
      console.error(`No prompts for category '${CATEGORY_FILTER}'`);
      console.error(`Valid categories: sibling-overlap, child-overflow, text-clipping, badge-oversized, zero-collapse`);
      process.exit(1);
    }
  }

  // Limit to RUNS_PER_CATEGORY per category
  const byCategory = new Map<string, typeof prompts>();
  for (const p of prompts) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push(p);
  }
  const selectedPrompts: typeof prompts = [];
  for (const [, catPrompts] of byCategory) {
    selectedPrompts.push(...catPrompts.slice(0, RUNS_PER_CATEGORY));
  }

  console.log(`Selected ${selectedPrompts.length} test cases across ${byCategory.size} categories\n`);

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  const results: TestCaseResult[] = [];

  // Launch mini-renderer's Playwright browser if needed
  if (!DRY_RUN && !USE_REAL_RENDERER) {
    await launchBrowser();
  }

  try {
    for (let i = 0; i < selectedPrompts.length; i++) {
      const prompt = selectedPrompts[i];
      const caseDir = join(OUTPUT_DIR, prompt.id);
      await mkdir(caseDir, { recursive: true });

      const caseNum = `[${i + 1}/${selectedPrompts.length}]`;
      console.log(`${caseNum} ${prompt.id} (${prompt.category})`);
      console.log(`     Bias: ${prompt.bias}`);

      if (DRY_RUN) {
        console.log("     → SKIPPED (dry run)\n");
        results.push({
          id: prompt.id,
          category: prompt.category,
          bias: prompt.bias,
          generated: false,
          valid: false,
          nodeCount: 0,
          renderSuccess: false,
          violations: [],
          screenshotPath: null,
          inputPath: join(caseDir, "input.json"),
          domDataPath: null,
        });
        continue;
      }

      // ── Step 1: Generate ─────────────────────────────────────────
      console.log("     → Generating via LLM...");
      const { spec, raw, error: genError } = await generateTestCase(prompt);

      // Save raw output regardless
      await writeFile(join(caseDir, "raw-output.txt"), raw || "(empty)");

      if (!spec) {
        console.log(`     ✗ Generation failed: ${genError}`);
        results.push({
          id: prompt.id,
          category: prompt.category,
          bias: prompt.bias,
          generated: false,
          valid: false,
          nodeCount: 0,
          renderSuccess: false,
          violations: [],
          screenshotPath: null,
          inputPath: join(caseDir, "input.json"),
          domDataPath: null,
          error: genError,
        });
        console.log();
        continue;
      }

      const nodeCount = Object.keys(spec.nodes).length;
      console.log(`     ✓ Generated ${nodeCount} nodes`);

      // Save validated input
      const inputPath = join(caseDir, "input.json");
      await writeFile(inputPath, JSON.stringify(spec, null, 2));

      // ── Step 2: Render + DOM extraction ────────────────────────
      const screenshotPath = join(caseDir, "screenshot.png");
      let domData;

      if (USE_REAL_RENDERER) {
        // ── Production renderer path ──
        console.log("     → Rendering with production renderer...");
        try {
          const result = await renderAndExtract(spec, screenshotPath);
          domData = result.domData;
          // Save HTML
          await writeFile(join(caseDir, "rendered.html"), result.html);
        } catch (renderErr) {
          const msg = renderErr instanceof Error ? renderErr.message : String(renderErr);
          console.log(`     ✗ Production render failed: ${msg}`);
          results.push({
            id: prompt.id,
            category: prompt.category,
            bias: prompt.bias,
            generated: true,
            valid: true,
            nodeCount,
            renderSuccess: false,
            violations: [],
            screenshotPath: null,
            inputPath,
            domDataPath: null,
            error: `Render: ${msg}`,
          });
          console.log();
          continue;
        }
      } else {
        // ── Mini-renderer path (default) ──
        console.log("     → Rendering to HTML...");
        let html: string;
        try {
          html = renderToHtml(spec);
        } catch (renderErr) {
          const msg = renderErr instanceof Error ? renderErr.message : String(renderErr);
          console.log(`     ✗ Render failed: ${msg}`);
          results.push({
            id: prompt.id,
            category: prompt.category,
            bias: prompt.bias,
            generated: true,
            valid: true,
            nodeCount,
            renderSuccess: false,
            violations: [],
            screenshotPath: null,
            inputPath,
            domDataPath: null,
            error: `Render: ${msg}`,
          });
          console.log();
          continue;
        }

        const htmlPath = join(caseDir, "rendered.html");
        await writeFile(htmlPath, html);

        // ── DOM extraction via Playwright ──
        console.log("     → Extracting DOM...");
        try {
          const extraction = await extractDOM(htmlPath, screenshotPath, spec.width);
          domData = extraction.domData;
        } catch (domErr) {
          const msg = domErr instanceof Error ? domErr.message : String(domErr);
          console.log(`     ✗ DOM extraction failed: ${msg}`);
          results.push({
            id: prompt.id,
            category: prompt.category,
            bias: prompt.bias,
            generated: true,
            valid: true,
            nodeCount,
            renderSuccess: false,
            violations: [],
            screenshotPath: null,
            inputPath,
            domDataPath: null,
            error: `DOM extraction: ${msg}`,
          });
          console.log();
          continue;
        }
      }

      const domDataPath = join(caseDir, "dom-data.json");
      await writeFile(domDataPath, JSON.stringify(domData, null, 2));
      console.log(`     ✓ Extracted ${domData.length} DOM nodes`);

      // ── Step 3: Mechanical checks ────────────────────────────────
      console.log("     → Running mechanical checks...");
      const violations = runAllChecks(domData);

      // Save check results
      await writeFile(join(caseDir, "violations.json"), JSON.stringify(violations, null, 2));

      const byCheck: Record<string, number> = {};
      for (const v of violations) {
        byCheck[v.check] = (byCheck[v.check] ?? 0) + 1;
      }

      if (violations.length === 0) {
        console.log("     ✓ No violations detected");
      } else {
        console.log(`     ⚠ ${violations.length} violation(s):`);
        for (const [check, count] of Object.entries(byCheck)) {
          console.log(`       - ${check}: ${count}`);
        }
      }

      results.push({
        id: prompt.id,
        category: prompt.category,
        bias: prompt.bias,
        generated: true,
        valid: true,
        nodeCount,
        renderSuccess: true,
        violations,
        screenshotPath,
        inputPath,
        domDataPath,
      });

      console.log();
    }
  } finally {
    if (!USE_REAL_RENDERER) {
      await closeBrowser();
    } else {
      await closeBrowserSession();
    }
  }

  // ── Summary report ────────────────────────────────────────────────

  const summary = buildSummary(results);
  await writeFile(join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));

  printSummary(summary);
}

// ── Summary builder ───────────────────────────────────────────────────

function buildSummary(results: TestCaseResult[]): RunSummary {
  const violationsByCategory: Record<CheckCategory, number> = {
    "sibling-overlap": 0,
    "child-overflow": 0,
    "zero-collapse": 0,
    "text-clipping": 0,
    "badge-oversized": 0,
  };

  for (const r of results) {
    for (const v of r.violations) {
      violationsByCategory[v.check]++;
    }
  }

  return {
    runId: RUN_ID,
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    generated: results.filter((r) => r.generated).length,
    valid: results.filter((r) => r.valid).length,
    rendered: results.filter((r) => r.renderSuccess).length,
    violationsByCategory,
    cases: results,
  };
}

// ── Summary printer ───────────────────────────────────────────────────

function printSummary(summary: RunSummary) {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Total cases:     ${summary.totalCases}`);
  console.log(`  Generated:       ${summary.generated}`);
  console.log(`  Valid:            ${summary.valid}`);
  console.log(`  Rendered:        ${summary.rendered}`);
  console.log();
  console.log("  Violations by check:");

  const checks: CheckCategory[] = [
    "sibling-overlap",
    "child-overflow",
    "zero-collapse",
    "text-clipping",
    "badge-oversized",
  ];

  for (const check of checks) {
    const count = summary.violationsByCategory[check];
    const bar = count > 0 ? "█".repeat(Math.min(count, 20)) : "—";
    console.log(`    ${check.padEnd(18)} ${String(count).padStart(3)}  ${bar}`);
  }

  console.log();
  console.log("  Detection matrix (did category bias trigger its target check?):");

  // Group results by prompt category
  const byCategory = new Map<string, TestCaseResult[]>();
  for (const r of summary.cases) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  for (const [category, cases] of byCategory) {
    const total = cases.length;
    const withTargetViolation = cases.filter((c) =>
      c.violations.some((v) => v.check === category)
    ).length;
    const withAnyViolation = cases.filter((c) => c.violations.length > 0).length;

    console.log(
      `    ${category.padEnd(18)} target: ${withTargetViolation}/${total}   any: ${withAnyViolation}/${total}`
    );
  }

  console.log();
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log("═══════════════════════════════════════════════════════════\n");
}

// ── Run ───────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("Fatal error:", err);
  const cleanup = USE_REAL_RENDERER ? closeBrowserSession : closeBrowser;
  cleanup().finally(() => process.exit(1));
});
