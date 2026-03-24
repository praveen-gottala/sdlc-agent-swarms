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
  saveDesignTokens,
  saveBrandSpec,
  saveComponentLibrary,
  validateDesignTokens,
  validateBrandSpec,
} from '@agentforge/core';
import type { ComponentLibrarySpec } from '@agentforge/core';
import type { FileSystem } from '../fs-utils.js';
import { realFs } from '../fs-utils.js';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import {
  generateTailwindConfig,
  generateGlobalCss,
} from './init.js';
import {
  generateDesignOptions,
  promptOnce,
} from './generate-design-options.js';
import type { GenerateDesignResult } from './generate-design-options.js';
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
    output.write(infoMsg(`  ${i + 1}. ${p.libraryName} — ${p.description}\n`));
  });

  let choice: number | undefined;
  const maxChoice = presets.length;
  while (choice === undefined) {
    const answer = await promptOnce(input, output, `\nChoose 1-${maxChoice}: `);
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= maxChoice) {
      choice = num;
    } else {
      output.write(warnMsg(`Please enter a number from 1 to ${maxChoice}.\n`));
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
function writeDesignSystemFiles(
  rootDir: string,
  designResult: GenerateDesignResult,
  fileSystem: FileSystem,
): void {
  saveDesignTokens(rootDir, designResult.tokens, fileSystem);
  saveBrandSpec(rootDir, designResult.brand, fileSystem);

  const tailwindContent = generateTailwindConfig(designResult.tokens);
  fileSystem.writeFile(path.join(rootDir, 'tailwind.config.ts'), tailwindContent);

  const stylesDir = path.join(rootDir, 'src', 'styles');
  fileSystem.mkdir(stylesDir);
  const cssContent = generateGlobalCss(designResult.tokens);
  fileSystem.writeFile(path.join(stylesDir, 'global.css'), cssContent);
}

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
  const brandPath = path.join(rootDir, 'agentforge', 'spec', 'brand.yaml');
  const manifestResult = fileSystem.readFile(manifestPath);
  if (manifestResult.ok) {
    const lines = manifestResult.value.split('\n');
    for (const line of lines) {
      const nameMatch = line.match(/^\s*name:\s*(.+)/);
      if (nameMatch) appName = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
      const descMatch = line.match(/^\s*description:\s*(.+)/);
      if (descMatch) description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  const brandResult = fileSystem.readFile(brandPath);
  if (brandResult.ok) {
    const lines = brandResult.value.split('\n');
    for (const line of lines) {
      const audMatch = line.match(/^\s*audience:\s*(.+)/);
      if (audMatch) audience = audMatch[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }

  // Step 1: Component library selection
  await pickComponentLibrary(rootDir, input, output, fileSystem);

  // Step 2: Theme generation (LLM or fallback)
  output.write(infoMsg('\nNow let\'s pick your visual theme...\n'));
  const designResult = await generateDesignOptions(
    { appName, description, targetAudience: audience },
    input,
    output,
    config,
  );

  writeDesignSystemFiles(rootDir, designResult, fileSystem);
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
