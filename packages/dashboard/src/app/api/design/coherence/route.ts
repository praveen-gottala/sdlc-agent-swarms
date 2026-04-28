import { NextResponse } from 'next/server';
import { readDesignSpecText } from '@agentforge/core';
import { readYamlFile, getActiveProjectRoot } from '../../_lib/project-reader';
import { checkCoherence, type CoherenceResult, type PageInfo } from '../../../../lib/design/coherence-check';

interface PageEntry {
  id: string;
  name: string;
  route: string;
  designStatus?: string;
}

interface PagesFile {
  pages: PageEntry[];
}

interface ModelField {
  name: string;
}

interface ModelEntry {
  name: string;
  fields: ModelField[];
}

interface ModelsFile {
  models: ModelEntry[];
}

/**
 * GET /api/design/coherence
 *
 * Runs zero-LLM-cost coherence checks across all approved/rendered designs.
 * Returns navigation wiring gaps and data model field coverage.
 */
export async function GET() {
  const warnings: string[] = [];

  // 1. Load pages
  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  if (!pagesFile?.pages?.length) {
    return NextResponse.json({ results: [], warnings: ['No pages found in spec.'] });
  }

  // 2. Filter to pages with designs (approved or rendered)
  const designedPages = pagesFile.pages.filter(
    (p) => p.designStatus === 'approved' || p.designStatus === 'rendered',
  );

  if (designedPages.length === 0) {
    return NextResponse.json({
      results: [],
      warnings: ['No pages with approved or rendered designs found.'],
    });
  }

  // 3. Build all-pages list for navigation cross-check
  const allPages: PageInfo[] = pagesFile.pages.map((p) => ({
    id: p.id,
    name: p.name ?? '',
    route: p.route ?? '',
  }));

  // 4. Load models (optional — empty array if missing)
  const modelsFile = readYamlFile<ModelsFile>('agentforge/spec/models.yaml');
  const models = modelsFile?.models ?? [];
  if (!modelsFile) {
    warnings.push('models.yaml not found — skipping data field coverage checks.');
  }

  // 5. Load each design and run coherence checks
  const results: CoherenceResult[] = [];

  for (const page of designedPages) {
    const designText = readDesignSpecText(getActiveProjectRoot(), page.id);
    if (!designText) {
      warnings.push(`Design file missing for page "${page.name}" (${page.id}).`);
      continue;
    }

    let designSpec: { nodes?: Record<string, unknown> };
    try {
      designSpec = JSON.parse(designText);
    } catch {
      warnings.push(`Design file corrupt for page "${page.name}" (${page.id}).`);
      continue;
    }

    const nodes = designSpec.nodes ?? {};
    const result = checkCoherence(
      page.id,
      page.name ?? page.id,
      nodes as Record<string, any>,
      allPages,
      models,
    );
    results.push(result);
  }

  return NextResponse.json({ results, warnings });
}
