import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { ToolDefinition } from '@agentforge/providers';

export const applyPatchDefinition: ToolDefinition = {
  name: 'apply_patch',
  description: 'Apply a unified diff patch to an existing file. If the patch cannot be applied cleanly, the original file is unchanged.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to the file from project root' },
      patch: { type: 'string', description: 'Unified diff content to apply' },
    },
    required: ['path', 'patch'],
  },
};

export function executeApplyPatch(
  args: Record<string, unknown>,
  projectRoot: string,
): string {
  const filePath = String(args.path ?? '');
  const patch = String(args.patch ?? '');
  const resolved = resolve(projectRoot, filePath);
  const normalizedRel = relative(projectRoot, resolved);
  if (normalizedRel.startsWith('..')) {
    return 'Error: path traversal outside project root is not allowed.';
  }

  try {
    const original = readFileSync(resolved, 'utf-8');
    const result = applyUnifiedDiff(original, patch);
    if (result === null) {
      return 'Error: patch could not be applied cleanly. File unchanged.';
    }
    writeFileSync(resolved, result, 'utf-8');
    return `Patch applied to ${filePath}`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error applying patch: ${msg}`;
  }
}

function applyUnifiedDiff(original: string, patch: string): string | null {
  const lines = original.split('\n');
  const patchLines = patch.split('\n');
  const result = [...lines];
  let offset = 0;

  for (let i = 0; i < patchLines.length; i++) {
    const hunkMatch = patchLines[i].match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (!hunkMatch) continue;

    const origStart = parseInt(hunkMatch[1], 10) - 1;
    let pos = origStart + offset;
    i++;

    while (i < patchLines.length && !patchLines[i].startsWith('@@')) {
      const line = patchLines[i];
      if (line.startsWith('-')) {
        if (pos < result.length) {
          result.splice(pos, 1);
          offset--;
        }
      } else if (line.startsWith('+')) {
        result.splice(pos, 0, line.slice(1));
        pos++;
        offset++;
      } else if (line.startsWith(' ') || line === '') {
        pos++;
      }
      i++;
    }
    i--;
  }

  return result.join('\n');
}
