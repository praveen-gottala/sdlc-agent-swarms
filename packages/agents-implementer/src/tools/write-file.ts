import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import type { ToolDefinition } from '@agentforge/providers';

export const writeFileDefinition: ToolDefinition = {
  name: 'write_file',
  description: 'Write content to a file in the project. Creates parent directories if needed. Path is relative to the project root.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to the file from project root' },
      contents: { type: 'string', description: 'The file contents to write' },
    },
    required: ['path', 'contents'],
  },
};

export function executeWriteFile(
  args: Record<string, unknown>,
  projectRoot: string,
): string {
  const filePath = String(args.path ?? '');
  const contents = String(args.contents ?? '');
  const resolved = resolve(projectRoot, filePath);
  const normalizedRel = relative(projectRoot, resolved);
  if (normalizedRel.startsWith('..')) {
    return 'Error: path traversal outside project root is not allowed.';
  }
  try {
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, contents, 'utf-8');
    return `File written: ${filePath} (${contents.length} bytes)`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error writing file: ${msg}`;
  }
}
