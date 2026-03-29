/**
 * @module @agentforge/agents-ux/page-context-prompt
 *
 * Formats a PageContext into a structured prompt section for LLM agents.
 * Used by research, planning, and design agents to receive spec-driven
 * page data instead of free-form descriptions.
 */

import type { PageContext, PageEntry, ModelEntry, EndpointEntry } from '@agentforge/core';

/**
 * Format a PageContext into a structured prompt string for LLM consumption.
 * Includes target page details, sibling page navigation context,
 * relevant data models, and API endpoints.
 */
export function formatPageContextPrompt(ctx: PageContext): string {
  const sections: string[] = [];

  // Target page
  const tp = ctx.targetPage;
  const tpComponents = tp.components ?? [];
  const componentsList = tpComponents.length > 0
    ? tpComponents.join(', ')
    : '(none specified)';
  const dataSources = tp.data_sources && tp.data_sources.length > 0
    ? tp.data_sources.join(', ')
    : '(none)';
  sections.push(
    `\n## Target Page: ${tp.name} (${tp.route})`,
    `Required Components: ${componentsList}`,
    `Data Sources: ${dataSources}`,
    `Description: ${tp.description}`,
  );

  // All app screens (sibling context for navigation)
  if (ctx.allPages.length > 0) {
    const pageLines = ctx.allPages.map((p, i) => {
      const pageComps = p.components ?? [];
      const compCount = pageComps.length;
      return `${i + 1}. ${p.id} (${p.route}) — ${p.name}: ${p.description} [${compCount} components]`;
    });

    // Identify shared components (appear on 2+ pages)
    const componentCounts = new Map<string, number>();
    for (const page of ctx.allPages) {
      for (const comp of (page.components ?? [])) {
        componentCounts.set(comp, (componentCounts.get(comp) ?? 0) + 1);
      }
    }
    const sharedComponents = [...componentCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name, count]) => `${name} (appears on ${count} pages)`);

    sections.push(
      `\n## All App Screens`,
      ...pageLines,
    );

    if (sharedComponents.length > 0) {
      sections.push(`Shared components: ${sharedComponents.join(', ')}`);
    }
  }

  // Data models
  if (ctx.models && ctx.models.length > 0) {
    const modelLines = ctx.models.map(m => {
      const fields = m.fields.map(f => `${f.name}: ${f.type}`).join(', ');
      return `${m.name} { ${fields} }`;
    });
    sections.push(
      `\n## Data Models`,
      ...modelLines,
    );
  }

  // API endpoints
  if (ctx.apiEndpoints && ctx.apiEndpoints.length > 0) {
    const endpointLines = ctx.apiEndpoints.map(e =>
      `${e.method.toUpperCase()} ${e.path} — ${e.response.schema_ref}`,
    );
    sections.push(
      `\n## API Endpoints`,
      ...endpointLines,
    );
  }

  return sections.join('\n');
}

/**
 * Build a PageContext from the target page and full spec data.
 * Filters models and API endpoints to those relevant to the page's data_sources.
 */
export function buildPageContext(
  targetPage: PageEntry,
  allPages: readonly PageEntry[],
  models?: readonly ModelEntry[],
  apiEndpoints?: readonly EndpointEntry[],
): PageContext {
  const dataSources = new Set(targetPage.data_sources ?? []);

  // Filter models to those referenced in data_sources
  const filteredModels = models && dataSources.size > 0
    ? models.filter(m => dataSources.has(m.id) || dataSources.has(m.name))
    : undefined;

  // Filter API endpoints to those whose response schema overlaps with data_sources
  const filteredEndpoints = apiEndpoints && dataSources.size > 0
    ? apiEndpoints.filter(e => {
        const schemaRef = e.response.schema_ref.toLowerCase();
        for (const ds of dataSources) {
          if (schemaRef.includes(ds.toLowerCase())) return true;
        }
        return false;
      })
    : undefined;

  return {
    targetPage,
    allPages,
    models: filteredModels,
    apiEndpoints: filteredEndpoints,
  };
}

/**
 * Resolve a page ID or name from pages spec.
 * - Exact match on `pages[].id`
 * - Case-insensitive match on `pages[].name`
 * - Returns undefined if no match found.
 */
export function resolvePageEntry(
  pageIdOrName: string,
  pages: readonly PageEntry[],
): PageEntry | undefined {
  // Exact ID match
  const byId = pages.find(p => p.id === pageIdOrName);
  if (byId) return byId;

  // Case-insensitive name match
  const lower = pageIdOrName.toLowerCase();
  return pages.find(p => p.name.toLowerCase() === lower);
}
