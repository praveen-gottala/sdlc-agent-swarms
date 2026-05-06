/**
 * @module @agentforge/agents-clarifier/nodes/context-retriever
 *
 * Context Retriever node (Task 1.1).
 * Bootstrap: loads base catalog from @agentforge/core, platform constraints.
 * Evolution: reads project catalog (fallback to base) + calls all 5 RAG tools.
 * No LLM calls — pure file I/O and retrieval tool invocations.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import { loadBaseCatalog, debugLog } from '@agentforge/core';
import type { ClarifierDeps, ClarifierNodeFn } from '../deps.js';
import type { ClarifierState, ClarifierContext } from '../types.js';

const PLATFORM_CONSTRAINTS =
  'Web platform: responsive viewport (320-1440px), keyboard + pointer input, ' +
  'WCAG 2.1 AA accessibility, modern evergreen browsers, CSS Grid/Flexbox layout.';

const PROJECT_CATALOG_PATH = 'agentforge/spec/component-catalog.yaml';
const DESIGN_TOKENS_PATH = 'agentforge/spec/design-tokens.yaml';

function loadCatalogString(projectRoot: string): string {
  const projectCatalogPath = join(projectRoot, PROJECT_CATALOG_PATH);
  if (existsSync(projectCatalogPath)) {
    try {
      return readFileSync(projectCatalogPath, 'utf-8');
    } catch {
      debugLog('context-retriever: failed to read project catalog, falling back to base');
    }
  }
  return yamlStringify(loadBaseCatalog());
}

function loadDesignTokensIfAvailable(projectRoot: string): string | undefined {
  const tokensPath = join(projectRoot, DESIGN_TOKENS_PATH);
  if (!existsSync(tokensPath)) return undefined;
  try {
    return readFileSync(tokensPath, 'utf-8');
  } catch {
    debugLog('context-retriever: failed to read design tokens');
    return undefined;
  }
}

async function gatherEvolutionContext(
  state: ClarifierState,
  deps: ClarifierDeps,
): Promise<ClarifierContext> {
  const tools = deps.retrievalTools!;
  const query = state.rawInput;
  const { projectId } = deps;

  const [codeResult, docResult, designResult, repoMapResult, patternsResult] =
    await Promise.allSettled([
      tools.searchCode({ query, projectId }),
      tools.searchDocs({ query, projectId }),
      tools.searchDesigns({ query, projectId }),
      tools.getRepoMap({ tokenBudget: 2000 }),
      tools.findSimilarPatterns({ codeSnippet: query, projectId }),
    ]);

  const codeChunks: string[] = [];
  const docChunks: string[] = [];
  const designChunks: string[] = [];
  let repoMap: string | undefined;

  if (codeResult.status === 'fulfilled' && codeResult.value.ok) {
    for (const hit of codeResult.value.value.hits) {
      codeChunks.push(`${hit.chunk.filePath}:${hit.chunk.startLine}-${hit.chunk.endLine}\n${hit.chunk.content}`);
    }
  } else {
    debugLog('context-retriever: searchCode failed or returned error');
  }

  if (docResult.status === 'fulfilled' && docResult.value.ok) {
    for (const hit of docResult.value.value.hits) {
      const heading = hit.chunk.heading ? `# ${hit.chunk.heading}\n` : '';
      docChunks.push(`${hit.chunk.filePath}\n${heading}${hit.chunk.content}`);
    }
  } else {
    debugLog('context-retriever: searchDocs failed or returned error');
  }

  if (designResult.status === 'fulfilled' && designResult.value.ok) {
    for (const hit of designResult.value.value.hits) {
      designChunks.push(`screen:${hit.chunk.screenId} ${hit.chunk.filePath}\n${hit.chunk.content}`);
    }
  } else {
    debugLog('context-retriever: searchDesigns failed or returned error');
  }

  if (repoMapResult.status === 'fulfilled' && repoMapResult.value.ok) {
    repoMap = repoMapResult.value.value;
  } else {
    debugLog('context-retriever: getRepoMap failed or returned error');
  }

  if (patternsResult.status === 'fulfilled' && patternsResult.value.ok) {
    for (const hit of patternsResult.value.value.hits) {
      codeChunks.push(`[similar] ${hit.chunk.filePath}:${hit.chunk.startLine}-${hit.chunk.endLine}\n${hit.chunk.content}`);
    }
  } else {
    debugLog('context-retriever: findSimilarPatterns failed or returned error');
  }

  const catalog = loadCatalogString(deps.projectRoot);
  const tokens = loadDesignTokensIfAvailable(deps.projectRoot);

  return {
    catalog,
    platformConstraints: PLATFORM_CONSTRAINTS,
    ...(tokens ? { patternLibrary: tokens } : {}),
    ...(codeChunks.length > 0 ? { codeChunks } : {}),
    ...(docChunks.length > 0 ? { docChunks } : {}),
    ...(designChunks.length > 0 ? { designChunks } : {}),
    ...(repoMap ? { repoMap } : {}),
  };
}

/**
 * Create a Context Retriever node function for the Clarifier StateGraph.
 * Mode-dependent retrieval per vision Layer 5.
 */
export function createContextRetriever(deps: ClarifierDeps): ClarifierNodeFn {
  return async (state: ClarifierState): Promise<Partial<ClarifierState>> => {
    const _t0 = Date.now();
    debugLog(`context-retriever: ENTER mode=${state.mode} round=${state.round}`);
    if (state.mode === 'bootstrap') {
      const catalog = deps.baseCatalog ?? yamlStringify(loadBaseCatalog());
      const tokens = loadDesignTokensIfAvailable(deps.projectRoot);
      const context: ClarifierContext = {
        catalog,
        platformConstraints: PLATFORM_CONSTRAINTS,
        ...(tokens ? { patternLibrary: tokens } : {}),
      };
      debugLog(`context-retriever: EXIT bootstrap ${Date.now() - _t0}ms`);
      return { context };
    }

    if (!deps.retrievalTools) {
      debugLog(`context-retriever: EXIT no retrieval tools ${Date.now() - _t0}ms`);
      return {
        error: 'Evolution mode requires retrieval tools but none were provided',
      };
    }

    const context = await gatherEvolutionContext(state, deps);
    debugLog(`context-retriever: EXIT evolution ${Date.now() - _t0}ms`);
    return { context };
  };
}
