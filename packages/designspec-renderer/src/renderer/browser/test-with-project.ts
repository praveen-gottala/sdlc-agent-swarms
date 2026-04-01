#!/usr/bin/env tsx
/**
 * Test harness: renders any AgentForge project screen using the browser renderer.
 *
 * Usage:
 *   npx tsx .../test-with-project.ts <project> <screen> --dev
 *   npx tsx .../test-with-project.ts <project> <screen> --screenshot
 *
 * Paths resolved:
 *   spec:    <project>/.agentforge/previews/<screen>/scripts/designspec-v2.json
 *   tokens:  <project>/agentforge/spec/design-tokens.yaml
 *   catalog: <project>/agentforge/spec/component-catalog.yaml
 *   output:  <project>/.agentforge/previews/<screen>/screenshots/browser/root.png
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as yamlParse } from 'yaml';
import { loadCatalogForRenderer } from '../../catalog/loader.js';
import { screenshotDesignSpec } from './screenshot.js';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONOREPO_ROOT = path.resolve(__dirname, '../../../../..');
const APP_DIR = path.join(__dirname, 'app');
const DATA_DIR = path.join(APP_DIR, 'data');

// ─── Parse CLI args ──────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const project = args.find((a) => !a.startsWith('--'));
  const screen = args.filter((a) => !a.startsWith('--'))[1];
  const mode = args.find((a) => a === '--dev' || a === '--screenshot');

  if (!project || !screen || !mode) {
    console.log(`
Usage:
  npx tsx test-with-project.ts <project> <screen> --dev|--screenshot

Examples:
  npx tsx .../test-with-project.ts personal-expense-tracker dashboard --dev
  npx tsx .../test-with-project.ts personal-expense-tracker dashboard --screenshot
`);
    process.exit(1);
  }

  return { project, screen, mode };
}

// ─── Resolve paths ───────────────────────────────────────

function resolvePaths(project: string, screen: string) {
  const projectRoot = path.join(MONOREPO_ROOT, project);

  if (!existsSync(projectRoot)) {
    console.error(`Project not found: ${projectRoot}`);
    process.exit(1);
  }

  // const specPath = path.join(
  //   projectRoot,
  //   `.agentforge/previews/${screen}/scripts/designspec-v2.json`,
  // );
  const specPath = path.join(
    projectRoot,
    `agentforge/designs/${screen}.json`,
  );
  const tokensPath = path.join(projectRoot, 'agentforge/spec/design-tokens.yaml');
  const catalogPath = path.join(projectRoot, 'agentforge/spec/component-catalog.yaml');
  const screenshotOut = path.join(
    projectRoot,
    `.agentforge/previews/${screen}/screenshots/browser/root.png`,
  );

  for (const [label, p] of [
    ['spec', specPath],
    ['tokens', tokensPath],
    ['catalog', catalogPath],
  ] as const) {
    if (!existsSync(p)) {
      console.error(`${label} file not found: ${p}`);
      process.exit(1);
    }
  }

  return { projectRoot, specPath, tokensPath, catalogPath, screenshotOut };
}

// ─── Load project data ──────────────────────────────────

function loadProjectData(specPath: string, tokensPath: string, catalogPath: string) {
  console.log('Loading project data...');
  console.log(`  spec:    ${specPath}`);
  console.log(`  tokens:  ${tokensPath}`);
  console.log(`  catalog: ${catalogPath}`);

  const spec: DesignSpecV2 = JSON.parse(readFileSync(specPath, 'utf-8'));

  const rawTokens = yamlParse(readFileSync(tokensPath, 'utf-8'));
  const { version: _v, created_by: _cb, ...tokens } = rawTokens;

  const rawCatalog = yamlParse(readFileSync(catalogPath, 'utf-8'));
  const catalog = loadCatalogForRenderer(rawCatalog, tokens as RendererTokens);

  console.log(
    `  Loaded: ${Object.keys(spec.nodes).length} nodes, ` +
    `${Object.keys(tokens).length} token groups, ` +
    `${Object.keys(catalog).length} catalog entries`,
  );

  return { spec, tokens: tokens as RendererTokens, catalog };
}

// ─── Write data files for the Vite app ───────────────────

function writeDataFiles(
  spec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: ReturnType<typeof loadCatalogForRenderer>,
) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path.join(DATA_DIR, 'spec.json'), JSON.stringify(spec, null, 2));
  writeFileSync(path.join(DATA_DIR, 'tokens.json'), JSON.stringify(tokens, null, 2));
  writeFileSync(path.join(DATA_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2));
  console.log(`\nData files written to ${DATA_DIR}`);
}

// ─── Mode A: Interactive dev server ──────────────────────

function runDev(specPath: string, tokensPath: string, catalogPath: string) {
  const { spec, tokens, catalog } = loadProjectData(specPath, tokensPath, catalogPath);
  writeDataFiles(spec, tokens, catalog);

  console.log('\nStarting Vite dev server...');
  console.log('Press Ctrl+C to stop.\n');

  const vite = spawn('npx', ['vite', 'dev', '--host'], {
    cwd: APP_DIR,
    stdio: 'inherit',
    shell: true,
  });

  vite.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => vite.kill('SIGINT'));
}

// ─── Mode B: Headless screenshot ─────────────────────────

async function runScreenshot(
  specPath: string,
  tokensPath: string,
  catalogPath: string,
  outputPath: string,
) {
  const { spec, tokens, catalog } = loadProjectData(specPath, tokensPath, catalogPath);

  console.log('\nRendering screenshot (headless Playwright)...');
  const result = await screenshotDesignSpec(spec, tokens, catalog, {
    width: 1440,
    outputPath,
  });

  console.log(`\nScreenshot saved to: ${outputPath}`);
  console.log(`Size: ${(result.screenshot.length / 1024).toFixed(1)} KB`);
  console.log(`HTML length: ${result.html.length} chars`);
}

// ─── CLI ─────────────────────────────────────────────────

const { project, screen, mode } = parseArgs();
const paths = resolvePaths(project, screen);

if (mode === '--dev') {
  runDev(paths.specPath, paths.tokensPath, paths.catalogPath);
} else {
  runScreenshot(paths.specPath, paths.tokensPath, paths.catalogPath, paths.screenshotOut).catch(
    (err) => {
      console.error('Screenshot failed:', err);
      process.exit(1);
    },
  );
}
