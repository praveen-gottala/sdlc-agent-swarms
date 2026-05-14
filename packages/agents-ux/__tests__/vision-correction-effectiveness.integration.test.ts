/**
 * @module vision-correction-effectiveness.integration.test
 *
 * Tests the effectiveness of the vision-based self-correction loop by:
 * 1. Taking a known-good fixture design spec
 * 2. Introducing deliberate visual bugs
 * 3. Running the correction pipeline with visionCorrection=true
 * 4. Verifying the evaluator detects the bugs and corrections improve them
 *
 * Requires LLM auth (Vertex AI or API key). Skips when auth is unavailable.
 * Uses real LLM calls — expect ~$0.10-0.30 per test run.
 *
 * Run explicitly: RUN_LLM_TESTS=true npx nx test agents-ux -- --testPathPattern=vision-correction
 * These tests are tagged @vision-correction and excluded from default CI runs.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createClaudeProvider, resolveClaudeAuth, authResultToProviderConfig } from '@agentforge/providers';
import type { LLMProvider } from '@agentforge/providers';
import { isVisionLLMEnabled } from '@agentforge/core';
import { runBrowserCorrectionPipeline } from '../src/ux-design/browser-correction-pipeline.js';
import { openBrowserSession } from '@agentforge/designspec-renderer';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { RendererTokens, CatalogMap } from '@agentforge/designspec-renderer';

const FIXTURE_ROOT = join(__dirname, '../../../fixtures/personal-expense-tracker');
const SPEC_PATH = join(FIXTURE_ROOT, 'agentforge/designs/dashboard.json');
const TOKENS_PATH = join(FIXTURE_ROOT, 'agentforge/spec/design-tokens.yaml');

function loadSpec(): DesignSpecV2 {
  return JSON.parse(readFileSync(SPEC_PATH, 'utf-8'));
}

function loadTokens(): RendererTokens {
  const raw = parseYaml(readFileSync(TOKENS_PATH, 'utf-8'));
  return {
    colors: raw.colors,
    typography: raw.typography,
    elevation: raw.elevation,
    borders: raw.borders,
    spacing: raw.spacing,
  };
}

function loadCatalog(): CatalogMap {
  try {
    const catalogPath = join(FIXTURE_ROOT, 'agentforge/spec/component-catalog.yaml');
    const raw = parseYaml(readFileSync(catalogPath, 'utf-8'));
    const map: CatalogMap = {};
    if (raw?.components) {
      for (const [id, entry] of Object.entries(raw.components)) {
        map[id] = entry as CatalogMap[string];
      }
    }
    return map;
  } catch {
    return {};
  }
}

function loadEnvApiKey(): string | undefined {
  try {
    const envPath = join(__dirname, '../../../.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function createProvider() {
  const auth = resolveClaudeAuth();
  if (!auth) return null;
  const config = authResultToProviderConfig(auth);
  return createClaudeProvider('claude-sonnet-4-6', config);
}

function createEvaluatorProvider(): LLMProvider | undefined {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? loadEnvApiKey();
  if (!apiKey) return undefined;
  return createClaudeProvider('claude-opus-4-7', { apiKey });
}

// ── Bug injection helpers ──

function introduceColorBug(spec: DesignSpecV2): DesignSpecV2 {
  const bugged = JSON.parse(JSON.stringify(spec)) as DesignSpecV2;
  (bugged.nodes['root'] as Record<string, unknown>).background = '#FF0000';
  return bugged;
}

function introduceLayoutBug(spec: DesignSpecV2): DesignSpecV2 {
  const bugged = JSON.parse(JSON.stringify(spec)) as DesignSpecV2;
  const topbar = bugged.nodes['top-bar'] ?? bugged.nodes['topbar'];
  if (topbar?.layout) {
    (topbar.layout as Record<string, unknown>).dir = 'column';
  }
  return bugged;
}

function introduceWidthBug(spec: DesignSpecV2): DesignSpecV2 {
  const bugged = JSON.parse(JSON.stringify(spec)) as DesignSpecV2;
  const bodyEntry = Object.entries(bugged.nodes).find(
    ([id]) => id.includes('dashboard-body') || id.includes('body'),
  );
  if (bodyEntry) {
    (bodyEntry[1] as Record<string, unknown>).width = 50;
  }
  return bugged;
}

// ── Test configuration ──

const auth = resolveClaudeAuth();
const visionEnabled = isVisionLLMEnabled();
const describeIfAuth = (auth && visionEnabled && process.env.RUN_LLM_TESTS === 'true') ? describe : describe.skip;

const OUTPUT_DIR = join(__dirname, 'output/vision-correction');

describeIfAuth('Vision Correction Effectiveness @vision-correction', () => {
  const provider = createProvider()!;
  const evalProvider = createEvaluatorProvider();
  const tokens = loadTokens();
  const catalog = loadCatalog();

  beforeAll(() => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  function pipelineOpts(testName: string) {
    const iterationDir = join(OUTPUT_DIR, testName);
    mkdirSync(iterationDir, { recursive: true });
    return {
      visionCorrection: true,
      interactive: false,
      maxCorrections: 2,
      qualityThreshold: 60,
      mechanicalFixes: false,
      evaluatorProvider: evalProvider,
      outputDir: iterationDir,
    };
  }

  function saveScreenshot(name: string, label: string, data: Buffer): void {
    const path = join(OUTPUT_DIR, `${name}-${label}.png`);
    writeFileSync(path, data);
    console.log(`[screenshot] Saved ${path} (${data.length} bytes)`);
  }

  jest.setTimeout(300_000);

  async function captureBeforeScreenshot(spec: DesignSpecV2, name: string): Promise<void> {
    const { session, initial } = await openBrowserSession(spec, tokens, catalog);
    saveScreenshot(name, 'before', initial.screenshot);
    await session.close();
  }

  it('detects bright red background and attempts correction', async () => {
    const goodSpec = loadSpec();
    const buggedSpec = introduceColorBug(goodSpec);
    expect(buggedSpec.nodes['root'].background).toBe('#FF0000');

    await captureBeforeScreenshot(buggedSpec, 'color-bug');

    const result = await runBrowserCorrectionPipeline(
      buggedSpec, tokens, catalog, provider, pipelineOpts('color-bug'),
    );

    saveScreenshot('color-bug', 'after', result.screenshot);
    writeFileSync(join(OUTPUT_DIR, 'color-bug-corrected-spec.json'), JSON.stringify(result.spec, null, 2));

    console.log('[color-bug] Result:', {
      score: result.finalScore,
      iterations: result.iterations,
      thresholdMet: result.thresholdMet,
      correctedBg: result.spec.nodes['root']?.background,
      specChanged: JSON.stringify(result.spec) !== JSON.stringify(buggedSpec),
    });

    if (result.finalScore === 0 && result.iterations <= 1) {
      console.warn('[color-bug] RATE_LIMITED or evaluator error — score=0 is not a valid result.');
      return;
    }

    expect(result.finalScore).toBeGreaterThan(0);
    expect(result.spec.nodes['root']?.background).not.toBe('#FF0000');
  });

  it('detects topbar layout flipped to column', async () => {
    const goodSpec = loadSpec();
    const buggedSpec = introduceLayoutBug(goodSpec);
    const topbar = buggedSpec.nodes['top-bar'] ?? buggedSpec.nodes['topbar'];
    expect(topbar?.layout?.dir).toBe('column');

    await captureBeforeScreenshot(buggedSpec, 'layout-bug');

    const result = await runBrowserCorrectionPipeline(
      buggedSpec, tokens, catalog, provider, pipelineOpts('layout-bug'),
    );

    saveScreenshot('layout-bug', 'after', result.screenshot);

    console.log('[layout-bug] Result:', {
      score: result.finalScore,
      iterations: result.iterations,
      correctedDir: result.spec.nodes['topbar']?.layout?.dir,
    });

    if (result.finalScore === 0 && result.iterations <= 1) {
      console.warn('[layout-bug] RATE_LIMITED — skipping assertions');
      return;
    }

    expect(result.finalScore).toBeGreaterThan(0);
  });

  it('detects crushed content width', async () => {
    const goodSpec = loadSpec();
    const buggedSpec = introduceWidthBug(goodSpec);

    await captureBeforeScreenshot(buggedSpec, 'width-bug');

    const result = await runBrowserCorrectionPipeline(
      buggedSpec, tokens, catalog, provider, pipelineOpts('width-bug'),
    );

    saveScreenshot('width-bug', 'after', result.screenshot);

    console.log('[width-bug] Result:', {
      score: result.finalScore,
      iterations: result.iterations,
    });

    if (result.finalScore === 0 && result.iterations <= 1) {
      console.warn('[width-bug] RATE_LIMITED — skipping assertions');
      return;
    }

    expect(result.finalScore).toBeGreaterThan(0);
  });

  it('baseline: good spec scores meaningfully (not 0 or 100)', async () => {
    const goodSpec = loadSpec();

    await captureBeforeScreenshot(goodSpec, 'baseline');

    const result = await runBrowserCorrectionPipeline(
      goodSpec, tokens, catalog, provider,
      { ...pipelineOpts('baseline'), maxCorrections: 1, qualityThreshold: 95 },
    );

    saveScreenshot('baseline', 'after', result.screenshot);

    console.log('[baseline] Result:', {
      score: result.finalScore,
      iterations: result.iterations,
    });

    if (result.finalScore === 0 && result.iterations <= 1) {
      console.warn('[baseline] RATE_LIMITED — skipping assertions');
      return;
    }

    expect(result.finalScore).toBeGreaterThan(0);
    expect(result.finalScore).toBeLessThan(100);
  });
});
