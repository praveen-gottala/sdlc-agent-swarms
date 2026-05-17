import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { ToolDefinition } from '@agentforge/providers';

export const readFileDefinition: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file in the project. Path is relative to the project root.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to the file from project root' },
    },
    required: ['path'],
  },
};

export function executeReadFile(
  args: Record<string, unknown>,
  projectRoot: string,
): string {
  const filePath = String(args.path ?? '');
  const resolved = resolve(projectRoot, filePath);
  const normalizedRel = relative(projectRoot, resolved);
  if (normalizedRel.startsWith('..')) {
    return 'Error: path traversal outside project root is not allowed.';
  }
  try {
    return readFileSync(resolved, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error reading file: ${msg}`;
  }
}
