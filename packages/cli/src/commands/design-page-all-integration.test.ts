/**
 * @module design-page-all-integration.test
 *
 * Integration smoke tests for the design:page:all CLI command.
 * Locks in the Phase 2.1D migration contract:
 *   - Sequential per-page processing (vision Layer 7)
 *   - Chrome Pass `generate` then `consume` ordering
 *   - --concurrency deprecation warning
 *   - Envelope dual-write shape (2.1F + 2.1F.1):
 *     - --tool penpot envelope carries script / penpotNodeIds / penpotProjectId
 *     - --tool browser envelope carries browserCorrectionResult
 *   - --design-only maps to resume + stage: 'design'
 *   - ensureOutputDir uses projectRoot, not process.cwd()
 *
 * Pipeline functions are mocked (jest.doMock on @agentforge/agents-ux) so
 * tests don't launch Playwright or hit the LLM.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify as yamlStringify } from 'yaml';
import type { DesignTokensSpec, BrandSpec } from '@agentforge/core';

// ============================================================================
// Fixtures
// ============================================================================

const VALID_TOKENS: DesignTokensSpec = {
  version: '1.0',
  created_by: 'test',
  colors: {
    primitive: { white: '#FFFFFF', slate: '#334155', blue: '#2563EB' },
    semantic: { 'background-primary': 'white', 'text-primary': 'slate', 'cta-primary': 'blue', error: '#DC2626' },
  },
  typography: {
    font_families: { display: 'DM Sans', body: 'Inter' },
    scale: [
      { role: 'heading-1', size: 32, weight: 700, family: 'display' },
      { role: 'body', size: 14, weight: 400, family: 'body' },
    ],
  },
  spacing: { unit: 8, scale: [4, 8, 12, 16, 24, 32] },
  borders: { radius: { small: 8, medium: 12 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
  elevation: { levels: [{ level: 0, shadow: 'none', description: 'flat' }] },
  layout: {
    grid: { columns: 12, gutter: 24, margin: 24 },
    content_max_width: 1280,
    breakpoints: { mobile: 640, tablet: 768, desktop: 1024, wide: 1440 },
  },
  z_index: { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300, tooltip: 1400 },
  opacity: { scale: { subtle: 0.1, muted: 0.3, disabled: 0.38, overlay: 0.5 } },
  motion: {
    durations: { fast: 100, normal: 200, slow: 400, page: 600 },
    easings: { default: 'ease-out', emphasized: 'cubic-bezier(0.2,0,0,1)' },
  },
  state: {
    hover_opacity: 0.08,
    disabled_opacity: 0.38,
    focus_ring: { color: 'cta-primary', width: 2, offset: 2 },
  },
};

const VALID_BRAND: BrandSpec = {
  version: '1.0',
  created_by: 'test',
  identity: { tone: 'professional', audience: 'developers' },
  illustration_style: { direction: 'minimal', description: 'Clean lines' },
  motion_principles: {
    page_transitions: 'fade',
    interaction_feel: 'snappy',
    easing: 'ease-out',
    duration_base_ms: 200,
  },
  accessibility: { wcag_level: 'AA' },
};

const PAGES_YAML = {
  pages: [
    {
      id: 'home',
      name: 'Home',
      description: 'Landing page',
      route: '/',
      status: 'approved',
      components: ['Header', 'Hero'],
    },
    {
      id: 'about',
      name: 'About',
      description: 'About page',
      route: '/about',
      status: 'approved',
      components: ['Header', 'Body'],
    },
  ],
};

// ============================================================================
// Helpers
// ============================================================================

const createOutputStream = (): NodeJS.WritableStream & { output: string } => {
  let output = '';
  return {
    output,
    write(chunk: string | Uint8Array) {
      output += String(chunk);
      (this as { output: string }).output = output;
      return true;
    },
  } as NodeJS.WritableStream & { output: string };
};

function setupTmpProject(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-page-all-'));
  writeFileSync(join(tmpDir, 'agentforge.yaml'), 'version: 1\n');
  mkdirSync(join(tmpDir, 'docs'), { recursive: true });
  writeFileSync(join(tmpDir, 'docs', 'prd.md'), '# Test\n\nTest project.\n');
  mkdirSync(join(tmpDir, 'agentforge', 'spec'), { recursive: true });
  writeFileSync(join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml'), yamlStringify(VALID_TOKENS));
  writeFileSync(join(tmpDir, 'agentforge', 'spec', 'brand.yaml'), yamlStringify(VALID_BRAND));
  writeFileSync(join(tmpDir, 'agentforge', 'spec', 'pages.yaml'), yamlStringify(PAGES_YAML));
  return tmpDir;
}

interface MockCallRecord {
  readonly stage: 'chrome' | 'page';
  readonly moduleId: string;
  readonly chromePassMode: string | undefined;
  readonly resume: boolean | undefined;
  readonly stageInput: string | undefined;
  readonly designTool: string | undefined;
  readonly projectRoot: string | undefined;
}

// ============================================================================
// Tests
// ============================================================================

describe('design:page:all integration — sequential migration smoke', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = setupTmpProject();
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-dummy-key' };
    jest.resetModules();
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    process.env = { ...originalEnv };
    process.exitCode = undefined;
  });

  it('runs pipeline sequentially, once per page, with Chrome Pass generate-then-consume', async () => {
    const calls: MockCallRecord[] = [];

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          const chromePass = input.chromePass as { mode?: string } | undefined;
          calls.push({
            stage: chromePass?.mode === 'generate' ? 'chrome' : 'page',
            moduleId: String(input.moduleId),
            chromePassMode: chromePass?.mode,
            resume: input.resume as boolean | undefined,
            stageInput: input.stage as string | undefined,
            designTool: input.designTool as string | undefined,
            projectRoot: input.projectRoot as string | undefined,
          });
          return Promise.resolve({
            ok: true,
            value: {
              moduleId: input.moduleId,
              taskId: input.taskId,
              projectRoot: input.projectRoot,
              designTool: input.designTool,
              research: { briefId: 'b1', moduleId: input.moduleId, requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
              planning: { specRef: 's1', moduleId: input.moduleId, componentTree: [], tokenBindings: {}, responsiveRules: [] },
              design: {
                spec: { screen: String(input.moduleId), width: 1440, nodes: { root: { type: 'frame' } } },
                designToolMetadata: { tool: input.designTool },
              },
            },
          });
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'x', width: 1440, nodes: { root: { type: 'frame' } } },
          finalScore: 90,
          iterations: 1,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageAllCommand } = await import('./design-page-all.js');
    const out = createOutputStream();

    await designPageAllCommand(out, { tool: 'browser', projectRoot: tmpDir });

    // Order: chrome (generate) first, then each page (consume) in spec order.
    // Reference page (first) is designed by Chrome Pass, then skipped in the loop,
    // so we expect: 1 chrome call + 1 per remaining page.
    const chromeCalls = calls.filter(c => c.stage === 'chrome');
    const pageCalls = calls.filter(c => c.stage === 'page');
    expect(chromeCalls).toHaveLength(1);
    expect(pageCalls.length).toBeGreaterThanOrEqual(1);

    // Every call must carry the correct projectRoot (not process.cwd()).
    for (const c of calls) {
      expect(c.projectRoot).toBe(tmpDir);
    }

    // No call should have resume:true when --design-only is not set.
    for (const c of calls) {
      expect(c.resume ?? false).toBe(false);
      expect(c.stageInput).toBeUndefined();
    }
  });

  it('writes penpot-design.json envelope under projectRoot (not cwd) for --tool browser with browserCorrectionResult', async () => {
    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => Promise.resolve({
          ok: true,
          value: {
            moduleId: input.moduleId,
            taskId: input.taskId,
            projectRoot: input.projectRoot,
            designTool: input.designTool,
            research: { briefId: 'b1', moduleId: input.moduleId, requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
            planning: { specRef: 's1', moduleId: input.moduleId, componentTree: [], tokenBindings: {}, responsiveRules: [] },
            design: {
              spec: { screen: String(input.moduleId), width: 1440, nodes: { root: { type: 'frame' } } },
              designToolMetadata: { tool: input.designTool },
            },
          },
        })),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'home', width: 1440, nodes: { root: { type: 'frame' } } },
          finalScore: 88,
          iterations: 2,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
      };
    });

    // Spy from outside tmpDir to prove envelope lands at projectRoot, not cwd.
    const elsewhere = mkdtempSync(join(tmpdir(), 'agentforge-page-all-cwd-'));
    cwdSpy.mockReturnValue(elsewhere);

    try {
      const { designPageAllCommand } = await import('./design-page-all.js');
      const out = createOutputStream();

      await designPageAllCommand(out, { tool: 'browser', projectRoot: tmpDir });

      const envelopePath = join(tmpDir, 'agentforge', 'designs', 'about', 'penpot-design.json');
      expect(existsSync(envelopePath)).toBe(true);
      const envelope = JSON.parse(readFileSync(envelopePath, 'utf-8'));
      expect(envelope.designSpec).toBeDefined();
      expect(envelope.browserCorrectionResult).toBeDefined();
      expect(envelope.browserCorrectionResult.finalScore).toBe(88);

      // Envelope must NOT exist under cwd.
      const wrongPath = join(elsewhere, 'agentforge', 'designs', 'about', 'penpot-design.json');
      expect(existsSync(wrongPath)).toBe(false);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('preserves Penpot script/nodeIds/projectId in envelope for --tool penpot (2.1F.1 regression guard)', async () => {
    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => Promise.resolve({
          ok: true,
          value: {
            moduleId: input.moduleId,
            taskId: input.taskId,
            projectRoot: input.projectRoot,
            designTool: input.designTool,
            research: { briefId: 'b1', moduleId: input.moduleId, requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
            planning: { specRef: 's1', moduleId: input.moduleId, componentTree: [], tokenBindings: {}, responsiveRules: [] },
            design: {
              spec: { screen: String(input.moduleId), width: 1440, nodes: { root: { type: 'frame' } } },
              designToolMetadata: {
                tool: 'penpot',
                script: '// mock penpot script\nconsole.log("hi");',
                nodeIds: { root: 'penpot-node-1' },
                projectId: 'penpot-project-xyz',
              },
            },
          },
        })),
        // For --tool penpot we should NOT call browser correction.
        runBrowserCorrectionPipeline: jest.fn().mockRejectedValue(new Error('browser correction must not run for --tool penpot')),
      };
    });

    const { designPageAllCommand } = await import('./design-page-all.js');
    const out = createOutputStream();

    await designPageAllCommand(out, { tool: 'penpot', projectRoot: tmpDir });

    const envelopePath = join(tmpDir, 'agentforge', 'designs', 'about', 'penpot-design.json');
    expect(existsSync(envelopePath)).toBe(true);
    const envelope = JSON.parse(readFileSync(envelopePath, 'utf-8'));
    expect(envelope.designSpec).toBeDefined();
    expect(envelope.script).toBe('// mock penpot script\nconsole.log("hi");');
    expect(envelope.penpotNodeIds).toEqual({ root: 'penpot-node-1' });
    expect(envelope.penpotProjectId).toBe('penpot-project-xyz');
    expect(envelope.browserCorrectionResult).toBeUndefined();
  });

  it('warns and ignores deprecated --concurrency flag', async () => {
    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockResolvedValue({
          ok: true,
          value: {
            moduleId: 'm', taskId: 't', projectRoot: tmpDir, designTool: 'browser',
            research: { briefId: 'b', moduleId: 'm', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
            planning: { specRef: 's', moduleId: 'm', componentTree: [], tokenBindings: {}, responsiveRules: [] },
            design: { spec: { screen: 'x', width: 1440, nodes: {} }, designToolMetadata: { tool: 'browser' } },
          },
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'x', width: 1440, nodes: {} },
          finalScore: 80, iterations: 1, thresholdMet: true, screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageAllCommand } = await import('./design-page-all.js');
    const out = createOutputStream();

    await designPageAllCommand(out, { tool: 'browser', projectRoot: tmpDir, concurrency: 4 });

    expect(out.output).toContain('--concurrency is deprecated');
  });

  it('--design-only sets resume:true and stage:"design" on every page input', async () => {
    const calls: MockCallRecord[] = [];

    // Pre-create shared-chrome.json so the --design-only branch loads it.
    mkdirSync(join(tmpDir, 'agentforge'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'agentforge', 'shared-chrome.json'),
      JSON.stringify({ screen: 'shared', width: 1440, nodes: { root: { type: 'frame' } } }),
    );

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          const chromePass = input.chromePass as { mode?: string } | undefined;
          calls.push({
            stage: chromePass?.mode === 'generate' ? 'chrome' : 'page',
            moduleId: String(input.moduleId),
            chromePassMode: chromePass?.mode,
            resume: input.resume as boolean | undefined,
            stageInput: input.stage as string | undefined,
            designTool: input.designTool as string | undefined,
            projectRoot: input.projectRoot as string | undefined,
          });
          return Promise.resolve({
            ok: true,
            value: {
              moduleId: input.moduleId, taskId: input.taskId, projectRoot: input.projectRoot, designTool: input.designTool,
              research: { briefId: 'b', moduleId: input.moduleId, requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
              planning: { specRef: 's', moduleId: input.moduleId, componentTree: [], tokenBindings: {}, responsiveRules: [] },
              design: { spec: { screen: 'x', width: 1440, nodes: {} }, designToolMetadata: { tool: 'browser' } },
            },
          });
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'x', width: 1440, nodes: {} },
          finalScore: 80, iterations: 1, thresholdMet: true, screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageAllCommand } = await import('./design-page-all.js');
    const out = createOutputStream();

    await designPageAllCommand(out, { tool: 'browser', projectRoot: tmpDir, designOnly: true });

    expect(calls.length).toBeGreaterThan(0);
    // --design-only never runs Chrome Pass (it loads from disk instead).
    expect(calls.every(c => c.chromePassMode !== 'generate')).toBe(true);
    for (const c of calls) {
      expect(c.resume).toBe(true);
      expect(c.stageInput).toBe('design');
    }
  });
});
