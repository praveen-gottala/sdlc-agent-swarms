/**
 * @module design-figma-integration.test
 *
 * Integration tests for the design:figma CLI command.
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
// Fixtures (same values as design-system-reader.test.ts)
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

describe('design:figma integration — file loading', () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-design-figma-'));

    // Create agentforge.yaml so findProjectRoot resolves to tmpDir
    writeFileSync(join(tmpDir, 'agentforge.yaml'), 'version: 1\n');

    // Create docs/prd.md
    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'docs', 'prd.md'),
      '# BookShelf\n\nA personal library app for tracking books by ISBN.\n',
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
    // Dynamic import to avoid module-level side effects
    const { designFigmaCommand } = await import('./design-figma.js');
    const out = createOutputStream();

    await designFigmaCommand('home', out, { noWait: true, mock: true });

    expect(out.output).toContain('PRD loaded from docs/prd.md');
  });

  it('loads design tokens and reports in output', async () => {
    const { designFigmaCommand } = await import('./design-figma.js');
    const out = createOutputStream();

    await designFigmaCommand('home', out, { noWait: true, mock: true });

    expect(out.output).toContain('Design tokens loaded');
  });

  it('loads brand spec and reports in output', async () => {
    const { designFigmaCommand } = await import('./design-figma.js');
    const out = createOutputStream();

    await designFigmaCommand('home', out, { noWait: true, mock: true });

    expect(out.output).toContain('Brand spec loaded');
  });

  it('warns when PRD is missing', async () => {
    // Remove PRD
    const prdPath = join(tmpDir, 'docs', 'prd.md');
    rmSync(prdPath);

    try {
      const { designFigmaCommand } = await import('./design-figma.js');
      const out = createOutputStream();

      await designFigmaCommand('home', out, { noWait: true, mock: true });

      expect(out.output).toContain('No PRD found');
    } finally {
      // Restore PRD for other tests
      writeFileSync(prdPath, '# BookShelf\n\nA personal library app for tracking books by ISBN.\n');
    }
  });

  it('warns when design system is missing', async () => {
    // Remove both spec files
    const tokensPath = join(tmpDir, 'agentforge', 'spec', 'design-tokens.yaml');
    const brandPath = join(tmpDir, 'agentforge', 'spec', 'brand.yaml');
    rmSync(tokensPath);
    rmSync(brandPath);

    try {
      const { designFigmaCommand } = await import('./design-figma.js');
      const out = createOutputStream();

      await designFigmaCommand('home', out, { noWait: true, mock: true });

      expect(out.output).toContain('No design system found');
    } finally {
      // Restore files for other tests
      writeFileSync(tokensPath, yamlStringify(VALID_TOKENS));
      writeFileSync(brandPath, yamlStringify(VALID_BRAND));
    }
  });

  it('reports component catalog loaded when file exists', async () => {
    // Write component catalog
    const specDir = join(tmpDir, 'agentforge', 'spec');
    const catalogPath = join(specDir, 'component-catalog.yaml');
    const catalog = {
      version: '1.0',
      created_by: 'test',
      components: {
        Card: {
          description: 'Content container',
          category: 'layout',
          anatomy: [{ name: 'body', contents: 'Primary content area' }],
          states: { default: { bg: 'surface-primary', text: 'text-primary' } },
          spacing: { padding: '16', internal_gap: '12' },
          library_mapping: {},
          accessibility: { focus_visible: true, aria_labels: [] },
        },
      },
    };
    writeFileSync(catalogPath, yamlStringify(catalog));

    try {
      const { designFigmaCommand } = await import('./design-figma.js');
      const out = createOutputStream();

      await designFigmaCommand('home', out, { noWait: true, mock: true });

      expect(out.output).toContain('Component catalog loaded');
    } finally {
      // Remove catalog so it doesn't affect other tests
      rmSync(catalogPath);
    }
  });
});
