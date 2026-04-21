/**
 * @module @agentforge/agents-ux/ux-import/source-to-designspec
 *
 * Phase 2: Read page source code + call Claude with SUBMIT_DESIGN_TOOL
 * to produce a DesignSpec V2 JSON for each page.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import { SUBMIT_DESIGN_TOOL } from '@agentforge/designspec-renderer';
import type { RouteInfo, CSSVariable, ComponentLibraryId, StylingApproach } from '@agentforge/designspec-renderer';
import {
  buildComponentMappingSection,
  buildStylingMappingSection,
  buildColorTokenSection,
  buildTypographySection,
} from './prompt-sections.js';

/** LLM provider interface — matches the Anthropic Messages API shape. */
export interface LLMProvider {
  callWithTool(
    systemPrompt: string,
    userMessage: string,
    tool: { name: string; description: string; parameters: Record<string, unknown> },
  ): Promise<LLMToolResult>;
}

export interface LLMToolResult {
  readonly ok: boolean;
  readonly spec?: DesignSpecV2;
  readonly error?: string;
  readonly usage?: { input_tokens: number; output_tokens: number };
}

/** Options for source-to-designspec conversion. */
export interface ImportOptions {
  readonly appRoot: string;
  readonly width?: number;
  readonly maxSourceChars?: number;
  readonly componentLibrary?: ComponentLibraryId;
  readonly styling?: StylingApproach;
}

/** Result of converting a single page. */
export interface PageImportResult {
  readonly route: RouteInfo;
  readonly spec: DesignSpecV2 | null;
  readonly error?: string;
  readonly sourceFiles: readonly string[];
}

// ─── Prompt Template ─────────────────────────────────────

let cachedPromptTemplate: string | null = null;

function loadPromptTemplate(): string {
  if (cachedPromptTemplate) return cachedPromptTemplate;

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(currentDir, '..', 'prompts', 'ux-import-system.md'),
    join(currentDir, '..', '..', 'src', 'prompts', 'ux-import-system.md'),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      cachedPromptTemplate = readFileSync(p, 'utf-8');
      return cachedPromptTemplate;
    }
  }

  throw new Error(`Import prompt template not found at ${candidates.join(', ')}`);
}

// ─── Source File Collection ──────────────────────────────

/** Resolve local import paths relative to a file. */
function resolveImportPath(importPath: string, fromFile: string, appRoot: string): string | null {
  // Handle @/ alias (common in Next.js/Vite)
  let resolved: string;
  if (importPath.startsWith('@/')) {
    const srcDir = existsSync(join(appRoot, 'src')) ? join(appRoot, 'src') : appRoot;
    resolved = join(srcDir, importPath.slice(2));
  } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
    resolved = resolve(dirname(fromFile), importPath);
  } else {
    // External package — skip
    return null;
  }

  // Try common extensions
  const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];
  for (const ext of extensions) {
    const fullPath = resolved.endsWith(ext) ? resolved : resolved + ext;
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

/** Extract import paths from source code. */
function extractImports(source: string): string[] {
  const pattern = /from\s+["']([^"']+)["']/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

/**
 * Collect the page component source + all locally imported component sources.
 * Caps at maxChars to fit in LLM context.
 */
export function collectPageSource(
  pageFilePath: string,
  appRoot: string,
  maxChars: number = 30_000,
): { content: string; files: string[] } {
  const absPagePath = join(appRoot, pageFilePath);
  if (!existsSync(absPagePath)) {
    return { content: '', files: [] };
  }

  const collected = new Map<string, string>();
  const queue = [absPagePath];
  let totalChars = 0;

  while (queue.length > 0 && totalChars < maxChars) {
    const filePath = queue.shift()!;
    if (collected.has(filePath)) continue;

    let source: string;
    try {
      source = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Skip if adding this file would exceed the limit
    if (totalChars + source.length > maxChars && collected.size > 0) continue;

    collected.set(filePath, source);
    totalChars += source.length;

    // Extract and resolve local imports (only follow first 2 levels)
    const imports = extractImports(source);
    for (const imp of imports) {
      const resolved = resolveImportPath(imp, filePath, appRoot);
      if (resolved && !collected.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  // Format as a labeled source block
  const parts: string[] = [];
  for (const [filePath, source] of collected) {
    const relPath = filePath.replace(appRoot + '/', '');
    parts.push(`### File: ${relPath}\n\`\`\`tsx\n${source}\n\`\`\``);
  }

  return {
    content: parts.join('\n\n'),
    files: Array.from(collected.keys()).map(f => f.replace(appRoot + '/', '')),
  };
}

// ─── Prompt Building ─────────────────────────────────────

/** Build the token context string from CSS variables. */
function buildTokenContext(cssVars: readonly CSSVariable[]): string {
  const rootVars = cssVars.filter(v => v.scope === ':root');
  if (rootVars.length === 0) return 'No design tokens available.';

  const lines = rootVars
    .filter(v => !v.name.startsWith('--color-') && !v.name.startsWith('--radius') && !v.name.startsWith('--font-'))
    .map(v => `${v.name}: ${v.value}`)
    .join('\n');

  return `CSS Custom Properties (from :root):\n\`\`\`css\n${lines}\n\`\`\``;
}

/** Build the full system prompt for a page with library-specific sections. */
export function buildImportPrompt(
  sourceCode: string,
  cssVars: readonly CSSVariable[],
  library: ComponentLibraryId = 'shadcn',
  styling: StylingApproach = 'tailwind-v4',
): string {
  const template = loadPromptTemplate();
  return template
    .replace('{{SOURCE_CODE}}', sourceCode)
    .replace('{{DESIGN_TOKENS}}', buildTokenContext(cssVars))
    .replace('{{COMPONENT_MAPPING}}', buildComponentMappingSection(library))
    .replace('{{STYLING_MAPPING}}', buildStylingMappingSection(styling, library))
    .replace('{{COLOR_TOKEN_MAPPING}}', buildColorTokenSection(styling, library))
    .replace('{{TYPOGRAPHY_MAPPING}}', buildTypographySection(styling, library));
}

// ─── Main Conversion ─────────────────────────────────────

/**
 * Convert a single page from source code to DesignSpec V2.
 * Reads the page component + imports, builds the prompt, and calls the LLM.
 */
export async function convertPageToDesignSpec(
  route: RouteInfo,
  provider: LLMProvider,
  cssVars: readonly CSSVariable[],
  options: ImportOptions,
): Promise<PageImportResult> {
  const {
    appRoot, width = 1440, maxSourceChars = 30_000,
    componentLibrary = 'shadcn', styling = 'tailwind-v4',
  } = options;

  // Collect source code
  const { content: sourceCode, files } = collectPageSource(
    route.filePath,
    appRoot,
    maxSourceChars,
  );

  if (!sourceCode) {
    return {
      route,
      spec: null,
      error: `Could not read page source at ${route.filePath}`,
      sourceFiles: [],
    };
  }

  // Build prompt with library-specific sections
  const systemPrompt = buildImportPrompt(sourceCode, cssVars, componentLibrary, styling);
  const userMessage = `Generate a DesignSpec v2 JSON for the "${route.name}" page (route: ${route.route}, width: ${width}px). Use the submit_design tool to provide the complete specification.`;

  // Call LLM
  const result = await provider.callWithTool(
    systemPrompt,
    userMessage,
    {
      name: SUBMIT_DESIGN_TOOL.name,
      description: SUBMIT_DESIGN_TOOL.description,
      parameters: SUBMIT_DESIGN_TOOL.parameters as Record<string, unknown>,
    },
  );

  if (!result.ok || !result.spec) {
    return {
      route,
      spec: null,
      error: result.error ?? 'LLM did not return a valid DesignSpec',
      sourceFiles: files,
    };
  }

  return {
    route,
    spec: result.spec,
    sourceFiles: files,
  };
}

/**
 * Convert all discovered routes to DesignSpec V2 JSON.
 * Processes pages sequentially to avoid rate limiting.
 */
export async function convertAllPages(
  routes: readonly RouteInfo[],
  provider: LLMProvider,
  cssVars: readonly CSSVariable[],
  options: ImportOptions,
): Promise<readonly PageImportResult[]> {
  const results: PageImportResult[] = [];

  for (const route of routes) {
    const result = await convertPageToDesignSpec(route, provider, cssVars, options);
    results.push(result);
  }

  return results;
}
