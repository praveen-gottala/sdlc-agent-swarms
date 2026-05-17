import { execSync } from 'node:child_process';
import type { ToolDefinition } from '@agentforge/providers';

const MAX_OUTPUT_LENGTH = 4000;
const EXEC_TIMEOUT_MS = 60_000;

export const runLintDefinition: ToolDefinition = {
  name: 'run_lint',
  description: 'Run lint checks via nx. Returns linting output including any warnings or errors.',
  parameters: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: 'Optional Nx project name to lint (e.g. "core"). If omitted, runs across all projects.',
      },
    },
    required: [],
  },
};

export function executeRunLint(
  args: Record<string, unknown>,
  projectRoot: string,
): string {
  const packageName = args.packageName ? String(args.packageName) : undefined;
  const cmd = packageName
    ? `npx nx lint ${packageName}`
    : 'npx nx run-many -t lint';

  try {
    const output = execSync(cmd, {
      cwd: projectRoot,
      timeout: EXEC_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return truncate(`Lint passed.\n${output}`, MAX_OUTPUT_LENGTH);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stdout' in err) {
      const e = err as { stdout?: string; stderr?: string };
      const combined = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim();
      return truncate(`Lint failed:\n${combined}`, MAX_OUTPUT_LENGTH);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return truncate(`Lint error: ${msg}`, MAX_OUTPUT_LENGTH);
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '\n... (truncated)';
}
