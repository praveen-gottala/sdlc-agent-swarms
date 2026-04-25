/**
 * @module @agentforge/cli/design/design-system-writer
 *
 * Consolidated writer for design system files. Replaces duplicated 4-step
 * write sequences in init, design-generate, and design-system commands.
 */

import * as path from 'node:path';
import type { DesignTokensSpec, BrandSpec, FileSystem } from '@agentforge/core';
import { saveDesignTokens, saveBrandSpec, generateTailwindConfig, generateGlobalCss } from '@agentforge/core';

/**
 * Write all design system output files:
 * - agentforge/spec/design-tokens.yaml
 * - agentforge/spec/brand.yaml
 * - tailwind.config.ts
 * - src/styles/globals.css
 */
export function writeDesignSystemFiles(
  rootDir: string,
  tokens: DesignTokensSpec,
  brand: BrandSpec,
  fileSystem: FileSystem,
): void {
  saveDesignTokens(rootDir, tokens, fileSystem);
  saveBrandSpec(rootDir, brand, fileSystem);

  const tailwindContent = generateTailwindConfig(tokens);
  fileSystem.writeFile(path.join(rootDir, 'tailwind.config.ts'), tailwindContent);

  const stylesDir = path.join(rootDir, 'src', 'styles');
  fileSystem.mkdir(stylesDir);
  const cssContent = generateGlobalCss(tokens);
  fileSystem.writeFile(path.join(stylesDir, 'globals.css'), cssContent);
}
