import { execSync } from 'node:child_process';
import type { ToolDefinition } from '@agentforge/providers';

const MAX_OUTPUT_LENGTH = 4000;
const EXEC_TIMEOUT_MS = 60_000;

export const runTypecheckDefinition: ToolDefinition = {
  name: 'run_typecheck',
  description: 'Run TypeScript type checking via nx. Returns compiler output including any errors.',
  parameters: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: 'Optional Nx project name to typecheck (e.g. "core"). If omitted, runs across all projects.',
      },
    },
    required: [],
  },
};

export function executeRunTypecheck(
  args: Record<string, unknown>,
  projectRoot: string,
): string {
  const packageName = args.packageName ? String(args.packageName) : undefined;
  const cmd = packageName
    ? `npx nx typecheck ${packageName}`
    : 'npx nx run-many -t typecheck';

  try {
    const output = execSync(cmd, {
      cwd: projectRoot,
      timeout: EXEC_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return truncate(`Typecheck passed.\n${output}`, MAX_OUTPUT_LENGTH);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stdout' in err) {
      const e = err as { stdout?: string; stderr?: string };
      const combined = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim();
      return truncate(`Typecheck failed:\n${combined}`, MAX_OUTPUT_LENGTH);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return truncate(`Typecheck error: ${msg}`, MAX_OUTPUT_LENGTH);
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '\n... (truncated)';
}
