/**
 * @module @agentforge/agents-ux/app-spec
 *
 * Prompt builders for LLM-driven app spec generation.
 * Merged from CLI buildSystemPrompt/buildUserPrompt and dashboard buildSpecGenerationPrompt.
 */

import type { DesignTokensSpec, BrandSpec } from '@agentforge/core';

/** Context for the user prompt. All fields optional except appName. */
export interface AppSpecPromptContext {
  readonly appName: string;
  readonly description?: string;
  readonly prdContent?: string;
  readonly designTokens?: DesignTokensSpec;
  readonly brandSpec?: BrandSpec;
  readonly projectConfig?: Record<string, unknown>;
}

/** Build the system prompt for app spec generation. */
export function buildAppSpecSystemPrompt(): string {
  return `You are a product architect and UX expert. Given an app description and its design system, generate a complete app specification with pages, data models, and API endpoints.

Respond with valid JSON wrapped in \`\`\`json\`\`\` code fences matching this exact schema:

\`\`\`json
{
  "pages": [
    {
      "id": "kebab-case-id",
      "name": "Human Readable Name",
      "description": "What this page does and its key interactions",
      "route": "/url-path",
      "screen_type": "page",
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
\`\`\`

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
- Each page MUST include a screen_type field. Allowed values: "page", "modal", "drawer", "sheet".
  - "page" (default) — full-screen views the user navigates to directly (dashboard, settings, profile, list views)
  - "modal" — centered dialog overlays for confirmation flows, focused forms, or detail views that shouldn't lose parent context
  - "drawer" — side panels that slide in from the edge for auxiliary content (notifications, filters, settings panels)
  - "sheet" — bottom-anchored panels for mobile-oriented content (share menu, action picker)
  Most screens should be "page". Only use modal/drawer/sheet when the screen is clearly auxiliary or confirmatory.
- Keep it practical — this is a real app that will be built`;
}

/** Build the user prompt with app context. */
export function buildAppSpecUserPrompt(context: AppSpecPromptContext): string {
  const sections: string[] = [];

  const appContext = context.prdContent
    ? `App: ${context.appName}\n\nPRD:\n${context.prdContent}`
    : `App: ${context.appName}\nDescription: ${context.description || 'A web application'}`;

  sections.push(`Generate a complete app specification for:\n\n${appContext}`);

  if (context.designTokens && context.brandSpec) {
    const colorNames = Object.keys(context.designTokens.colors.primitive).join(', ');
    const fonts = `${context.designTokens.typography.font_families.display} (headings) + ${context.designTokens.typography.font_families.body} (body)`;
    sections.push(`\nDesign system context:
- Brand tone: ${context.brandSpec.identity.tone}
- Target audience: ${context.brandSpec.identity.audience}
- Color palette: ${colorNames}
- Typography: ${fonts}
- WCAG level: ${context.brandSpec.accessibility.wcag_level}`);
  } else if (context.projectConfig) {
    sections.push(`\nProject configuration:\n${JSON.stringify(context.projectConfig, null, 2)}`);
    if (context.designTokens) {
      sections.push(`\nDesign tokens:\n${JSON.stringify(context.designTokens, null, 2)}`);
    }
    if (context.brandSpec) {
      sections.push(`\nBrand specification:\n${JSON.stringify(context.brandSpec, null, 2)}`);
    }
  }

  sections.push('\nGenerate all pages, data models, and API endpoints needed for this app.');
  return sections.join('');
}
