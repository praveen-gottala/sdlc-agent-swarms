import {
  parseAppSpecResponse,
  generateAppSpecPreviewHtml,
  designGenerateCommand,
} from './design-generate.js';
import type { GeneratedAppSpec } from './design-generate.js';
import type { DesignTokensSpec, BrandSpec } from '@agentforge/core';
import type { FileSystem } from '../fs-utils.js';
import { PassThrough } from 'node:stream';

function createMockFs(): FileSystem & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: `Not found: ${filePath}`, recoverable: false } };
      }
      return { ok: true as const, value: content };
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    exists(filePath: string) {
      return files.has(filePath) || dirs.has(filePath);
    },
    mkdir(dirPath: string) {
      dirs.add(dirPath);
      return { ok: true as const, value: undefined };
    },
    rename() {
      return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Not implemented', recoverable: false } };
    },
    remove(filePath: string) {
      files.delete(filePath);
      return { ok: true as const, value: undefined };
    },
    listDir() {
      return { ok: true as const, value: [] as readonly string[] };
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return { ok: true as const, value: undefined };
    },
  };
}

const VALID_SPEC: GeneratedAppSpec = {
  pages: [
    {
      id: 'home',
      name: 'Home',
      description: 'Landing page with hero and featured books',
      route: '/',
      components: ['HeroSection', 'BookGrid'],
      data_sources: ['Book'],
      viewports: [1440, 768],
    },
    {
      id: 'book-detail',
      name: 'Book Detail',
      description: 'Shows book info and reviews',
      route: '/books/:id',
      components: ['BookInfo', 'ReviewList'],
      data_sources: ['Book', 'Review'],
    },
  ],
  models: [
    {
      id: 'book',
      name: 'Book',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'author', type: 'string' },
        { name: 'created_at', type: 'datetime' },
      ],
      db_table: 'books',
    },
  ],
  endpoints: [
    {
      id: 'list-books',
      method: 'GET',
      path: '/api/books',
      description: 'List all books',
      query_params: [{ name: 'limit', type: 'number' }],
      response: { type: 'array', schema_ref: 'Book' },
      auth: 'none',
    },
  ],
};

const VALID_TOKENS: DesignTokensSpec = {
  version: '1.0',
  created_by: 'test',
  colors: {
    primitive: {
      'warm-cream': '#FFF8E7',
      'deep-teal': '#0F6E56',
      'coral-accent': '#E8593C',
      'warm-gray': '#444441',
      'soft-white': '#FAFAF8',
    },
    semantic: {
      'background-primary': 'warm-cream',
      'text-primary': 'warm-gray',
      'cta-primary': 'deep-teal',
      error: 'coral-accent',
    },
  },
  typography: {
    font_families: { display: 'Nunito', body: 'Open Sans' },
    scale: [
      { role: 'heading-1', size: 32, weight: 700, family: 'display' },
      { role: 'body', size: 14, weight: 400, family: 'body' },
    ],
  },
  spacing: { unit: 8, scale: [4, 8, 12, 16, 24, 32, 48, 64] },
  borders: { radius: { small: 8, medium: 12, large: 16, pill: 9999 } },
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
  identity: { tone: 'playful-warm', audience: 'book lovers' },
  illustration_style: { direction: 'minimal', description: 'Clean lines' },
  motion_principles: {
    page_transitions: 'fade',
    interaction_feel: 'snappy',
    easing: 'ease-out',
    duration_base_ms: 200,
  },
  accessibility: { wcag_level: 'AA' },
};

describe('parseAppSpecResponse', () => {
  it('parses valid JSON spec', () => {
    const result = parseAppSpecResponse(JSON.stringify(VALID_SPEC));

    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(2);
    expect(result!.models).toHaveLength(1);
    expect(result!.endpoints).toHaveLength(1);
    expect(result!.pages[0].name).toBe('Home');
  });

  it('handles markdown code fences', () => {
    const wrapped = '```json\n' + JSON.stringify(VALID_SPEC) + '\n```';
    const result = parseAppSpecResponse(wrapped);

    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(2);
  });

  it('returns null for empty pages', () => {
    const spec = { ...VALID_SPEC, pages: [] };
    const result = parseAppSpecResponse(JSON.stringify(spec));
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    const result = parseAppSpecResponse('not json at all');
    expect(result).toBeNull();
  });

  it('filters out pages missing required fields', () => {
    const spec = {
      ...VALID_SPEC,
      pages: [
        VALID_SPEC.pages[0],
        { id: 'bad', name: '' } as never, // missing required fields
      ],
    };
    const result = parseAppSpecResponse(JSON.stringify(spec));
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(1);
  });

  it('preserves viewports when present on pages', () => {
    const result = parseAppSpecResponse(JSON.stringify(VALID_SPEC));
    expect(result).not.toBeNull();
    expect(result!.pages[0].viewports).toEqual([1440, 768]);
  });

  it('parses pages without viewports successfully', () => {
    const result = parseAppSpecResponse(JSON.stringify(VALID_SPEC));
    expect(result).not.toBeNull();
    // Second page has no viewports
    expect(result!.pages[1].viewports).toBeUndefined();
  });

  it('returns null when all models are invalid', () => {
    const spec = {
      ...VALID_SPEC,
      models: [{ id: 'bad' } as never], // missing fields
    };
    const result = parseAppSpecResponse(JSON.stringify(spec));
    expect(result).toBeNull();
  });
});

describe('generateAppSpecPreviewHtml', () => {
  it('generates valid HTML document', () => {
    const html = generateAppSpecPreviewHtml('TestApp', VALID_SPEC, VALID_TOKENS, VALID_BRAND);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('TestApp');
    expect(html).toContain('Home');
    expect(html).toContain('Book Detail');
    expect(html).toContain('/books/:id');
  });

  it('includes design tokens in styling', () => {
    const html = generateAppSpecPreviewHtml('TestApp', VALID_SPEC, VALID_TOKENS, VALID_BRAND);

    expect(html).toContain('Nunito');
    expect(html).toContain('Open Sans');
    expect(html).toContain('#0F6E56'); // deep-teal / cta
  });

  it('includes all tabs', () => {
    const html = generateAppSpecPreviewHtml('TestApp', VALID_SPEC, VALID_TOKENS, VALID_BRAND);

    expect(html).toContain('Overview');
    expect(html).toContain('Pages (2)');
    expect(html).toContain('Models (1)');
    expect(html).toContain('API (1)');
    expect(html).toContain('User Flow');
  });

  it('includes model fields in table', () => {
    const html = generateAppSpecPreviewHtml('TestApp', VALID_SPEC, VALID_TOKENS, VALID_BRAND);

    expect(html).toContain('Book');
    expect(html).toContain('books');
    expect(html).toContain('title');
    expect(html).toContain('author');
  });

  it('includes API endpoints', () => {
    const html = generateAppSpecPreviewHtml('TestApp', VALID_SPEC, VALID_TOKENS, VALID_BRAND);

    expect(html).toContain('GET');
    expect(html).toContain('/api/books');
    expect(html).toContain('List all books');
  });

  it('includes brand info', () => {
    const html = generateAppSpecPreviewHtml('TestApp', VALID_SPEC, VALID_TOKENS, VALID_BRAND);

    expect(html).toContain('playful-warm');
    expect(html).toContain('book lovers');
  });

  it('includes component and data chips', () => {
    const html = generateAppSpecPreviewHtml('TestApp', VALID_SPEC, VALID_TOKENS, VALID_BRAND);

    expect(html).toContain('HeroSection');
    expect(html).toContain('BookGrid');
    expect(html).toContain('component-chip');
    expect(html).toContain('data-chip');
  });
});

describe('designGenerateCommand', () => {
  it('requires PRD when design tokens are missing', async () => {
    const mockFs = createMockFs();
    mockFs.files.set('/project/agentforge.yaml', 'project:\n  name: TestApp');
    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (chunk: Buffer) => { outputStr += chunk.toString(); });

    const result = await designGenerateCommand('/project', mockFs, process.stdin, output);

    expect(result).toBeNull();
    expect(outputStr).toContain('agentforge describe');
  });

  it('fails when Claude auth is not configured', async () => {
    const mockFs = createMockFs();
    const yaml = require('yaml');
    mockFs.files.set('/project/agentforge/spec/design-tokens.yaml', yaml.stringify(VALID_TOKENS));
    mockFs.files.set('/project/agentforge/spec/brand.yaml', yaml.stringify(VALID_BRAND));
    mockFs.files.set('/project/agentforge.yaml', yaml.stringify({
      project: { name: 'TestApp', description: 'A test app' },
    }));

    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (chunk: Buffer) => { outputStr += chunk.toString(); });

    // Send '1' to select a fallback design option when prompted
    const input = new PassThrough();
    setTimeout(() => input.write('1\n'), 100);

    const origKey = process.env['ANTHROPIC_API_KEY'];
    const origVertex = process.env['AGENTFORGE_USE_VERTEX'];
    const origVertexProject = process.env['ANTHROPIC_VERTEX_PROJECT_ID'];
    const origClaudeVertex = process.env['CLAUDE_CODE_USE_VERTEX'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['AGENTFORGE_USE_VERTEX'];
    delete process.env['ANTHROPIC_VERTEX_PROJECT_ID'];
    delete process.env['CLAUDE_CODE_USE_VERTEX'];

    const result = await designGenerateCommand('/project', mockFs, input, output, {
      designOptionsConfig: { mock: true, openBrowser: async () => false },
    });

    process.env['ANTHROPIC_API_KEY'] = origKey;
    if (origVertex !== undefined) process.env['AGENTFORGE_USE_VERTEX'] = origVertex;
    if (origVertexProject !== undefined) process.env['ANTHROPIC_VERTEX_PROJECT_ID'] = origVertexProject;
    if (origClaudeVertex !== undefined) process.env['CLAUDE_CODE_USE_VERTEX'] = origClaudeVertex;

    expect(result).toBeNull();
    expect(outputStr).toContain('Claude auth required');
  }, 10000);

  it('fails when project name is missing', async () => {
    const mockFs = createMockFs();
    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (chunk: Buffer) => { outputStr += chunk.toString(); });

    const result = await designGenerateCommand('/project', mockFs, process.stdin, output);

    expect(result).toBeNull();
    expect(outputStr).toContain('agentforge init');
  });
});
