/**
 * @module @agentforge/cli/__tests__/backfill-navigates-to.integration
 *
 * Backfill test: calls the LLM for each stale app/fixture, generates
 * navigates_to entries, and merges them into existing pages.yaml files.
 *
 * This test WRITES to disk — it updates fixture/app pages.yaml files.
 * Run with: npx nx test cli -- --testPathPattern=backfill-navigates-to
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'yaml';
import { createClaudeProvider } from '@agentforge/providers';
import type { ProviderConfig } from '@agentforge/providers';
import { parseAppSpecResponse } from '../src/commands/design-generate.js';
import type { GeneratedPage } from '../src/commands/design-generate.js';

const ROOT = join(__dirname, '..', '..', '..');

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
  return `You are a product architect and UX expert. Given an app description and its pages, generate navigates_to entries for each page.

Respond with ONLY valid JSON (no markdown, no code fences) matching this exact schema:

{
  "pages": [
    {
      "id": "existing-page-id",
      "name": "Existing Page Name",
      "description": "What this page does",
      "route": "/existing-route",
      "components": ["ExistingComponent"],
      "data_sources": ["ExistingModel"],
      "viewports": [1440],
      "navigates_to": [
        { "target": "other-page-id", "trigger": "Click 'View Details' button" }
      ]
    }
  ],
  "models": [
    {
      "id": "placeholder",
      "name": "Placeholder",
      "fields": [{ "name": "id", "type": "string" }, { "name": "created_at", "type": "datetime" }],
      "db_table": "placeholders"
    }
  ],
  "endpoints": [
    {
      "id": "placeholder",
      "method": "GET",
      "path": "/api/placeholder",
      "description": "Placeholder",
      "query_params": [],
      "response": { "type": "object", "schema_ref": "Placeholder" },
      "auth": "none"
    }
  ]
}

Rules:
- Use the EXACT page IDs provided — do NOT invent new pages
- For each page, think about the user journey: what other pages does this page link to?
- navigates_to.target must be a valid page ID from the list
- navigates_to.trigger must describe the UI element or action that triggers navigation
- Navigation bars and tabs that appear on multiple pages should have consistent targets
- Include both direct navigation (button clicks) and contextual navigation (clicking a row, card, etc.)
- Keep all other fields (id, name, description, route, components, data_sources, viewports) EXACTLY as provided`;
}

function buildUserPrompt(appName: string, pages: readonly PageYamlEntry[]): string {
  const pageList = pages.map(p => {
    const components = (p.components ?? []).join(', ');
    return `- id: "${p.id}", name: "${p.name}", route: "${p.route}", components: [${components}]\n  description: ${p.description}`;
  }).join('\n');

  return `Generate navigates_to entries for each page in this app.

App: ${appName}

Existing pages:
${pageList}

For each page, add navigates_to entries that describe how users navigate between these pages.
Keep all existing fields exactly as-is. Only ADD navigates_to arrays.`;
}

interface PageYamlEntry {
  id: string;
  name: string;
  description: string;
  route: string;
  status?: string;
  components?: string[];
  data_sources?: string[];
  viewports?: number[];
  navigates_to?: { target: string; trigger: string; source_node?: string }[];
  [key: string]: unknown;
}

interface PagesYaml {
  version?: string;
  pages: PageYamlEntry[];
}

interface AppTarget {
  name: string;
  dir: string;
  pagesPath: string;
}

const APPS_TO_BACKFILL: AppTarget[] = [
  {
    name: 'Claim Filling',
    dir: join(ROOT, 'apps/claim-filling'),
    pagesPath: join(ROOT, 'apps/claim-filling/agentforge/spec/pages.yaml'),
  },
  {
    name: 'Claim Filling App',
    dir: join(ROOT, 'apps/claim-filling-app'),
    pagesPath: join(ROOT, 'apps/claim-filling-app/agentforge/spec/pages.yaml'),
  },
  {
    name: 'Personal Expense Tracker',
    dir: join(ROOT, 'fixtures/personal-expense-tracker'),
    pagesPath: join(ROOT, 'fixtures/personal-expense-tracker/agentforge/spec/pages.yaml'),
  },
];

const providerConfig = getProviderConfig();
const describeIfLLM = providerConfig ? describe : describe.skip;

describeIfLLM('Backfill navigates_to for stale apps', () => {
  for (const app of APPS_TO_BACKFILL) {
    describe(app.name, () => {
      let existingPages: PagesYaml;
      let llmPages: GeneratedPage[];
      let mergedCount: number;

      beforeAll(async () => {
        if (!existsSync(app.pagesPath)) {
          throw new Error(`pages.yaml not found: ${app.pagesPath}`);
        }

        const raw = readFileSync(app.pagesPath, 'utf-8');
        existingPages = yaml.parse(raw) as PagesYaml;

        // Read app name from agentforge.yaml
        const manifestPath = join(app.dir, 'agentforge.yaml');
        const manifest = yaml.parse(readFileSync(manifestPath, 'utf-8')) as {
          project?: { name?: string; description?: string };
        };
        const appName = manifest.project?.name ?? app.name;

        // Call LLM to generate navigates_to
        const provider = createClaudeProvider('claude-sonnet-4-6', providerConfig!);
        const result = await provider.complete(
          {
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(appName, existingPages.pages) }],
          },
          { model: 'claude-sonnet-4-6', maxTokens: 8192, temperature: 0.5 },
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const parsed = parseAppSpecResponse((result.value as { content: string }).content);
        expect(parsed).not.toBeNull();
        llmPages = parsed!.pages;

        // Merge navigates_to into existing pages
        const llmPageMap = new Map(llmPages.map(p => [p.id, p]));
        mergedCount = 0;

        for (const existingPage of existingPages.pages) {
          const llmPage = llmPageMap.get(existingPage.id);
          if (llmPage?.navigates_to && llmPage.navigates_to.length > 0) {
            // Only add if page doesn't already have navigates_to
            if (!existingPage.navigates_to || existingPage.navigates_to.length === 0) {
              const validPageIds = new Set(existingPages.pages.map(p => p.id));
              const validNav = llmPage.navigates_to.filter(n => validPageIds.has(n.target));
              if (validNav.length > 0) {
                existingPage.navigates_to = validNav.map(n => ({
                  target: n.target,
                  trigger: n.trigger,
                }));
                mergedCount++;
              }
            }
          }
        }

        // Write back to disk
        if (mergedCount > 0) {
          const output = yaml.stringify(existingPages, { lineWidth: 120 });
          writeFileSync(app.pagesPath, output, 'utf-8');
        }
      }, 120_000);

      it('LLM generates navigates_to for pages', () => {
        const pagesWithNav = llmPages.filter(p => p.navigates_to && p.navigates_to.length > 0);

        console.log(`\n=== ${app.name} ===`);
        console.log(`  Existing pages: ${existingPages.pages.length}`);
        console.log(`  LLM pages with navigates_to: ${pagesWithNav.length}/${llmPages.length}`);
        for (const p of llmPages) {
          if (p.navigates_to && p.navigates_to.length > 0) {
            console.log(`  ${p.id}:`);
            for (const n of p.navigates_to) {
              console.log(`    → ${n.target} via "${n.trigger}"`);
            }
          }
        }

        expect(pagesWithNav.length).toBeGreaterThan(0);
      });

      it('navigation targets reference valid page IDs', () => {
        const validIds = new Set(existingPages.pages.map(p => p.id));
        for (const p of llmPages) {
          if (!p.navigates_to) continue;
          for (const n of p.navigates_to) {
            expect(validIds.has(n.target)).toBe(true);
          }
        }
      });

      it('merged navigates_to into pages.yaml (or already backfilled)', () => {
        const alreadyHadNav = existingPages.pages.filter(
          p => p.navigates_to && p.navigates_to.length > 0,
        ).length;
        console.log(`  Pages updated: ${mergedCount}, already had navigates_to: ${alreadyHadNav}`);
        expect(mergedCount + alreadyHadNav).toBeGreaterThan(0);
      });

      it('written file is valid YAML', () => {
        const raw = readFileSync(app.pagesPath, 'utf-8');
        const parsed = yaml.parse(raw) as PagesYaml;
        expect(parsed.pages).toBeDefined();
        expect(parsed.pages.length).toBeGreaterThan(0);

        const pagesWithNav = parsed.pages.filter(
          p => p.navigates_to && p.navigates_to.length > 0,
        );
        console.log(`  Pages with navigates_to after write: ${pagesWithNav.length}/${parsed.pages.length}`);
      });
    });
  }
});
