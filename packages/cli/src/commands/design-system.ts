/**
 * @module @agentforge/cli/commands/design-system
 *
 * The `agentforge design-system` command group.
 * Subcommands: show, update, validate.
 *
 * Design system setup has two independent steps:
 *   1. Component Library — which React component library to use (code architecture)
 *   2. Theme — colors, fonts, brand identity (visual design, LLM-generated)
 */

import {
  loadDesignTokens,
  loadBrandSpec,
  saveComponentLibrary,
  validateDesignTokens,
  validateBrandSpec,
  loadComponentLibrary,
  loadBaseCatalog,
  generateProjectCatalog,
  saveComponentCatalog,
} from '@agentforge/core';
import type { ComponentLibrarySpec } from '@agentforge/core';
import type { FileSystem } from '../fs-utils.js';
import { readYaml, realFs } from '../fs-utils.js';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import { writeDesignSystemFiles } from '../design/design-system-writer.js';
import {
  generateDesignOptions,
} from './generate-design-options.js';
import { promptOnce } from '../utils/prompt-once.js';
import { getComponentLibraryPresets } from './component-library-presets.js';
import type { ComponentLibraryPreset } from './component-library-presets.js';
import * as path from 'node:path';

/**
 * Show the current design system configuration.
 */
export async function designSystemShowCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const tokensResult = loadDesignTokens(rootDir, fileSystem);
  const brandResult = loadBrandSpec(rootDir, fileSystem);

  if (!tokensResult.ok || !brandResult.ok) {
    const msg = !tokensResult.ok ? tokensResult.error.message : !brandResult.ok ? brandResult.error.message : '';
    output.write(warnMsg(`${msg}\n`));
    return;
  }

  const tokens = tokensResult.value;
  const brand = brandResult.value;

  output.write(infoMsg('\n=== Design System ===\n\n'));

  // Colors
  output.write(infoMsg('Colors:\n'));
  for (const [name, hex] of Object.entries(tokens.colors.primitive)) {
    output.write(infoMsg(`  ${name}: ${hex}\n`));
  }
  output.write(infoMsg('\nSemantic mappings:\n'));
  for (const [role, ref] of Object.entries(tokens.colors.semantic)) {
    output.write(infoMsg(`  ${role} → ${ref}\n`));
  }

  // Typography
  output.write(infoMsg('\nTypography:\n'));
  for (const [key, family] of Object.entries(tokens.typography.font_families)) {
    output.write(infoMsg(`  ${key}: ${family}\n`));
  }
  output.write(infoMsg('\nScale:\n'));
  for (const entry of tokens.typography.scale) {
    output.write(infoMsg(`  ${entry.role}: ${entry.size}px, weight ${entry.weight} (${entry.family})\n`));
  }

  // Spacing
  output.write(infoMsg(`\nSpacing (unit: ${tokens.spacing.unit}px): ${tokens.spacing.scale.join(', ')}\n`));

  // Brand
  output.write(infoMsg(`\nBrand tone: ${brand.identity.tone}\n`));
  output.write(infoMsg(`Audience: ${brand.identity.audience}\n`));
  output.write(infoMsg(`WCAG level: ${brand.accessibility.wcag_level}\n`));
  output.write('\n');
}

/** Config for designSystemUpdateCommand, allowing test injection. */
export interface DesignSystemUpdateConfig {
  /** Override browser opener. */
  readonly openBrowser?: (url: string) => Promise<boolean>;
  /** When true, skip LLM calls and use built-in archetypes directly. */
  readonly mock?: boolean;
}

/**
 * Prompt the user to pick a component library from the catalog.
 * Writes component-library.yaml. Returns the selected preset.
 */
export async function pickComponentLibrary(
  rootDir: string,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  fileSystem: FileSystem,
): Promise<ComponentLibraryPreset> {
  const presets = getComponentLibraryPresets();

  output.write(infoMsg('\nWhich component library will your app use?\n'));
  presets.forEach((p, i) => {
    const defaultTag = i === 0 ? ' (default)' : '';
    output.write(infoMsg(`  ${i + 1}. ${p.libraryName} — ${p.description}${defaultTag}\n`));
  });

  let choice: number | undefined;
  const maxChoice = presets.length;
  while (choice === undefined) {
    const answer = await promptOnce(
      input,
      output,
      `\nChoose 1-${maxChoice} (Enter = 1): `,
    );
    if (answer === '') {
      choice = 1;
    } else {
      const num = parseInt(answer, 10);
      if (num >= 1 && num <= maxChoice) {
        choice = num;
      } else {
        output.write(
          warnMsg(`Please enter 1–${maxChoice}, or press Enter for 1 (default).\n`),
        );
      }
    }
  }

  const selected = presets[choice - 1];

  // Write component-library.yaml
  const libSpec: ComponentLibrarySpec = {
    library_id: selected.id,
    library_name: selected.libraryName,
    install_hint: selected.installHint,
    docs_url: selected.docsUrl,
    react_mappings: selected.reactMappings,
  };
  saveComponentLibrary(rootDir, libSpec, fileSystem);

  output.write(successMsg(`\n✓ Component library: ${selected.libraryName}\n`));
  output.write(infoMsg(`  Install: ${selected.installHint}\n`));
  output.write(infoMsg(`  Docs: ${selected.docsUrl}\n`));

  return selected;
}

/**
 * Write design system output files (tokens, brand, tailwind, css).
 */

/**
 * Update the design system — two independent steps:
 *   1. Pick component library (code architecture)
 *   2. Generate theme with LLM (visual identity)
 */
export async function designSystemUpdateCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
  config?: DesignSystemUpdateConfig,
): Promise<void> {
  // Load existing project context for LLM prompt
  let appName = '';
  let description = '';
  let audience = 'general';
  const manifestPath = path.join(rootDir, 'agentforge.yaml');
  const manifestResult = readYaml<{ project?: { name?: string; description?: string } }>(manifestPath, fileSystem);
  if (manifestResult.ok && manifestResult.value.project) {
    appName = manifestResult.value.project.name ?? '';
    description = manifestResult.value.project.description ?? '';
  }
  const brandResult = loadBrandSpec(rootDir, fileSystem);
  if (brandResult.ok && brandResult.value.identity) {
    audience = brandResult.value.identity.audience ?? 'general';
  }

  // Step 1: Component library selection
  const selectedLibrary = await pickComponentLibrary(rootDir, input, output, fileSystem);

  // Step 2: Theme generation (LLM or fallback)
  output.write(infoMsg('\nNow let\'s pick your visual theme...\n'));
  const designResult = await generateDesignOptions(
    { appName, description, targetAudience: audience },
    input,
    output,
    { openBrowser: config?.openBrowser, mock: config?.mock, rootDir, fileSystem },
  );

  writeDesignSystemFiles(rootDir, designResult.tokens, designResult.brand, fileSystem);

  // Step 3: Regenerate component catalog for the selected library
  const baseCatalog = loadBaseCatalog();
  const projectCatalog = generateProjectCatalog(baseCatalog, selectedLibrary.id, designResult.tokens);
  saveComponentCatalog(rootDir, projectCatalog, fileSystem);
  output.write(successMsg('✓ Component catalog regenerated\n'));

  output.write(successMsg('\nDesign system updated.\n'));
}

/**
 * Validate the current design system files.
 */
export async function designSystemValidateCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const tokensResult = loadDesignTokens(rootDir, fileSystem);
  const brandResult = loadBrandSpec(rootDir, fileSystem);

  if (!tokensResult.ok) {
    output.write(errorMsg(`${tokensResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  if (!brandResult.ok) {
    output.write(errorMsg(`${brandResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  const tokensValidation = validateDesignTokens(tokensResult.value);
  const brandValidation = validateBrandSpec(brandResult.value);

  let hasErrors = false;

  if (!tokensValidation.ok) {
    output.write(errorMsg(`Design tokens: ${tokensValidation.error.message}\n`));
    hasErrors = true;
  } else {
    output.write(successMsg('Design tokens: valid\n'));
  }

  if (!brandValidation.ok) {
    output.write(errorMsg(`Brand spec: ${brandValidation.error.message}\n`));
    hasErrors = true;
  } else {
    output.write(successMsg('Brand spec: valid\n'));
  }

  if (hasErrors) {
    process.exitCode = 1;
  }
}

/**
 * Regenerate the project component catalog from the base catalog.
 * Reads the current design tokens and component library, then filters
 * the base catalog for the configured library.
 */
export async function designSystemRegenerateCatalogCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  // Load design tokens — required
  const tokensResult = loadDesignTokens(rootDir, fileSystem);
  if (!tokensResult.ok) {
    output.write(errorMsg(`${tokensResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  // Load component library — required
  const libResult = loadComponentLibrary(rootDir, fileSystem);
  if (!libResult.ok) {
    output.write(errorMsg(`${libResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  // Generate filtered catalog
  const baseCatalog = loadBaseCatalog();
  const projectCatalog = generateProjectCatalog(baseCatalog, libResult.value.library_id, tokensResult.value);
  saveComponentCatalog(rootDir, projectCatalog, fileSystem);

  const componentCount = Object.keys(projectCatalog.components).length;
  output.write(successMsg(`✓ Component catalog regenerated (${componentCount} components for ${libResult.value.library_name})\n`));
}
