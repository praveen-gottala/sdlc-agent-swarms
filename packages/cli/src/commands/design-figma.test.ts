/**
 * @module design-figma.test
 *
 * Unit tests for the design:figma CLI command.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock findProjectRoot to return a temp dir (no .env file),
// so loadDotEnv doesn't re-set ANTHROPIC_API_KEY from the real repo.
const tmpDir = mkdtempSync(join(tmpdir(), 'figma-test-'));
jest.mock('../fs-utils.js', () => {
  const actual = jest.requireActual('../fs-utils.js') as Record<string, unknown>;
  return { ...actual, findProjectRoot: () => tmpDir };
});

import { designFigmaCommand } from './design-figma.js';

// ============================================================================
// Helpers
// ============================================================================

const createOutputStream = (): NodeJS.WritableStream & { output: string } => {
  let output = '';
  return {
    output,
    write(chunk: string | Uint8Array) {
      output += String(chunk);
      (this as { output: string }).output = output;
      return true;
    },
  } as NodeJS.WritableStream & { output: string };
};

// ============================================================================
// Tests
// ============================================================================

describe('designFigmaCommand', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    process.exitCode = undefined;
  });

  it('shows error when ANTHROPIC_API_KEY is not set', async () => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;

    const out = createOutputStream();
    await designFigmaCommand('dashboard design', out);

    expect(out.output).toContain('ANTHROPIC_API_KEY must be set');
    expect(process.exitCode).toBe(1);
  }, 15_000);

  it('displays module name derived from description', async () => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;

    const out = createOutputStream();
    await designFigmaCommand('Create a Dashboard Design', out);

    expect(out.output).toContain('create-a-dashboard-design');
  }, 15_000);

  it('uses custom module ID when provided', async () => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;

    const out = createOutputStream();
    await designFigmaCommand('test', out, { module: 'my-custom-module' });

    expect(out.output).toContain('my-custom-module');
  }, 15_000);
});
