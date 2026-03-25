/**
 * @module @agentforge/core/catalogs
 *
 * Framework-level base component catalog and project catalog generation.
 * The base catalog is a read-only asset bundled with the package containing
 * library mappings for all supported component libraries.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { ComponentCatalogSpec } from '../types/design-system.js';

/**
 * Resolve the directory containing this module.
 * Works in both ESM (import.meta.url) and CJS (__dirname) contexts.
 */
function getCatalogDir(): string {
  // When running under CJS (e.g., Jest with SWC), __dirname is defined
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // ESM path: use import.meta.url
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Load the framework-level base component catalog.
 * This YAML asset is bundled with @agentforge/core and contains
 * library mappings for all supported libraries (shadcn, mui, chakra, etc.).
 *
 * @returns The parsed ComponentCatalogSpec with all library mappings
 */
export function loadBaseCatalog(): ComponentCatalogSpec {
  const raw = readFileSync(join(getCatalogDir(), 'base-component-catalog.yaml'), 'utf-8');
  return parseYaml(raw) as ComponentCatalogSpec;
}

export { generateProjectCatalog } from './generate-project-catalog.js';
