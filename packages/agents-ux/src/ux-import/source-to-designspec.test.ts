/**
 * Tests for source-to-designspec conversion.
 * Tests the deterministic parts (source collection, prompt building)
 * and uses a mock LLM provider for the conversion pipeline.
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  collectPageSource,
  buildImportPrompt,
  convertPageToDesignSpec,
} from './source-to-designspec.js';
import type { LLMProvider, LLMToolResult } from './source-to-designspec.js';
import type { RouteInfo, CSSVariable } from '@agentforge/designspec-renderer';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';

const BROWNFIELD_APP = join(__dirname, '..', '..', '..', '..', 'fixtures', 'agentforge-brownfield-app');
const HAS_BROWNFIELD_APP = existsSync(join(BROWNFIELD_APP, 'package.json'));

// Skip brownfield-dependent tests when the fixture app isn't available.
// Clone it from the pg/dashboard-plugin branch: git checkout origin/pg/dashboard-plugin -- agentforge-brownfield-app
const itWithBrownfield = HAS_BROWNFIELD_APP ? it : it.skip;

const MOCK_ROUTE: RouteInfo = {
  id: 'home',
  route: '/',
  filePath: 'src/app/page.tsx',
  name: 'Home',
};

const MOCK_CSS_VARS: CSSVariable[] = [
  { name: '--primary', value: 'oklch(0.55 0.15 175)', scope: ':root' },
  { name: '--background', value: 'oklch(0.985 0.002 180)', scope: ':root' },
  { name: '--foreground', value: 'oklch(0.185 0.02 192)', scope: ':root' },
];

const MOCK_SPEC: DesignSpecV2 = {
  screen: 'dashboard',
  width: 1440,
  nodes: {
    'page-root': { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
    'heading': { parent: 'page-root', order: 0, type: 'text', content: 'Dashboard', typography: 'heading-1' },
  },
};

function createMockProvider(spec: DesignSpecV2 = MOCK_SPEC): LLMProvider {
  return {
    async callWithTool(): Promise<LLMToolResult> {
      return { ok: true, spec, usage: { input_tokens: 1000, output_tokens: 500 } };
    },
  };
}

function createFailingProvider(error: string): LLMProvider {
  return {
    async callWithTool(): Promise<LLMToolResult> {
      return { ok: false, error };
    },
  };
}

describe('collectPageSource', () => {
  itWithBrownfield('collects the dashboard page source and its imports', () => {
    const { content, files } = collectPageSource('src/app/page.tsx', BROWNFIELD_APP);

    expect(content.length).toBeGreaterThan(100);
    expect(files).toContain('src/app/page.tsx');

    // Should have followed imports to shadcn components
    expect(content).toContain('Card');
    expect(content).toContain('Badge');
    expect(content).toContain('Button');
  });

  itWithBrownfield('collects the settings page source with form components', () => {
    const { content, files } = collectPageSource('src/app/settings/page.tsx', BROWNFIELD_APP);

    expect(files).toContain('src/app/settings/page.tsx');
    expect(content).toContain('Switch');
    expect(content).toContain('Input');
    expect(content).toContain('Select');
  });

  itWithBrownfield('respects maxChars limit', () => {
    const full = collectPageSource('src/app/page.tsx', BROWNFIELD_APP);
    const limited = collectPageSource('src/app/page.tsx', BROWNFIELD_APP, 500);
    // Limited should have fewer files collected than unlimited
    expect(limited.files.length).toBeLessThanOrEqual(full.files.length);
  });

  it('returns empty for nonexistent file', () => {
    const { content, files } = collectPageSource('src/app/nonexistent.tsx', BROWNFIELD_APP);
    expect(content).toBe('');
    expect(files).toHaveLength(0);
  });
});

describe('buildImportPrompt', () => {
  it('builds a prompt with source code and tokens', () => {
    const prompt = buildImportPrompt(
      '```tsx\nexport default function Page() { return <div>Hello</div> }\n```',
      MOCK_CSS_VARS,
    );

    // Should contain the source code
    expect(prompt).toContain('Hello');

    // Should contain the token context
    expect(prompt).toContain('--primary');

    // Should contain the catalog mapping
    expect(prompt).toContain('button-primary');
    expect(prompt).toContain('input-text');

    // Should contain the tailwind mapping
    expect(prompt).toContain('flex-col');
    expect(prompt).toContain('layout.dir');
  });
});

describe('convertPageToDesignSpec', () => {
  itWithBrownfield('converts a page using mock LLM provider', async () => {
    const provider = createMockProvider();
    const result = await convertPageToDesignSpec(
      MOCK_ROUTE,
      provider,
      MOCK_CSS_VARS,
      { appRoot: BROWNFIELD_APP },
    );

    expect(result.spec).toBeDefined();
    expect(result.spec?.screen).toBe('dashboard');
    expect(result.spec?.nodes['page-root']).toBeDefined();
    expect(result.error).toBeUndefined();
    expect(result.sourceFiles.length).toBeGreaterThan(0);
  });

  itWithBrownfield('handles LLM failure gracefully', async () => {
    const provider = createFailingProvider('Rate limit exceeded');
    const result = await convertPageToDesignSpec(
      MOCK_ROUTE,
      provider,
      MOCK_CSS_VARS,
      { appRoot: BROWNFIELD_APP },
    );

    expect(result.spec).toBeNull();
    expect(result.error).toContain('Rate limit');
  });

  itWithBrownfield('handles nonexistent page file', async () => {
    const provider = createMockProvider();
    const result = await convertPageToDesignSpec(
      { ...MOCK_ROUTE, filePath: 'src/app/nonexistent.tsx' },
      provider,
      MOCK_CSS_VARS,
      { appRoot: BROWNFIELD_APP },
    );

    expect(result.spec).toBeNull();
    expect(result.error).toContain('Could not read');
  });
});
