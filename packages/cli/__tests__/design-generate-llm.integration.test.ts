/**
 * @module @agentforge/cli/__tests__/design-generate-llm.integration
 *
 * Live LLM integration tests for design:generate (Stage 1).
 * Validates that the current prompts produce navigates_to entries,
 * correct page structure, and valid cross-page navigation targets.
 *
 * These tests make REAL LLM calls — skip when no API key is available.
 * Run with: RUN_LLM_TESTS=true npx nx test cli -- --testPathPattern=design-generate-llm
 */

import { createClaudeProvider } from '@agentforge/providers';
import type { ProviderConfig } from '@agentforge/providers';
import { parseAppSpecResponse } from '../src/commands/design-generate.js';
import type { GeneratedAppSpec } from '../src/commands/design-generate.js';

// ── Helpers ──────────────────────────────────────────────────

function getProviderConfig(): ProviderConfig | null {
  if (process.env['ANTHROPIC_API_KEY']) {
    return { provider: 'anthropic', auth: { type: 'api_key', api_key: process.env['ANTHROPIC_API_KEY'] } };
  }
  if (process.env['ANTHROPIC_VERTEX_PROJECT_ID'] || process.env['CLAUDE_CODE_USE_VERTEX']) {
    return { provider: 'vertex', auth: { type: 'adc' } };
  }
  return null;
}

function buildSystemPrompt(): string {
  return `You are a product architect and UX expert. Given an app description and its design system, generate a complete app specification with pages, data models, and API endpoints.

Respond with ONLY valid JSON (no markdown, no code fences) matching this exact schema:

{
  "pages": [
    {
      "id": "kebab-case-id",
      "name": "Human Readable Name",
      "description": "What this page does and its key interactions",
      "route": "/url-path",
      "components": ["ComponentName1", "ComponentName2"],
      "data_sources": ["ModelName1", "ModelName2"],
      "viewports": [1440],
      "navigates_to": [
        { "target": "other-page-id", "trigger": "Click 'View Details' button" }
      ]
    }
  ],
  "models": [
    {
      "id": "kebab-case-id",
      "name": "PascalCaseName",
      "fields": [
        { "name": "id", "type": "string" },
        { "name": "title", "type": "string" },
        { "name": "created_at", "type": "datetime" }
      ],
      "db_table": "table_name"
    }
  ],
  "endpoints": [
    {
      "id": "kebab-case-id",
      "method": "GET",
      "path": "/api/resource",
      "description": "What this endpoint does",
      "query_params": [{ "name": "param", "type": "string" }],
      "response": { "type": "array", "schema_ref": "ModelName" },
      "auth": "none"
    }
  ]
}

Rules:
- Generate 3-6 pages that form a complete, coherent app
- Each page should have a clear purpose and list its key components
- Models should cover all data the pages need
- API endpoints should support all page data requirements
- Use RESTful conventions for endpoints
- Every model needs at minimum: id, created_at fields
- Pages should include: a landing/home page, main content pages, and detail views
- Think about the user journey — how do they flow between pages? Capture this in navigates_to
- For each page, specify navigates_to: which other pages it links to and what triggers the navigation. Use target page IDs. Navigation bars and tabs that appear on multiple pages should have consistent targets
- Component names should be descriptive (e.g., "BookCard", "SearchBar", "NavigationHeader")
- Each page MUST include viewports with ONLY [1440] (desktop). Do NOT add 768 or 390 — users will uncomment those manually if needed.
- Keep it practical — this is a real app that will be built`;
}

function buildUserPrompt(): string {
  return `Generate a complete app specification for:

App: Personal Expense Tracker
Description: A personal finance app that helps users track daily expenses, set budgets, and visualize spending patterns.

Design system context:
- Brand tone: friendly, trustworthy
- Target audience: individual users managing personal finances
- Color palette: soft-green, deep-navy, warm-white, coral-accent
- Typography: Inter (headings) + Inter (body)
- WCAG level: AA

Generate all pages, data models, and API endpoints needed for this app.`;
}

// ── Tests ────────────────────────────────────────────────────

const providerConfig = getProviderConfig();
const describeIfLLM = (providerConfig && process.env.RUN_LLM_TESTS === 'true') ? describe : describe.skip;

describeIfLLM('design:generate LLM integration (CRITICAL-1 validation)', () => {
  let spec: GeneratedAppSpec | null = null;

  beforeAll(async () => {
    const provider = createClaudeProvider('claude-sonnet-4-6', providerConfig!);
    const result = await provider.complete(
      {
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt() }],
      },
      { model: 'claude-sonnet-4-6', maxTokens: 8192, temperature: 0.7 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parseResult = parseAppSpecResponse(result.value.content);
    expect(parseResult.ok).toBe(true);
    if (parseResult.ok) spec = parseResult.value;
  }, 120_000);

  it('produces a valid app spec with pages', () => {
    expect(spec).not.toBeNull();
    expect(spec!.pages.length).toBeGreaterThanOrEqual(3);
    expect(spec!.pages.length).toBeLessThanOrEqual(8);
  });

  it('generates navigates_to entries on at least one page (CRITICAL-1)', () => {
    const pagesWithNav = spec!.pages.filter(
      p => p.navigates_to && p.navigates_to.length > 0,
    );

    console.log('\n=== CRITICAL-1 VALIDATION: navigates_to ===');
    for (const page of spec!.pages) {
      const navCount = page.navigates_to?.length ?? 0;
      console.log(`  ${page.id} (${page.name}): ${navCount} navigation targets`);
      if (page.navigates_to) {
        for (const nav of page.navigates_to) {
          console.log(`    → ${nav.target} via "${nav.trigger}"`);
        }
      }
    }
    console.log(`\n  Pages with navigates_to: ${pagesWithNav.length}/${spec!.pages.length}`);

    expect(pagesWithNav.length).toBeGreaterThan(0);
  });

  it('navigation targets reference valid page IDs', () => {
    const validIds = new Set(spec!.pages.map(p => p.id));

    for (const page of spec!.pages) {
      if (!page.navigates_to) continue;
      for (const nav of page.navigates_to) {
        expect(validIds.has(nav.target)).toBe(true);
      }
    }
  });

  it('navigation triggers are descriptive (not empty)', () => {
    for (const page of spec!.pages) {
      if (!page.navigates_to) continue;
      for (const nav of page.navigates_to) {
        expect(nav.trigger.length).toBeGreaterThan(3);
      }
    }
  });

  it('generates models and endpoints', () => {
    expect(spec!.models.length).toBeGreaterThan(0);
    expect(spec!.endpoints.length).toBeGreaterThan(0);
  });

  it('pages have viewports set to [1440]', () => {
    for (const page of spec!.pages) {
      if (page.viewports) {
        expect(page.viewports).toContain(1440);
      }
    }
  });
});
