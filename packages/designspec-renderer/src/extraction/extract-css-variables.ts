/**
 * @module @agentforge/designspec-renderer/extraction/extract-css-variables
 *
 * Extracts CSS custom properties from globals.css / theme files.
 * Handles both Tailwind v4 (CSS-first config with @theme inline)
 * and traditional CSS custom properties in :root / .dark blocks.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { CSSVariable, StylingApproach } from './types.js';

/** Common CSS file locations to scan for custom properties (all frameworks). */
const CSS_SEARCH_PATHS = [
  // Next.js App Router
  'src/app/globals.css',
  'src/app/global.css',
  'app/globals.css',
  'app/global.css',
  // Next.js / generic
  'src/styles/globals.css',
  'src/styles/global.css',
  'styles/globals.css',
  'styles/global.css',
  // Vite / CRA
  'src/index.css',
  'src/main.css',
  'src/App.css',
  'src/app.css',
  'index.css',
  // Remix
  'app/root.css',
  'app/styles/global.css',
  // Theme files
  'src/theme.css',
  'src/styles/theme.css',
  'src/styles/variables.css',
  'src/styles/tokens.css',
];

/** Parse CSS custom properties from a block like `:root { --foo: bar; }`. */
function parseCSSBlock(css: string, scopeSelector: string): CSSVariable[] {
  const variables: CSSVariable[] = [];
  // Match the block content for the given scope
  const pattern = new RegExp(
    scopeSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}',
    'g'
  );

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const blockContent = match[1];
    // Match individual --property: value pairs
    const propPattern = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propPattern.exec(blockContent)) !== null) {
      variables.push({
        name: `--${propMatch[1]}`,
        value: propMatch[2].trim(),
        scope: scopeSelector,
      });
    }
  }
  return variables;
}

/** Parse Tailwind v4 @theme inline block for custom color tokens. */
function parseThemeInlineBlock(css: string): CSSVariable[] {
  const variables: CSSVariable[] = [];
  const themePattern = /@theme\s+inline\s*\{([^}]+)\}/g;

  let match: RegExpExecArray | null;
  while ((match = themePattern.exec(css)) !== null) {
    const blockContent = match[1];
    const propPattern = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propPattern.exec(blockContent)) !== null) {
      variables.push({
        name: `--${propMatch[1]}`,
        value: propMatch[2].trim(),
        scope: '@theme',
      });
    }
  }
  return variables;
}

/** Find the first existing CSS file from common locations. */
function findCSSFiles(appRoot: string): string[] {
  return CSS_SEARCH_PATHS
    .map(p => join(appRoot, p))
    .filter(p => existsSync(p));
}

/**
 * Extract CSS custom properties from the application's stylesheets.
 * Scans common CSS file locations and parses :root, .dark, and @theme blocks.
 */
export function extractCSSVariables(
  appRoot: string,
  _styling: StylingApproach = 'unknown',
): Result<readonly CSSVariable[]> {
  const cssFiles = findCSSFiles(appRoot);

  if (cssFiles.length === 0) {
    return Err({
      code: 'NO_CSS_FILES',
      message: `No CSS files found in common locations within ${appRoot}`,
      recoverable: true,
    });
  }

  const allVariables: CSSVariable[] = [];

  for (const filePath of cssFiles) {
    try {
      const css = readFileSync(filePath, 'utf-8');

      // Parse @theme inline blocks (Tailwind v4)
      allVariables.push(...parseThemeInlineBlock(css));

      // Parse :root block
      allVariables.push(...parseCSSBlock(css, ':root'));

      // Parse .dark block
      allVariables.push(...parseCSSBlock(css, '.dark'));
    } catch {
      // Skip unreadable files
      continue;
    }
  }

  if (allVariables.length === 0) {
    return Err({
      code: 'NO_VARIABLES',
      message: 'No CSS custom properties found in any stylesheet',
      recoverable: true,
    });
  }

  return Ok(allVariables);
}
