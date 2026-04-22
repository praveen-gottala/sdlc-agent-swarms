#!/usr/bin/env tsx
/**
 * CLI wrapper for design render verification.
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
 *
 * Pure verification logic lives in verify-properties.ts (browser-safe).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as yamlParse } from 'yaml';
import { loadCatalogForRenderer } from '../../catalog/loader.js';
import { openBrowserSession } from './screenshot-session.js';
import { checkMechanicalIssues } from './mechanical-fixes.js';
import {
  verifyNode,
  buildSimpleTokenMap,
  type Verdict,
  type NodeReport,
  type DOMNodeInfo,
} from './verify-properties.js';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONOREPO_ROOT = path.resolve(__dirname, '../../../../..');

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

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  main().catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
}
