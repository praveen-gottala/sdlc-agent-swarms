/**
 * @module @agentforge/cli/template-renderer
 *
 * Loads `.tmpl` files from the stack templates directory and renders
 * them by replacing `{{KEY}}` placeholders with provided values.
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
 * Resolve the path to the scaffold templates directory.
 */
export function getTemplatesDir(): string {
  // Resolve relative to this file's location in the monorepo
  return path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../stacks/react-node-prisma/templates/scaffold',
  );
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
