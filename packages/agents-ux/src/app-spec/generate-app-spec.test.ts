/**
 * Canonical tests for app spec generation (Stage 1 unification — Task 4.1).
 * Covers parseAppSpecResponse, generateAppSpec, and prompt builders.
 */

import { parseAppSpecResponse, generateAppSpec, buildAppSpecSystemPrompt, buildAppSpecUserPrompt } from './index.js';
import type { AppSpecProvider } from './index.js';

const VALID_SPEC = {
  pages: [{
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Main overview',
    route: '/dashboard',
    components: ['StatCard', 'Chart'],
    data_sources: ['Activity'],
    viewports: [1440],
    screen_type: 'page',
    navigates_to: [{ target: 'settings', trigger: 'Click Settings' }],
  }, {
    id: 'settings',
    name: 'Settings',
    description: 'User settings',
    route: '/settings',
    components: ['SettingsForm'],
    data_sources: ['User'],
    viewports: [1440],
    screen_type: 'page',
  }],
  models: [{
    id: 'user',
    name: 'User',
    fields: [{ name: 'id', type: 'string' }, { name: 'email', type: 'string' }],
    db_table: 'users',
  }],
  endpoints: [{
    id: 'get-users',
    method: 'GET',
    path: '/api/users',
    description: 'List users',
    query_params: [{ name: 'page', type: 'number' }],
    response: { type: 'array', schema_ref: 'User' },
    auth: 'bearer',
  }],
};

type ProviderResult = { ok: true; value: unknown } | { ok: false; error: unknown };

function makeProvider(responses: ProviderResult[]): AppSpecProvider & { complete: jest.Mock } {
  let callIndex = 0;
  return {
    complete: jest.fn(async () => responses[callIndex++] ?? responses[responses.length - 1]),
  };
}

function okLlmResult(spec: unknown): ProviderResult {
  return { ok: true, value: { content: JSON.stringify(spec) } };
}

function okLlmResultFenced(spec: unknown): ProviderResult {
  return { ok: true, value: { content: '```json\n' + JSON.stringify(spec) + '\n```' } };
}

// ---------------------------------------------------------------------------
// parseAppSpecResponse
// ---------------------------------------------------------------------------

describe('parseAppSpecResponse', () => {
  test('valid JSON returns Ok with parsed spec', () => {
    const result = parseAppSpecResponse(JSON.stringify(VALID_SPEC));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pages).toHaveLength(2);
      expect(result.value.models).toHaveLength(1);
      expect(result.value.endpoints).toHaveLength(1);
    }
  });

  test('strips markdown code fences', () => {
    const fenced = '```json\n' + JSON.stringify(VALID_SPEC) + '\n```';
    const result = parseAppSpecResponse(fenced);
    expect(result.ok).toBe(true);
  });

  test('returns Err(INVALID_JSON) on invalid JSON', () => {
    const result = parseAppSpecResponse('not json at all');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_JSON');
    }
  });

  test('returns Err(MISSING_REQUIRED_FIELDS) on empty pages', () => {
    const result = parseAppSpecResponse(JSON.stringify({ ...VALID_SPEC, pages: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_REQUIRED_FIELDS');
    }
  });

  test('filters pages missing required fields via Zod', () => {
    const specWithBadPage = {
      ...VALID_SPEC,
      pages: [
        ...VALID_SPEC.pages,
        { id: 'bad' }, // missing required fields — Zod will reject
      ],
    };
    // Zod schema validation will fail because the bad page is missing required fields
    // and it's in the array, so safeParse returns an error
    const result = parseAppSpecResponse(JSON.stringify(specWithBadPage));
    // Zod array validation: a bad element causes the whole array to fail
    expect(result.ok).toBe(false);
  });

  test('validates navigation targets — removes refs to non-existent pages', () => {
    const specWithBadNav = {
      ...VALID_SPEC,
      pages: [{
        ...VALID_SPEC.pages[0],
        navigates_to: [
          { target: 'settings', trigger: 'Click Settings' },
          { target: 'nonexistent', trigger: 'Click Nothing' },
        ],
      }, VALID_SPEC.pages[1]],
    };
    const result = parseAppSpecResponse(JSON.stringify(specWithBadNav));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const nav = result.value.pages[0].navigates_to;
      expect(nav).toHaveLength(1);
      expect(nav![0].target).toBe('settings');
    }
  });

  test('defaults screen_type to page', () => {
    const specNoScreenType = {
      ...VALID_SPEC,
      pages: [{ ...VALID_SPEC.pages[0], screen_type: undefined }, VALID_SPEC.pages[1]],
    };
    const result = parseAppSpecResponse(JSON.stringify(specNoScreenType));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pages[0].screen_type).toBe('page');
    }
  });
});

// ---------------------------------------------------------------------------
// generateAppSpec
// ---------------------------------------------------------------------------

describe('generateAppSpec', () => {
  test('success — mock provider returns valid JSON → Ok result', async () => {
    const provider = makeProvider([okLlmResultFenced(VALID_SPEC)]);
    const result = await generateAppSpec({
      appName: 'TestApp',
      provider,
      maxRetries: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pages).toHaveLength(2);
    }
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  test('retries on parse failure — provider.complete called 2x', async () => {
    const provider = makeProvider([
      { ok: true, value: { content: 'not json' } },
      okLlmResult(VALID_SPEC),
    ]);
    const result = await generateAppSpec({
      appName: 'TestApp',
      provider,
      maxRetries: 1,
    });
    expect(result.ok).toBe(true);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  test('returns Err after exhausting retries', async () => {
    const provider = makeProvider([
      { ok: true, value: { content: 'bad1' } },
      { ok: true, value: { content: 'bad2' } },
    ]);
    const result = await generateAppSpec({
      appName: 'TestApp',
      provider,
      maxRetries: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXHAUSTED_RETRIES');
    }
  });

  test('returns Err on provider failure', async () => {
    const provider = makeProvider([
      { ok: false, error: { message: 'No API key' } },
    ]);
    const result = await generateAppSpec({
      appName: 'TestApp',
      provider,
      maxRetries: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_ERROR');
      expect(result.error.message).toContain('No API key');
    }
  });
});

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

describe('buildAppSpecSystemPrompt', () => {
  test('includes screen_type and navigates_to rules', () => {
    const prompt = buildAppSpecSystemPrompt();
    expect(prompt).toContain('screen_type');
    expect(prompt).toContain('"page"');
    expect(prompt).toContain('"modal"');
    expect(prompt).toContain('"drawer"');
    expect(prompt).toContain('"sheet"');
    expect(prompt).toContain('navigates_to');
  });
});

describe('buildAppSpecUserPrompt', () => {
  test('includes PRD when provided', () => {
    const prompt = buildAppSpecUserPrompt({
      appName: 'TestApp',
      prdContent: 'This is a detailed PRD document with requirements.',
    });
    expect(prompt).toContain('TestApp');
    expect(prompt).toContain('This is a detailed PRD document');
  });

  test('includes design context when tokens and brand provided', () => {
    const prompt = buildAppSpecUserPrompt({
      appName: 'TestApp',
      designTokens: {
        colors: { primitive: { blue: '#0000ff', red: '#ff0000' } },
        typography: { font_families: { display: 'Inter', body: 'Roboto' } },
      } as never,
      brandSpec: {
        identity: { tone: 'Professional', audience: 'Enterprise teams' },
        accessibility: { wcag_level: 'AA' },
      } as never,
    });
    expect(prompt).toContain('blue, red');
    expect(prompt).toContain('Inter (headings)');
    expect(prompt).toContain('Roboto (body)');
    expect(prompt).toContain('Professional');
    expect(prompt).toContain('AA');
  });
});
