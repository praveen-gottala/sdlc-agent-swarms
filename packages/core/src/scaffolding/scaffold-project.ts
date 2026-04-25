/**
 * @module @agentforge/core/scaffolding/scaffold-project
 *
 * Shared project scaffolding function used by both CLI init and
 * dashboard project-creation. Creates the common project skeleton:
 * directories, agentforge.yaml, spec files, design system,
 * component catalog, tailwind/CSS, and optional PRD.
 *
 * Caller-specific extras (CLI: agent contracts, templates, trust-state;
 * dashboard: active-project prefs, error cleanup) stay in the callers.
 */

import { join } from 'node:path';
import { stringify } from 'yaml';
import type { FileSystem } from '../fs/file-system.js';
import type { ScaffoldProjectInput, ScaffoldResult } from '../types/scaffold.js';
import type { Result } from '../types/result.js';
import { Ok, Err } from '../types/result.js';
import { saveDesignTokens, saveBrandSpec, saveComponentCatalog } from '../state/design-system-reader.js';
import { loadBaseCatalog, generateProjectCatalog } from '../catalogs/index.js';
import { generateTailwindConfig, generateGlobalCss } from '../design/tailwind-generator.js';

/**
 * Scaffold a project directory with the common file set.
 *
 * Given identical input, produces byte-identical output regardless of
 * which caller (CLI or dashboard) invoked it. Each caller maps its
 * channel-specific inputs to ScaffoldProjectInput before calling.
 *
 * Returns Err on the first filesystem failure — partial writes are
 * not reported as success. The caller is responsible for cleanup.
 *
 * @param input - Pre-resolved scaffold parameters
 * @param projectDir - Absolute path to the project root directory
 * @param fs - FileSystem implementation for file I/O
 * @returns Ok with created file list, or Err on first failure
 */
export function scaffoldProject(
  input: ScaffoldProjectInput,
  projectDir: string,
  fs: FileSystem,
): Result<ScaffoldResult> {
  const created: string[] = [];

  // --- Directories ---
  const specDir = fs.mkdir(join(projectDir, 'agentforge', 'spec'));
  if (!specDir.ok) return Err(specDir.error);

  const designsDir = fs.mkdir(join(projectDir, 'agentforge', 'designs'));
  if (!designsDir.ok) return Err(designsDir.error);

  const docsDir = fs.mkdir(join(projectDir, 'docs'));
  if (!docsDir.ok) return Err(docsDir.error);

  // --- agentforge.yaml (caller-provided, written as-is) ---
  const yamlResult = fs.writeFile(join(projectDir, 'agentforge.yaml'), stringify(input.projectConfig));
  if (!yamlResult.ok) return Err(yamlResult.error);
  created.push('agentforge.yaml');

  // --- pages.yaml ---
  const pagesResult = fs.writeFile(
    join(projectDir, 'agentforge', 'spec', 'pages.yaml'),
    stringify({ version: '1.0', pages: [] }),
  );
  if (!pagesResult.ok) return Err(pagesResult.error);
  created.push('agentforge/spec/pages.yaml');

  // --- project.yaml ---
  const projectResult = fs.writeFile(
    join(projectDir, 'agentforge', 'spec', 'project.yaml'),
    stringify({
      version: '1.0',
      app: {
        name: input.name,
        description: input.description ?? '',
      },
      adrs: [],
    }),
  );
  if (!projectResult.ok) return Err(projectResult.error);
  created.push('agentforge/spec/project.yaml');

  // --- Design tokens ---
  if (input.designTokens) {
    const tokensResult = saveDesignTokens(projectDir, input.designTokens, fs);
    if (!tokensResult.ok) return Err(tokensResult.error);
    created.push('agentforge/spec/design-tokens.yaml');
  }

  // --- Brand spec ---
  if (input.brandSpec) {
    const brandResult = saveBrandSpec(projectDir, input.brandSpec, fs);
    if (!brandResult.ok) return Err(brandResult.error);
    created.push('agentforge/spec/brand.yaml');
  }

  // --- Tailwind config + globals.css ---
  const shouldGenerateTailwind = input.generateTailwind !== false && input.designTokens;
  if (shouldGenerateTailwind) {
    const tailwindContent = generateTailwindConfig(input.designTokens!);
    const twResult = fs.writeFile(join(projectDir, 'tailwind.config.ts'), tailwindContent);
    if (!twResult.ok) return Err(twResult.error);
    created.push('tailwind.config.ts');

    const stylesDirResult = fs.mkdir(join(projectDir, 'src', 'styles'));
    if (!stylesDirResult.ok) return Err(stylesDirResult.error);

    const cssContent = generateGlobalCss(input.designTokens!);
    const cssResult = fs.writeFile(join(projectDir, 'src', 'styles', 'globals.css'), cssContent);
    if (!cssResult.ok) return Err(cssResult.error);
    created.push('src/styles/globals.css');
  }

  // --- Component catalog ---
  if (input.componentLibraryId && input.designTokens) {
    const baseCatalog = input.baseCatalog ?? loadBaseCatalog();
    const projectCatalog = generateProjectCatalog(baseCatalog, input.componentLibraryId, input.designTokens);
    const catalogResult = saveComponentCatalog(projectDir, projectCatalog, fs);
    if (!catalogResult.ok) return Err(catalogResult.error);
    created.push('agentforge/spec/component-catalog.yaml');
  }

  // --- PRD ---
  if (input.prdContent?.trim()) {
    const prdResult = fs.writeFile(join(projectDir, 'docs', 'prd.md'), input.prdContent);
    if (!prdResult.ok) return Err(prdResult.error);
    created.push('docs/prd.md');
  }

  return Ok({ createdFiles: created });
}
