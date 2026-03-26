import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DesignSpecV2, RendererTokens, CatalogMap } from '../index.js';
import { SAMPLE_TOKENS } from './design-tokens.js';
import { V2_BUILTIN_CATALOG } from './catalog-entries.js';

export interface FixtureBundle {
  spec: DesignSpecV2;
  tokens: RendererTokens;
  catalog: CatalogMap;
}

/**
 * Load a JSON fixture by name and bundle it with the default tokens + catalog.
 * Generic fixtures (settings-form, dashboard-detail) live in src/__fixtures__/.
 * @param name - fixture file name without .json extension (e.g. 'settings-form')
 */
export function loadFixture(name: string): FixtureBundle {
  const specPath = join(__dirname, `${name}.json`);
  const spec: DesignSpecV2 = JSON.parse(readFileSync(specPath, 'utf-8'));
  return { spec, tokens: SAMPLE_TOKENS, catalog: V2_BUILTIN_CATALOG };
}
