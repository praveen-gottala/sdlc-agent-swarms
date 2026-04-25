/**
 * @module design-page-integration.test
 *
 * Integration tests for the design:page CLI command.
 * Verifies that real files (PRD, design tokens, brand spec) are loaded
 * from disk and their presence/absence is reported in output.
 *
 * Uses a temp directory with real filesystem — no mocked FS.
 * Does NOT require an LLM API key (uses a dummy key; the command
 * fails at the LLM call, which is expected).
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify as yamlStringify } from 'yaml';
import type { DesignTokensSpec, BrandSpec } from '@agentforge/core';

// ============================================================================
// Fixtures (same values as design-figma-integration.test.ts)
// ============================================================================

const VALID_TOKENS: DesignTokensSpec = {
  version: '1.0',
  created_by: 'test',
  colors: {
    primitive: {
      white: '#FFFFFF',
      slate: '#334155',
      blue: '#2563EB',
    },
    semantic: {
      'background-primary': 'white',
      'text-primary': 'slate',
      'cta-primary': 'blue',
      error: '#DC2626',
    },
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
  elevation: {
    levels: [
      { level: 0, shadow: 'none', description: 'Flat, no elevation' },
      { level: 1, shadow: '0 1px 3px rgba(0,0,0,0.08)', description: 'Cards resting on surface' },
      { level: 2, shadow: '0 4px 12px rgba(0,0,0,0.12)', description: 'Dropdowns, popovers' },
      { level: 3, shadow: '0 8px 24px rgba(0,0,0,0.16)', description: 'Modals, dialogs' },
    ],
  },
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

// ============================================================================
// Tests
// ============================================================================

describe('design:page integration — file loading', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-design-page-'));

    // Create agentforge.yaml so findProjectRoot resolves to tmpDir
    writeFileSync(join(tmpDir, 'agentforge.yaml'), 'version: 1\n');

    // Create docs/prd.md
    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'docs', 'prd.md'),
      '# TicTacToe\n\nA classic tic-tac-toe game with X and O players.\n',
    );

    // Create design tokens
    mkdirSync(join(tmpDir, 'agentforge', 'spec'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml'),
      yamlStringify(VALID_TOKENS),
    );

    // Create brand spec
    writeFileSync(
      join(tmpDir, 'agentforge', 'spec', 'brand.yaml'),
      yamlStringify(VALID_BRAND),
    );
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-dummy-key' };
    jest.resetModules();
    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockResolvedValue({
          ok: true,
          value: {
            moduleId: 'home', taskId: 'task-1', projectRoot: '/tmp', designTool: 'browser',
            research: { briefId: 'b1', moduleId: 'home', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
            planning: { specRef: 's1', moduleId: 'home', componentTree: [], tokenBindings: {}, responsiveRules: [] },
            design: { spec: { screen: 'home', width: 1440, nodes: {} } },
          },
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'home', width: 1440, nodes: {} }, finalScore: 85, iterations: 1, thresholdMet: true, screenshot: Buffer.from(''),
        }),
      };
    });
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    process.env = { ...originalEnv };
    process.exitCode = undefined;
  });

  it('loads PRD and reports in output', async () => {
    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('home', out, { noWait: true, mock: true });

    expect(out.output).toContain('PRD loaded from');
  });

  it('loads design tokens and reports in output', async () => {
    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('home', out, { noWait: true, mock: true });

    expect(out.output).toContain('Design tokens loaded');
  });

  it('loads brand spec and reports in output', async () => {
    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('home', out, { noWait: true, mock: true });

    expect(out.output).toContain('Brand spec loaded');
  });

  it('warns when PRD is missing', async () => {
    const prdPath = join(tmpDir, 'docs', 'prd.md');
    rmSync(prdPath);

    try {
      const { designPageCommand } = await import('./design-page.js');
      const out = createOutputStream();

      await designPageCommand('home', out, { noWait: true, mock: true });

      expect(out.output).toContain('No PRD found');
    } finally {
      // Restore PRD for other tests
      writeFileSync(prdPath, '# TicTacToe\n\nA classic tic-tac-toe game with X and O players.\n');
    }
  });

  it('warns when design system is missing', async () => {
    const tokensPath = join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml');
    const brandPath = join(tmpDir, 'agentforge', 'spec', 'brand.yaml');
    rmSync(tokensPath);
    rmSync(brandPath);

    try {
      const { designPageCommand } = await import('./design-page.js');
      const out = createOutputStream();

      await designPageCommand('home', out, { noWait: true, mock: true });

      expect(out.output).toContain('No design system found');
    } finally {
      // Restore files for other tests
      writeFileSync(tokensPath, yamlStringify(VALID_TOKENS));
      writeFileSync(brandPath, yamlStringify(VALID_BRAND));
    }
  });
});

/**
 * Data-flow test: verifies that design tokens and brand spec loaded from disk
 * actually flow into the Penpot design stage input (not just logged).
 *
 * Mocks the agents-ux pipeline functions to intercept PenpotDesignInput and
 * verify it contains a designSystemPrompt built from the on-disk tokens.
 */
describe('design:page integration — design system context data flow', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-page-dsflow-'));

    writeFileSync(join(tmpDir, 'agentforge.yaml'), 'version: 1\n');
    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs', 'prd.md'), '# App\n\nA test app.\n');
    mkdirSync(join(tmpDir, 'agentforge', 'spec'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml'),
      yamlStringify(VALID_TOKENS),
    );
    writeFileSync(
      join(tmpDir, 'agentforge', 'spec', 'brand.yaml'),
      yamlStringify(VALID_BRAND),
    );
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

  it('passes designTokensSpec and description to runDesignPipeline when tokens exist', async () => {
    let capturedInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedInput = input;
          return Promise.resolve({
            ok: true,
            value: {
              moduleId: 'home-dashboard',
              taskId: 'task-1',
              projectRoot: '/tmp',
              designTool: 'browser',
              research: { briefId: 'brief-1', moduleId: 'home-dashboard', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
              planning: { specRef: 'spec-1', moduleId: 'home-dashboard', componentTree: [], tokenBindings: {}, responsiveRules: [] },
              design: { spec: { screen: 'home', width: 1440, nodes: {} } },
            },
          });
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'home', width: 1440, nodes: {} },
          finalScore: 85,
          iterations: 1,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('home dashboard', out, { noWait: true, mock: true });

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.designTokensSpec).toBeDefined();
    expect(capturedInput!.description).toBe('home dashboard');
  });
});

// ============================================================================
// Stage tests: --stage replay, --stage connect, --implement
// ============================================================================

describe('design:page integration — stage replay', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-page-replay-'));
    writeFileSync(join(tmpDir, 'agentforge.yaml'), 'version: 1\n');
    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs', 'prd.md'), '# App\n');
    mkdirSync(join(tmpDir, 'agentforge', 'spec'), { recursive: true });
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml'), yamlStringify(VALID_TOKENS));
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'brand.yaml'), yamlStringify(VALID_BRAND));
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

  it('--stage replay fails when no cached artifact has script field', async () => {
    const moduleId = 'test-app';
    const previewDir = join(tmpDir, '.agentforge', 'previews', moduleId);
    mkdirSync(previewDir, { recursive: true });

    // Write cached artifacts without script field
    writeFileSync(join(previewDir, 'research-brief.json'), JSON.stringify({ briefId: 'b1', moduleId }));
    writeFileSync(join(previewDir, 'planning-spec.json'), JSON.stringify({
      specRef: 'spec-1', moduleId, componentTree: [], tokenBindings: {},
    }));
    writeFileSync(join(previewDir, 'penpot-design.json'), JSON.stringify({
      penpotProjectId: 'proj-1', penpotPageId: 'page-1',
      penpotNodeIds: { Header: 'n1' }, moduleId, breakpoints: [],
      // No script field
    }));

    // Mock MCP connection
    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runPenpotPreflight: jest.fn().mockResolvedValue({
          ok: false, error: { code: 'MCP_UNAVAILABLE', message: 'mock', recoverable: true },
        }),
        loadPenpotSession: jest.fn().mockReturnValue({
          ok: false, error: { code: 'INVALID_STATE', message: 'no session', recoverable: false },
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('test app', out, { stage: 'replay', module: moduleId, mock: true });

    expect(out.output).toContain('No cached design script');
    expect(process.exitCode).toBe(1);
  });

  it('--stage replay succeeds with cached script', async () => {
    const moduleId = 'replay-ok';
    const previewDir = join(tmpDir, '.agentforge', 'previews', moduleId);
    mkdirSync(previewDir, { recursive: true });

    writeFileSync(join(previewDir, 'research-brief.json'), JSON.stringify({ briefId: 'b1', moduleId }));
    writeFileSync(join(previewDir, 'planning-spec.json'), JSON.stringify({
      specRef: 'spec-1', moduleId, componentTree: [], tokenBindings: {},
    }));
    writeFileSync(join(previewDir, 'penpot-design.json'), JSON.stringify({
      penpotProjectId: 'proj-1', penpotPageId: 'page-1',
      penpotNodeIds: { Header: 'n1' }, moduleId, breakpoints: [],
      script: 'return { rootId: "root-1", nodeIds: { Header: "new-1" } };',
    }));

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runPenpotPreflight: jest.fn().mockResolvedValue({
          ok: false, error: { code: 'MCP_UNAVAILABLE', message: 'mock', recoverable: true },
        }),
        loadPenpotSession: jest.fn().mockReturnValue({
          ok: false, error: { code: 'INVALID_STATE', message: 'no session', recoverable: false },
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('replay ok', out, { stage: 'replay', module: moduleId, mock: true });

    // With mock MCP, the replay call will succeed (mock returns Ok({}))
    expect(out.output).toContain('replaying cached script');
  });
});

describe('design:page integration — stage connect', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-page-connect-'));
    writeFileSync(join(tmpDir, 'agentforge.yaml'), 'version: 1\n');
    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs', 'prd.md'), '# App\n');
    mkdirSync(join(tmpDir, 'agentforge', 'spec'), { recursive: true });
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml'), yamlStringify(VALID_TOKENS));
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'brand.yaml'), yamlStringify(VALID_BRAND));
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

  it('--stage connect loads cached artifact and prints summary', async () => {
    const moduleId = 'connect-test';
    const previewDir = join(tmpDir, '.agentforge', 'previews', moduleId);
    mkdirSync(previewDir, { recursive: true });

    writeFileSync(join(previewDir, 'research-brief.json'), JSON.stringify({ briefId: 'b1', moduleId }));
    writeFileSync(join(previewDir, 'planning-spec.json'), JSON.stringify({
      specRef: 'spec-1', moduleId, componentTree: [], tokenBindings: {},
    }));
    writeFileSync(join(previewDir, 'penpot-design.json'), JSON.stringify({
      penpotProjectId: 'proj-connect',
      penpotPageId: 'page-1',
      penpotNodeIds: { Header: 'n1', Sidebar: 'n2' },
      moduleId, breakpoints: [],
    }));

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runPenpotPreflight: jest.fn().mockResolvedValue({
          ok: false, error: { code: 'MCP_UNAVAILABLE', message: 'mock', recoverable: true },
        }),
        loadPenpotSession: jest.fn().mockReturnValue({
          ok: false, error: { code: 'INVALID_STATE', message: 'no session', recoverable: false },
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('connect test', out, { stage: 'connect', module: moduleId, mock: true });

    expect(out.output).toContain('CONNECTION TEST COMPLETE');
    expect(out.output).toContain('Components: 2');
    expect(out.output).toContain('proj-connect');
  });

  it('--stage connect fails when no cached artifact', async () => {
    const moduleId = 'connect-missing';
    const previewDir = join(tmpDir, '.agentforge', 'previews', moduleId);
    mkdirSync(previewDir, { recursive: true });

    writeFileSync(join(previewDir, 'research-brief.json'), JSON.stringify({ briefId: 'b1', moduleId }));
    writeFileSync(join(previewDir, 'planning-spec.json'), JSON.stringify({
      specRef: 'spec-1', moduleId, componentTree: [], tokenBindings: {},
    }));
    // No penpot-design.json

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runPenpotPreflight: jest.fn().mockResolvedValue({
          ok: false, error: { code: 'MCP_UNAVAILABLE', message: 'mock', recoverable: true },
        }),
        loadPenpotSession: jest.fn().mockReturnValue({
          ok: false, error: { code: 'INVALID_STATE', message: 'no session', recoverable: false },
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('connect missing', out, { stage: 'connect', module: moduleId, mock: true });

    expect(out.output).toContain('No cached design output');
    expect(process.exitCode).toBe(1);
  });
});

describe('design:page integration — --tool penpot connection', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-page-tool-penpot-'));
    writeFileSync(join(tmpDir, 'agentforge.yaml'), 'version: 1\n');
    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs', 'prd.md'), '# App\n');
    mkdirSync(join(tmpDir, 'agentforge', 'spec'), { recursive: true });
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml'), yamlStringify(VALID_TOKENS));
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'brand.yaml'), yamlStringify(VALID_BRAND));
  });

  afterAll(() => { rmSync(tmpDir, { recursive: true, force: true }); });

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

  it('--tool penpot does NOT defer Penpot connection', async () => {
    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return { ...actual };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('home', out, { noWait: true, tool: 'penpot', mock: true });

    // With --tool penpot, the "Penpot connection deferred" message should NOT appear
    // because needsPenpotEarly includes options.tool === 'penpot'
    expect(out.output).not.toContain('Penpot connection deferred');
  });
});

describe('design:page integration — --implement flag', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-page-impl-'));
    writeFileSync(join(tmpDir, 'agentforge.yaml'), 'version: 1\n');
    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs', 'prd.md'), '# App\n');
    mkdirSync(join(tmpDir, 'agentforge', 'spec'), { recursive: true });
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml'), yamlStringify(VALID_TOKENS));
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'brand.yaml'), yamlStringify(VALID_BRAND));
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

  it('--implement triggers implementation after design', async () => {
    let implCalled = false;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockResolvedValue({
          ok: true,
          value: {
            moduleId: 'home',
            taskId: 'task-1',
            projectRoot: '/tmp',
            designTool: 'browser',
            research: { briefId: 'brief-1', moduleId: 'home', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
            planning: { specRef: 'spec-1', moduleId: 'home', componentTree: [], tokenBindings: {}, responsiveRules: [] },
            design: { spec: { screen: 'home', width: 1440, nodes: {} }, designToolMetadata: { tool: 'browser' } },
          },
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'home', width: 1440, nodes: {} },
          finalScore: 85,
          iterations: 1,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
        uxImplementationWork: jest.fn().mockImplementation(() => {
          implCalled = true;
          return Promise.resolve({
            ok: true,
            value: { files: [{ filePath: 'Home.tsx', content: 'export default () => <div />;' }] },
          });
        }),
        writeImplementationFiles: jest.fn().mockReturnValue(['Home.tsx']),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('home', out, { implement: true, noWait: true, mock: true });

    expect(implCalled).toBe(true);
    expect(out.output).toContain('[implement]');
    expect(out.output).toContain('Generated 1 file');
  }, 30_000);
});

// ============================================================================
// --project-dir integration tests
// ============================================================================

describe('design:page integration — --project-dir option', () => {
  let repoRoot: string;
  let projectDir: string;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    // repoRoot simulates the repo where CLI is invoked from
    repoRoot = mkdtempSync(join(tmpdir(), 'agentforge-page-projdir-repo-'));

    // projectDir is a subdirectory simulating a separate project
    projectDir = join(repoRoot, 'my-project');
    mkdirSync(projectDir, { recursive: true });

    // Set up the project dir with agentforge.yaml, PRD, tokens, brand
    writeFileSync(join(projectDir, 'agentforge.yaml'), 'version: 1\n');
    mkdirSync(join(projectDir, 'docs'), { recursive: true });
    writeFileSync(join(projectDir, 'docs', 'prd.md'), '# ProjectDir App\n\nApp in a subdirectory.\n');
    mkdirSync(join(projectDir, 'agentforge', 'spec'), { recursive: true });
    writeFileSync(join(projectDir, 'agentforge', 'spec', 'design-tokens.yaml'), yamlStringify(VALID_TOKENS));
    writeFileSync(join(projectDir, 'agentforge', 'spec', 'brand.yaml'), yamlStringify(VALID_BRAND));

    // Pre-create cached artifacts so --stage replay works
    const previewDir = join(projectDir, '.agentforge', 'previews', 'projdir-test');
    mkdirSync(previewDir, { recursive: true });
    writeFileSync(join(previewDir, 'research-brief.json'), JSON.stringify({ briefId: 'b1', moduleId: 'projdir-test' }));
    writeFileSync(join(previewDir, 'planning-spec.json'), JSON.stringify({
      specRef: 'spec-1', moduleId: 'projdir-test', componentTree: [], tokenBindings: {},
    }));
    writeFileSync(join(previewDir, 'penpot-design.json'), JSON.stringify({
      penpotProjectId: 'proj-pd', penpotPageId: 'page-1',
      penpotNodeIds: { Card: 'n1' }, moduleId: 'projdir-test', breakpoints: [],
      script: 'return { rootId: "root-1", nodeIds: { Card: "new-1" } };',
    }));
  });

  afterAll(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    // cwd is the repo root, NOT the project dir
    jest.spyOn(process, 'cwd').mockReturnValue(repoRoot);
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-dummy-key' };
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    process.exitCode = undefined;
  });

  it('resolves artifacts from --project-dir instead of cwd', async () => {
    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runPenpotPreflight: jest.fn().mockResolvedValue({
          ok: false, error: { code: 'MCP_UNAVAILABLE', message: 'mock', recoverable: true },
        }),
        loadPenpotSession: jest.fn().mockReturnValue({
          ok: false, error: { code: 'INVALID_STATE', message: 'no session', recoverable: false },
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    // Run with --project-dir pointing to the subdirectory
    await designPageCommand('projdir test', out, {
      stage: 'replay',
      module: 'projdir-test',
      mock: true,
      projectDir: 'my-project',
    });

    // Should find the cached artifacts in my-project/.agentforge/previews/
    expect(out.output).toContain('replaying cached script');
    expect(out.output).toContain('REPLAY COMPLETE');
    expect(process.exitCode).toBeUndefined();
  });

  it('loads PRD and tokens from --project-dir', async () => {
    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockResolvedValue({
          ok: true,
          value: {
            moduleId: 'home', taskId: 'task-1', projectRoot: '/tmp', designTool: 'browser',
            research: { briefId: 'b1', moduleId: 'home', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
            planning: { specRef: 's1', moduleId: 'home', componentTree: [], tokenBindings: {}, responsiveRules: [] },
            design: { spec: { screen: 'home', width: 1440, nodes: {} } },
          },
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'home', width: 1440, nodes: {} }, finalScore: 85, iterations: 1, thresholdMet: true, screenshot: Buffer.from(''),
        }),
      };
    });
    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('home', out, {
      noWait: true,
      mock: true,
      projectDir: 'my-project',
    });

    expect(out.output).toContain('PRD loaded from');
    expect(out.output).toContain('Design tokens loaded');
    expect(out.output).toContain('Brand spec loaded');
  });

  it('fails gracefully when --project-dir has no agentforge.yaml', async () => {
    // Create an empty subdirectory with no project files
    const emptyDir = join(repoRoot, 'empty-project');
    mkdirSync(emptyDir, { recursive: true });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('home', out, {
      noWait: true,
      mock: true,
      projectDir: 'empty-project',
    });

    // Should warn about missing design system (no tokens/brand found)
    expect(out.output).toContain('No design system found');
  });
});

// ============================================================================
// Viewport config integration tests
// ============================================================================

describe('design:page integration — viewport config from manifest', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-page-viewport-'));

    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs', 'prd.md'), '# App\n\nA test app.\n');
    mkdirSync(join(tmpDir, 'agentforge', 'spec'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml'),
      yamlStringify(VALID_TOKENS),
    );
    writeFileSync(
      join(tmpDir, 'agentforge', 'spec', 'brand.yaml'),
      yamlStringify(VALID_BRAND),
    );
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

  it('uses design config primary_viewport when page has no viewports', async () => {
    // Write manifest with design config specifying 1280 primary viewport
    writeFileSync(join(tmpDir, 'agentforge.yaml'), yamlStringify({
      version: '1.0',
      project: { name: 'test', id: 'test-1', platforms: ['web'] },
      stack: { frontend: 'react', backend: 'node', database: 'postgresql', styling: 'tailwind' },
      repo: { provider: 'github', org: 'test', name: 'test' },
      agents: { providers: { default: 'claude-sonnet-4-6' }, sandbox: { type: 'github_actions', timeout_minutes: 15, max_retries: 3 }, orchestration: { max_concurrent_agents: 3, ci_wait_strategy: 'spawn_next' } },
      hitl: { default: 'review_and_override' },
      channels: [{ type: 'cli', capabilities: 'basic', priority: 1 }],
      routing: { approval_requests: 'all', status_updates: 'primary', critical_alerts: 'all' },
      budget: { per_task_max_usd: 2, per_phase_max_usd: 25, monthly_max_usd: 200, alert_threshold: 0.8 },
      design: { primary_viewport: 1280, layout_strategy: 'desktop-first', responsive_breakpoints: false },
    }));

    let capturedPipelineInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedPipelineInput = input;
          return Promise.resolve({
            ok: true,
            value: {
              moduleId: input.moduleId ?? 'home',
              taskId: input.taskId ?? 'task-1',
              projectRoot: '/tmp',
              designTool: 'browser',
              research: { briefId: 'brief-1', moduleId: input.moduleId ?? 'home', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
              planning: { specRef: 'spec-1', moduleId: input.moduleId ?? 'home', componentTree: [], tokenBindings: {}, responsiveRules: [] },
              design: { spec: { screen: 'home', width: 1440, nodes: {} }, designToolMetadata: { tool: 'browser' } },
            },
          });
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'home', width: 1440, nodes: {} },
          finalScore: 85,
          iterations: 1,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('home', out, { noWait: true, mock: true });

    expect(capturedPipelineInput).toBeDefined();
    expect(capturedPipelineInput!.viewportWidth).toBe(1280);
  });

  it('CLI --width overrides manifest design config', async () => {
    // Same manifest with 1280 primary viewport
    writeFileSync(join(tmpDir, 'agentforge.yaml'), yamlStringify({
      version: '1.0',
      project: { name: 'test', id: 'test-1', platforms: ['web'] },
      stack: { frontend: 'react', backend: 'node', database: 'postgresql', styling: 'tailwind' },
      repo: { provider: 'github', org: 'test', name: 'test' },
      agents: { providers: { default: 'claude-sonnet-4-6' }, sandbox: { type: 'github_actions', timeout_minutes: 15, max_retries: 3 }, orchestration: { max_concurrent_agents: 3, ci_wait_strategy: 'spawn_next' } },
      hitl: { default: 'review_and_override' },
      channels: [{ type: 'cli', capabilities: 'basic', priority: 1 }],
      routing: { approval_requests: 'all', status_updates: 'primary', critical_alerts: 'all' },
      budget: { per_task_max_usd: 2, per_phase_max_usd: 25, monthly_max_usd: 200, alert_threshold: 0.8 },
      design: { primary_viewport: 1280, layout_strategy: 'desktop-first', responsive_breakpoints: false },
    }));

    let capturedPipelineInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedPipelineInput = input;
          return Promise.resolve({
            ok: true,
            value: {
              moduleId: input.moduleId ?? 'home',
              taskId: input.taskId ?? 'task-1',
              projectRoot: '/tmp',
              designTool: 'browser',
              research: { briefId: 'brief-1', moduleId: input.moduleId ?? 'home', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
              planning: { specRef: 'spec-1', moduleId: input.moduleId ?? 'home', componentTree: [], tokenBindings: {}, responsiveRules: [] },
              design: { spec: { screen: 'home', width: 1440, nodes: {} }, designToolMetadata: { tool: 'browser' } },
            },
          });
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'home', width: 1440, nodes: {} },
          finalScore: 85,
          iterations: 1,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('home', out, { width: 768, noWait: true, mock: true });

    expect(capturedPipelineInput).toBeDefined();
    expect(capturedPipelineInput!.viewportWidth).toBe(768);
  });

  it('passes designConfig to pipeline for viewport constraint injection', async () => {
    writeFileSync(join(tmpDir, 'agentforge.yaml'), yamlStringify({
      version: '1.0',
      project: { name: 'test', id: 'test-1', platforms: ['web'] },
      stack: { frontend: 'react', backend: 'node', database: 'postgresql', styling: 'tailwind' },
      repo: { provider: 'github', org: 'test', name: 'test' },
      agents: { providers: { default: 'claude-sonnet-4-6' }, sandbox: { type: 'github_actions', timeout_minutes: 15, max_retries: 3 }, orchestration: { max_concurrent_agents: 3, ci_wait_strategy: 'spawn_next' } },
      hitl: { default: 'review_and_override' },
      channels: [{ type: 'cli', capabilities: 'basic', priority: 1 }],
      routing: { approval_requests: 'all', status_updates: 'primary', critical_alerts: 'all' },
      budget: { per_task_max_usd: 2, per_phase_max_usd: 25, monthly_max_usd: 200, alert_threshold: 0.8 },
      design: { primary_viewport: 1440, layout_strategy: 'desktop-first', responsive_breakpoints: false },
    }));

    let capturedPipelineInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedPipelineInput = input;
          return Promise.resolve({
            ok: true,
            value: {
              moduleId: input.moduleId ?? 'home',
              taskId: input.taskId ?? 'task-1',
              projectRoot: '/tmp',
              designTool: 'browser',
              research: { briefId: 'brief-1', moduleId: input.moduleId ?? 'home', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
              planning: { specRef: 'spec-1', moduleId: input.moduleId ?? 'home', componentTree: [], tokenBindings: {}, responsiveRules: [] },
              design: { spec: { screen: 'home', width: 1440, nodes: {} }, designToolMetadata: { tool: 'browser' } },
            },
          });
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'home', width: 1440, nodes: {} },
          finalScore: 85,
          iterations: 1,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    // --fresh ensures pipeline re-runs (not loaded from cache)
    await designPageCommand('home', out, { noWait: true, mock: true, fresh: true });

    expect(capturedPipelineInput).toBeDefined();
    expect(capturedPipelineInput!.designConfig).toEqual({
      primary_viewport: 1440,
      layout_strategy: 'desktop-first',
      responsive_breakpoints: false,
    });
  });
});

// ============================================================================
// Cache reuse and --fresh flag tests
// ============================================================================

describe('design:page integration — cache reuse', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-page-cache-'));
    writeFileSync(join(tmpDir, 'agentforge.yaml'), 'version: 1\n');
    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs', 'prd.md'), '# App\n\nTest app for cache reuse.\n');
    mkdirSync(join(tmpDir, 'agentforge', 'spec'), { recursive: true });
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml'), yamlStringify(VALID_TOKENS));
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'brand.yaml'), yamlStringify(VALID_BRAND));
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

  it('auto-reuses cached research and planning when artifacts exist', async () => {
    const moduleId = 'cache-reuse';
    const previewDir = join(tmpDir, '.agentforge', 'previews', moduleId);
    mkdirSync(previewDir, { recursive: true });

    // Write cached research and planning artifacts
    writeFileSync(join(previewDir, 'research-brief.json'), JSON.stringify({
      briefId: 'cached-brief', moduleId,
      competitors: [], patterns: [], accessibilityNotes: [], recommendations: [],
    }));
    writeFileSync(join(previewDir, 'planning-spec.json'), JSON.stringify({
      specRef: 'cached-spec', moduleId,
      componentTree: [{ id: 'root', type: 'page', name: 'CachedPage', props: [], children: [] }],
      tokenBindings: {},
    }));

    let capturedPipelineInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedPipelineInput = input;
          return Promise.resolve({
            ok: true,
            value: {
              moduleId,
              taskId: input.taskId ?? 'task-1',
              projectRoot: '/tmp',
              designTool: 'browser',
              research: { briefId: 'cached-brief', moduleId, requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
              planning: { specRef: 'cached-spec', moduleId, componentTree: [], tokenBindings: {}, responsiveRules: [] },
              design: { spec: { screen: 'test', width: 1440, nodes: {} }, designToolMetadata: { tool: 'browser' } },
            },
          });
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'test', width: 1440, nodes: {} },
          finalScore: 85,
          iterations: 1,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('cache reuse test', out, { module: moduleId, noWait: true, mock: true });

    // Pipeline is called with resume: true (no --fresh flag)
    expect(capturedPipelineInput).toBeDefined();
    expect(capturedPipelineInput!.resume).toBe(true);
  });

  it('--fresh forces re-run even when cached artifacts exist', async () => {
    const moduleId = 'fresh-test';
    const previewDir = join(tmpDir, '.agentforge', 'previews', moduleId);
    mkdirSync(previewDir, { recursive: true });

    // Write cached research and planning artifacts
    writeFileSync(join(previewDir, 'research-brief.json'), JSON.stringify({
      briefId: 'cached-brief', moduleId,
    }));
    writeFileSync(join(previewDir, 'planning-spec.json'), JSON.stringify({
      specRef: 'cached-spec', moduleId, componentTree: [], tokenBindings: {},
    }));

    let capturedPipelineInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedPipelineInput = input;
          return Promise.resolve({
            ok: true,
            value: {
              moduleId,
              taskId: input.taskId ?? 'task-1',
              projectRoot: '/tmp',
              designTool: 'browser',
              research: { briefId: 'fresh-brief', moduleId, requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
              planning: { specRef: 'fresh-spec', moduleId, componentTree: [], tokenBindings: {}, responsiveRules: [] },
              design: { spec: { screen: 'test', width: 1440, nodes: {} }, designToolMetadata: { tool: 'browser' } },
            },
          });
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'test', width: 1440, nodes: {} },
          finalScore: 85,
          iterations: 1,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('fresh test', out, { module: moduleId, noWait: true, mock: true, fresh: true });

    // With --fresh, pipeline is called with resume: false
    expect(capturedPipelineInput).toBeDefined();
    expect(capturedPipelineInput!.resume).toBe(false);
  });
});

// ============================================================================
// Page resolution from pages.yaml
// ============================================================================

const PAGES_YAML = {
  version: '1.0',
  pages: [
    {
      id: 'bill-entry',
      name: 'Bill Entry',
      description: 'The primary input screen where users enter all bill details',
      route: '/',
      status: 'active',
      components: ['AppHeader', 'BillTotalInput', 'TipSegmentedControl', 'PersonList',
        'EqualSplitToggle', 'CustomSplitRow', 'CalculateButton', 'TaxInput',
        'DiscountInput', 'CurrencySelector', 'PersonAvatar', 'AddPersonButton',
        'RemovePersonButton', 'BillSummaryFooter'],
      data_sources: ['BillState', 'PersonEntry'],
      viewports: [1440],
    },
    {
      id: 'split-breakdown',
      name: 'Split Breakdown',
      description: 'The results screen showing each person\'s calculated share',
      route: '/breakdown',
      status: 'active',
      components: ['AppHeader', 'SplitResultCard', 'ShareButton'],
      data_sources: ['SplitResult'],
    },
    {
      id: 'shared-result',
      name: 'Shared Result',
      description: 'A read-only snapshot view',
      route: '/result',
      status: 'active',
      components: ['AppHeader', 'SplitResultCard'],
    },
  ],
};

const MODELS_YAML = {
  version: '1.0',
  models: [
    {
      id: 'BillState',
      name: 'BillState',
      fields: [
        { name: 'subtotal', type: 'number' },
        { name: 'tax_amount', type: 'number' },
      ],
      db_table: 'bill_states',
    },
    {
      id: 'PersonEntry',
      name: 'PersonEntry',
      fields: [{ name: 'name', type: 'string' }],
      db_table: 'person_entries',
    },
  ],
};

const API_YAML = {
  version: '1.0',
  base_url: '/api',
  endpoints: [
    {
      id: 'calculate',
      method: 'POST',
      path: '/api/calculate',
      query_params: [],
      response: { type: 'object', schema_ref: 'SplitResult[]' },
      auth: 'none',
      status: 'active',
    },
  ],
};

describe('design:page integration — page resolution from pages.yaml', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-page-pages-'));
    writeFileSync(join(tmpDir, 'agentforge.yaml'), 'version: 1\n');
    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(join(tmpDir, 'docs', 'prd.md'), '# SplitEasy\n\nA bill splitting app.\n');
    mkdirSync(join(tmpDir, 'agentforge', 'spec'), { recursive: true });
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml'), yamlStringify(VALID_TOKENS));
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'brand.yaml'), yamlStringify(VALID_BRAND));
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'pages.yaml'), yamlStringify(PAGES_YAML));
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'models.yaml'), yamlStringify(MODELS_YAML));
    writeFileSync(join(tmpDir, 'agentforge', 'spec', 'api.yaml'), yamlStringify(API_YAML));
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

  it('resolves exact page ID and reports match', async () => {
    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('bill-entry', out, { noWait: true, mock: true });

    expect(out.output).toContain('Page matched: bill-entry (Bill Entry) — 14 components, route: /');
  });

  it('resolves case-insensitive page name', async () => {
    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('Bill Entry', out, { noWait: true, mock: true });

    expect(out.output).toContain('Page matched: bill-entry (Bill Entry)');
  });

  it('fails with available page IDs when page not found', async () => {
    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('nonexistent', out, { noWait: true, mock: true });

    expect(out.output).toContain("Page 'nonexistent' not found");
    expect(out.output).toContain('bill-entry');
    expect(out.output).toContain('split-breakdown');
    expect(out.output).toContain('shared-result');
    expect(process.exitCode).toBe(1);
  });

  it('uses page.id as moduleId (ignores --module)', async () => {
    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('bill-entry', out, { noWait: true, mock: true, module: 'custom-id' });

    // Should use page ID, not --module
    expect(out.output).toContain('Module: bill-entry');
  });

  it('passes pageContext to pipeline', async () => {
    let capturedPipelineInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedPipelineInput = input;
          return Promise.resolve({
            ok: true,
            value: {
              moduleId: 'bill-entry',
              taskId: input.taskId ?? 'task-1',
              projectRoot: '/tmp',
              designTool: 'browser',
              research: { briefId: 'brief-1', moduleId: 'bill-entry', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
              planning: { specRef: 'spec-1', moduleId: 'bill-entry', componentTree: [], tokenBindings: {}, responsiveRules: [] },
              design: { spec: { screen: 'bill-entry', width: 1440, nodes: {} }, designToolMetadata: { tool: 'browser' } },
            },
          });
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'bill-entry', width: 1440, nodes: {} },
          finalScore: 85,
          iterations: 1,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('bill-entry', out, { noWait: true, mock: true, fresh: true });

    // Verify pageContext is passed to the unified pipeline
    expect(capturedPipelineInput).toBeDefined();
    const pageCtx = capturedPipelineInput!.pageContext as { targetPage: { id: string }; models?: unknown[] } | undefined;
    expect(pageCtx).toBeDefined();
    expect(pageCtx!.targetPage.id).toBe('bill-entry');
  });

  it('includes filtered models in pageContext', async () => {
    let capturedPipelineInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        runDesignPipeline: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedPipelineInput = input;
          return Promise.resolve({
            ok: true,
            value: {
              moduleId: 'bill-entry',
              taskId: input.taskId ?? 'task-1',
              projectRoot: '/tmp',
              designTool: 'browser',
              research: { briefId: 'brief-1', moduleId: 'bill-entry', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] },
              planning: { specRef: 'spec-1', moduleId: 'bill-entry', componentTree: [], tokenBindings: {}, responsiveRules: [] },
              design: { spec: { screen: 'bill-entry', width: 1440, nodes: {} }, designToolMetadata: { tool: 'browser' } },
            },
          });
        }),
        runBrowserCorrectionPipeline: jest.fn().mockResolvedValue({
          finalSpec: { screen: 'bill-entry', width: 1440, nodes: {} },
          finalScore: 85,
          iterations: 1,
          thresholdMet: true,
          screenshot: Buffer.from(''),
        }),
      };
    });

    const { designPageCommand } = await import('./design-page.js');
    const out = createOutputStream();

    await designPageCommand('bill-entry', out, { noWait: true, mock: true, fresh: true });

    expect(capturedPipelineInput).toBeDefined();
    const pageCtx = capturedPipelineInput!.pageContext as { models?: Array<{ id: string }> };
    expect(pageCtx).toBeDefined();
    // bill-entry has data_sources: ['BillState', 'PersonEntry']
    expect(pageCtx.models).toBeDefined();
    expect(pageCtx.models!.map(m => m.id)).toEqual(['BillState', 'PersonEntry']);
  });
});
