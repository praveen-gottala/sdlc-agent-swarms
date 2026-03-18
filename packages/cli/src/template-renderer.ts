/**
 * @module @agentforge/cli/template-renderer
 *
 * Loads `.tmpl` files from the stack templates directory and renders
 * them by replacing `{{KEY}}` placeholders with provided values.
 *
 * DEVIATION: ADR-014
 * PRD v2.0 Section 16.2 specifies: each supported stack has a directory
 * of prompt templates; if a stack is missing, fall back to generic prompts.
 * Implementation: resolves stack directory dynamically via getStackTemplatesDir();
 * falls back to empty templates with a console warning for unknown stacks.
 * Rationale: see ADR-014
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Replace all `{{KEY}}` placeholders in content with values from vars.
 */
export function renderTemplate(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/**
 * Resolve the stacks root directory (parent of all stack directories).
 */
export function getStacksRoot(): string {
  return path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../stacks',
  );
}

/**
 * Resolve the path to the scaffold templates directory for a given stack.
 * Falls back to the default stack (react-node-prisma) if the requested
 * stack directory does not exist. Emits a warning to stderr on fallback.
 *
 * @param stackName - Stack directory name (e.g. "react-node-prisma"). Defaults to "react-node-prisma".
 * @returns Absolute path to the scaffold templates directory.
 */
export function getStackTemplatesDir(stackName?: string): string {
  const stacksRoot = getStacksRoot();
  const requestedStack = stackName ?? 'react-node-prisma';
  const requestedDir = path.join(stacksRoot, requestedStack, 'templates', 'scaffold');

  if (fs.existsSync(requestedDir)) {
    return requestedDir;
  }

  // Fallback: try the default stack
  if (requestedStack !== 'react-node-prisma') {
    const defaultDir = path.join(stacksRoot, 'react-node-prisma', 'templates', 'scaffold');
    if (fs.existsSync(defaultDir)) {
      process.stderr.write(
        `[agentforge] Warning: Stack "${requestedStack}" has no template directory. Falling back to react-node-prisma templates. Code generation quality may be reduced.\n`,
      );
      return defaultDir;
    }
  }

  // No templates found at all — return the requested path anyway (renderAllTemplates
  // handles missing files gracefully by skipping them).
  process.stderr.write(
    `[agentforge] Warning: No stack template directory found for "${requestedStack}". Using generic prompts (empty). Code generation quality may be reduced.\n`,
  );
  return requestedDir;
}

/**
 * Resolve the path to the scaffold templates directory.
 * Legacy API — delegates to getStackTemplatesDir() with default stack.
 */
export function getTemplatesDir(): string {
  return getStackTemplatesDir('react-node-prisma');
}

/**
 * Template file mapping: template filename -> output path relative to project root.
 */
export const TEMPLATE_MAP: Record<string, string> = {
  'package.json.tmpl': 'package.json',
  'tsconfig.json.tmpl': 'tsconfig.json',
  '.eslintrc.json.tmpl': '.eslintrc.json',
  '.prettierrc.tmpl': '.prettierrc',
  'agentforge-ci.yml.tmpl': '.github/workflows/agentforge-ci.yml',
  'tailwind.config.ts.tmpl': 'tailwind.config.ts',
  'global.css.tmpl': 'src/styles/global.css',
  '.env.example.tmpl': '.env.example',
  'prisma-schema.prisma.tmpl': 'prisma/schema.prisma',
};

/**
 * Load and render all scaffold templates. Returns a map of output path -> rendered content.
 * If the templates directory does not exist or a template file is missing, it is
 * silently skipped — this is the graceful fallback for unsupported stacks.
 */
export function renderAllTemplates(
  vars: Record<string, string>,
  templatesDir?: string,
): Map<string, string> {
  const dir = templatesDir ?? getTemplatesDir();
  const rendered = new Map<string, string>();

  for (const [templateFile, outputPath] of Object.entries(TEMPLATE_MAP)) {
    const templatePath = path.join(dir, templateFile);
    if (fs.existsSync(templatePath)) {
      const content = fs.readFileSync(templatePath, 'utf-8');
      rendered.set(outputPath, renderTemplate(content, vars));
    }
  }

  return rendered;
}
