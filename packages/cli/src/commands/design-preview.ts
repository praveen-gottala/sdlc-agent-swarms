/**
 * @module @agentforge/cli/commands/design-preview
 *
 * The `agentforge design:preview` command.
 * Re-opens the HTML previews for the current design system and app spec
 * without regenerating anything.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadDesignTokens, loadBrandSpec } from '@agentforge/core';
import { infoMsg, errorMsg, successMsg } from '../formatter.js';
import type { FileSystem } from '../fs-utils.js';
import { readYaml, realFs } from '../fs-utils.js';
import { openInBrowser } from '../utils/open-in-browser.js';
import { generateAppSpecPreviewHtml } from '../preview/app-spec-preview.js';
import type { GeneratedAppSpec } from './design-generate.js';

/** Options for customizing behavior (e.g. in tests). */
export interface DesignPreviewConfig {
  readonly openBrowser?: (url: string) => Promise<boolean>;
}

/**
 * Open HTML previews for the current design system and app spec.
 */
export async function designPreviewCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
  config?: DesignPreviewConfig,
): Promise<void> {
  // Load design tokens and brand
  const tokensResult = loadDesignTokens(rootDir, fileSystem);
  const brandResult = loadBrandSpec(rootDir, fileSystem);

  if (!tokensResult.ok) {
    output.write(errorMsg('Design system not found. Run `agentforge design:generate` first.\n'));
    process.exitCode = 1;
    return;
  }
  if (!brandResult.ok) {
    output.write(errorMsg('Brand spec not found. Run `agentforge design:generate` first.\n'));
    process.exitCode = 1;
    return;
  }

  const tokens = tokensResult.value;
  const brand = brandResult.value;

  // Read app name
  let appName = 'App';
  const manifestResult = readYaml<{ project?: { name?: string } }>(
    path.join(rootDir, 'agentforge.yaml'),
    fileSystem,
  );
  if (manifestResult.ok) {
    appName = manifestResult.value.project?.name ?? 'App';
  }

  // Load spec files
  const pagesResult = readYaml<{ pages?: GeneratedAppSpec['pages'][number][] }>(
    path.join(rootDir, 'agentforge', 'spec', 'pages.yaml'),
    fileSystem,
  );
  const modelsResult = readYaml<{ models?: GeneratedAppSpec['models'][number][] }>(
    path.join(rootDir, 'agentforge', 'spec', 'models.yaml'),
    fileSystem,
  );
  const apiResult = readYaml<{ endpoints?: GeneratedAppSpec['endpoints'][number][] }>(
    path.join(rootDir, 'agentforge', 'spec', 'api.yaml'),
    fileSystem,
  );

  const pages = (pagesResult.ok && pagesResult.value.pages) ? pagesResult.value.pages : [];
  const models = (modelsResult.ok && modelsResult.value.models) ? modelsResult.value.models : [];
  const endpoints = (apiResult.ok && apiResult.value.endpoints) ? apiResult.value.endpoints : [];

  if (pages.length === 0 && models.length === 0 && endpoints.length === 0) {
    output.write(errorMsg('No app spec found. Run `agentforge design:generate` first.\n'));
    process.exitCode = 1;
    return;
  }

  const spec: GeneratedAppSpec = { pages, models, endpoints };

  // Generate and open HTML preview
  const html = generateAppSpecPreviewHtml(appName, spec, tokens, brand);
  const tmpFile = path.join(os.tmpdir(), `agentforge-preview-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf-8');

  const browserFn = config?.openBrowser ?? openInBrowser;
  const opened = await browserFn(`file://${tmpFile}`);

  if (opened) {
    output.write(successMsg('Preview opened in your browser.\n'));
  } else {
    output.write(errorMsg('Could not open browser.\n'));
  }

  output.write('\n');
  output.write(infoMsg(`Design system: ${Object.keys(tokens.colors.primitive).length} colors, ${tokens.typography.font_families.display}/${tokens.typography.font_families.body}\n`));
  output.write(infoMsg(`App spec: ${pages.length} pages, ${models.length} models, ${endpoints.length} endpoints\n`));
  output.write(infoMsg(`Brand: ${brand.identity.tone}\n`));
}
