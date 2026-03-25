/**
 * @module design-penpot-integration.test
 *
 * Integration tests for the design:penpot CLI command.
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

describe('design:penpot integration — file loading', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-design-penpot-'));

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
    // Point process.cwd() at the temp dir so findProjectRoot finds agentforge.yaml
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    // Set a dummy API key so we pass the key check and reach file loading
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-dummy-key' };
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    process.env = { ...originalEnv };
    process.exitCode = undefined;
  });

  it('loads PRD and reports in output', async () => {
    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('home', out, { noWait: true, mock: true });

    expect(out.output).toContain('PRD loaded from docs/prd.md');
  });

  it('loads design tokens and reports in output', async () => {
    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('home', out, { noWait: true, mock: true });

    expect(out.output).toContain('Design tokens loaded');
  });

  it('loads brand spec and reports in output', async () => {
    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('home', out, { noWait: true, mock: true });

    expect(out.output).toContain('Brand spec loaded');
  });

  it('warns when PRD is missing', async () => {
    const prdPath = join(tmpDir, 'docs', 'prd.md');
    rmSync(prdPath);

    try {
      const { designPenpotCommand } = await import('./design-penpot.js');
      const out = createOutputStream();

      await designPenpotCommand('home', out, { noWait: true, mock: true });

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
      const { designPenpotCommand } = await import('./design-penpot.js');
      const out = createOutputStream();

      await designPenpotCommand('home', out, { noWait: true, mock: true });

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
describe('design:penpot integration — design system context data flow', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-penpot-dsflow-'));

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

  it('passes designSystemPrompt and description to penpotDesignWork when tokens + brand exist', async () => {
    // Capture the PenpotDesignInput passed to penpotDesignWork
    let capturedInput: Record<string, unknown> | undefined;

    // Mock agents-ux to intercept the design stage input
    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        // Research: return minimal valid output
        uxResearchWork: jest.fn().mockResolvedValue({
          ok: true,
          value: {
            briefId: 'brief-test',
            moduleId: 'home',
            competitors: [],
            patterns: [],
            accessibilityNotes: [],
            recommendations: [],
          },
        }),
        // Planning: return minimal valid output with tokenBindings for buildDesignSystemContextFromSpec
        uxPlanningWork: jest.fn().mockResolvedValue({
          ok: true,
          value: {
            specRef: 'spec-test',
            moduleId: 'home',
            componentTree: [{ id: 'root', type: 'page', name: 'Home', props: [], children: [] }],
            colorTokens: {},
            typographyTokens: {},
            tokenBindings: {},
          },
        }),
        // Penpot preflight: skip real connection
        runPenpotPreflight: jest.fn().mockResolvedValue({
          ok: false,
          error: { code: 'MCP_UNAVAILABLE', message: 'mock', recoverable: true },
        }),
        loadPenpotSession: jest.fn().mockReturnValue({
          ok: false,
          error: { code: 'INVALID_STATE', message: 'no session', recoverable: false },
        }),
        // Design: capture input and return success
        penpotDesignWork: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedInput = input;
          return Promise.resolve({
            ok: true,
            value: {
              penpotProjectId: 'proj-1',
              penpotPageId: 'page-1',
              penpotNodeIds: {},
              moduleId: 'home',
              breakpoints: [],
            },
          });
        }),
      };
    });

    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('home dashboard', out, { noWait: true, mock: true });

    // Verify penpotDesignWork was called with design system context
    expect(capturedInput).toBeDefined();
    expect(capturedInput!.designSystemPrompt).toBeDefined();
    expect(typeof capturedInput!.designSystemPrompt).toBe('string');

    // Verify the prompt contains actual token values from the on-disk files
    const dsPrompt = capturedInput!.designSystemPrompt as string;
    // Colors are converted to RGB: #2563EB → r: 0.15, g: 0.39, b: 0.92
    expect(dsPrompt).toContain('blue');    // color name from VALID_TOKENS
    expect(dsPrompt).toContain('slate');   // color name from VALID_TOKENS
    // Typography scale uses family alias (display/body) with size and weight
    expect(dsPrompt).toContain('heading-1: 32px/auto, weight 700 (display)'); // from VALID_TOKENS
    expect(dsPrompt).toContain('professional'); // tone from VALID_BRAND

    // Verify description is passed through
    expect(capturedInput!.description).toBe('home dashboard');
  });
});

// ============================================================================
// Stage tests: --stage replay, --stage connect, --implement
// ============================================================================

describe('design:penpot integration — stage replay', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-penpot-replay-'));
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

    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('test app', out, { stage: 'replay', module: moduleId, mock: true });

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

    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('replay ok', out, { stage: 'replay', module: moduleId, mock: true });

    // With mock MCP, the replay call will succeed (mock returns Ok({}))
    expect(out.output).toContain('replaying cached script');
  });
});

describe('design:penpot integration — stage connect', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-penpot-connect-'));
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

    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('connect test', out, { stage: 'connect', module: moduleId, mock: true });

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

    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('connect missing', out, { stage: 'connect', module: moduleId, mock: true });

    expect(out.output).toContain('No cached design output');
    expect(process.exitCode).toBe(1);
  });
});

describe('design:penpot integration — --implement flag', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-penpot-impl-'));
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
        uxResearchWork: jest.fn().mockResolvedValue({
          ok: true,
          value: { briefId: 'b1', moduleId: 'home', competitors: [], patterns: [], accessibilityNotes: [], recommendations: [] },
        }),
        uxPlanningWork: jest.fn().mockResolvedValue({
          ok: true,
          value: { specRef: 'spec-1', moduleId: 'home', componentTree: [], tokenBindings: {} },
        }),
        runPenpotPreflight: jest.fn().mockResolvedValue({
          ok: false, error: { code: 'MCP_UNAVAILABLE', message: 'mock', recoverable: true },
        }),
        loadPenpotSession: jest.fn().mockReturnValue({
          ok: false, error: { code: 'INVALID_STATE', message: 'no session', recoverable: false },
        }),
        penpotDesignWork: jest.fn().mockResolvedValue({
          ok: true,
          value: {
            penpotProjectId: 'proj-1', penpotPageId: 'page-1',
            penpotNodeIds: { Header: 'n1' }, moduleId: 'home', breakpoints: [],
          },
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

    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('home', out, { implement: true, noWait: true, mock: true });

    expect(implCalled).toBe(true);
    expect(out.output).toContain('[implement]');
    expect(out.output).toContain('Generated 1 file');
  });
});

// ============================================================================
// Viewport config integration tests
// ============================================================================

describe('design:penpot integration — viewport config from manifest', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-penpot-viewport-'));

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

    let capturedInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        uxResearchWork: jest.fn().mockResolvedValue({
          ok: true,
          value: { briefId: 'b1', moduleId: 'home', competitors: [], patterns: [], accessibilityNotes: [], recommendations: [] },
        }),
        uxPlanningWork: jest.fn().mockResolvedValue({
          ok: true,
          value: { specRef: 'spec-1', moduleId: 'home', componentTree: [], tokenBindings: {} },
        }),
        penpotDesignWork: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedInput = input;
          return Promise.resolve({
            ok: true,
            value: { penpotProjectId: 'proj-1', penpotPageId: 'page-1', penpotNodeIds: {}, moduleId: 'home', breakpoints: [] },
          });
        }),
      };
    });

    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('home', out, { noWait: true, mock: true });

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.viewportWidth).toBe(1280);
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

    let capturedInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        uxResearchWork: jest.fn().mockResolvedValue({
          ok: true,
          value: { briefId: 'b1', moduleId: 'home', competitors: [], patterns: [], accessibilityNotes: [], recommendations: [] },
        }),
        uxPlanningWork: jest.fn().mockResolvedValue({
          ok: true,
          value: { specRef: 'spec-1', moduleId: 'home', componentTree: [], tokenBindings: {} },
        }),
        penpotDesignWork: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedInput = input;
          return Promise.resolve({
            ok: true,
            value: { penpotProjectId: 'proj-1', penpotPageId: 'page-1', penpotNodeIds: {}, moduleId: 'home', breakpoints: [] },
          });
        }),
      };
    });

    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('home', out, { width: 768, noWait: true, mock: true });

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.viewportWidth).toBe(768);
  });

  it('passes designConfig to planning agent for viewport constraint injection', async () => {
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

    let capturedPlanningInput: Record<string, unknown> | undefined;

    jest.doMock('@agentforge/agents-ux', () => {
      const actual = jest.requireActual('@agentforge/agents-ux') as Record<string, unknown>;
      return {
        ...actual,
        uxResearchWork: jest.fn().mockResolvedValue({
          ok: true,
          value: { briefId: 'b1', moduleId: 'home', competitors: [], patterns: [], accessibilityNotes: [], recommendations: [] },
        }),
        uxPlanningWork: jest.fn().mockImplementation((input: Record<string, unknown>) => {
          capturedPlanningInput = input;
          return Promise.resolve({
            ok: true,
            value: { specRef: 'spec-1', moduleId: 'home', componentTree: [], tokenBindings: {} },
          });
        }),
        penpotDesignWork: jest.fn().mockResolvedValue({
          ok: true,
          value: { penpotProjectId: 'proj-1', penpotPageId: 'page-1', penpotNodeIds: {}, moduleId: 'home', breakpoints: [] },
        }),
      };
    });

    const { designPenpotCommand } = await import('./design-penpot.js');
    const out = createOutputStream();

    await designPenpotCommand('home', out, { noWait: true, mock: true });

    expect(capturedPlanningInput).toBeDefined();
    expect(capturedPlanningInput!.designConfig).toEqual({
      primary_viewport: 1440,
      layout_strategy: 'desktop-first',
      responsive_breakpoints: false,
    });
  });
});
