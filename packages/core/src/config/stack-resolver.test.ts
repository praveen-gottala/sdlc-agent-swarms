/**
 * Tests for stack-resolver — resolves stack template directory
 * with fallback to empty prompts per ADR-014.
 */

import { deriveStackName, resolveStackDir, resolvePromptsDir } from './stack-resolver.js';
import type { StackConfig } from '../types/project-manifest.js';
import type { FileSystem } from '../fs/file-system.js';
import { Ok } from '../types/result.js';

// ============================================================================
// Helpers
// ============================================================================

const makeStackConfig = (overrides: Partial<StackConfig> = {}): StackConfig => ({
  frontend: 'react',
  backend: 'node',
  database: 'postgresql',
  styling: 'tailwind',
  ...overrides,
});

const makeMockFs = (existingPaths: string[]): FileSystem => ({
  readFile: jest.fn().mockReturnValue(Ok('')),
  writeFile: jest.fn().mockReturnValue(Ok(undefined)),
  writeFileAtomic: jest.fn().mockReturnValue(Ok(undefined)),
  exists: jest.fn().mockImplementation((p: string) => existingPaths.some((ep) => p.startsWith(ep))),
  mkdir: jest.fn().mockReturnValue(Ok(undefined)),
  rename: jest.fn().mockReturnValue(Ok(undefined)),
  remove: jest.fn().mockReturnValue(Ok(undefined)),
  listDir: jest.fn().mockReturnValue(Ok([])),
  appendFile: jest.fn().mockReturnValue(Ok(undefined)),
});

// ============================================================================
// Tests
// ============================================================================

describe('deriveStackName', () => {
  it('derives "react-node-prisma" from default config', () => {
    expect(deriveStackName(makeStackConfig())).toBe('react-node-prisma');
  });

  it('derives "react-node-prisma" for mysql (uses prisma ORM)', () => {
    expect(deriveStackName(makeStackConfig({ database: 'mysql' }))).toBe('react-node-prisma');
  });

  it('derives "react-node-mongoose" for mongodb', () => {
    expect(deriveStackName(makeStackConfig({ database: 'mongodb' }))).toBe('react-node-mongoose');
  });

  it('uses raw database name for unknown databases', () => {
    expect(deriveStackName(makeStackConfig({ database: 'dynamodb' }))).toBe('react-node-dynamodb');
  });
});

describe('resolveStackDir', () => {
  it('resolves existing stack directory', () => {
    const fs = makeMockFs(['/stacks/react-node-prisma']);
    const result = resolveStackDir(makeStackConfig(), '/stacks', fs);

    expect(result.isFallback).toBe(false);
    expect(result.stackDir).toBe('/stacks/react-node-prisma');
    expect(result.stackName).toBe('react-node-prisma');
    expect(result.warning).toBeUndefined();
  });

  it('returns fallback with warning for non-existent stack', () => {
    const fs = makeMockFs([]);
    const result = resolveStackDir(
      makeStackConfig({ frontend: 'vue', backend: 'django', database: 'mongodb' }),
      '/stacks',
      fs,
    );

    expect(result.isFallback).toBe(true);
    expect(result.stackDir).toBeNull();
    expect(result.stackName).toBe('vue-django-mongoose');
    expect(result.warning).toContain('vue-django-mongoose');
    expect(result.warning).toContain('generic prompts');
  });
});

describe('resolvePromptsDir', () => {
  it('resolves prompts directory for existing stack', () => {
    const fs = makeMockFs(['/stacks/react-node-prisma']);
    const result = resolvePromptsDir(makeStackConfig(), '/stacks', fs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('/stacks/react-node-prisma/prompts');
    }
  });

  it('returns Err with warning for non-existent stack (graceful fallback)', () => {
    const fs = makeMockFs([]);
    const result = resolvePromptsDir(
      makeStackConfig({ frontend: 'angular', backend: 'dotnet', database: 'dynamodb' }),
      '/stacks',
      fs,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('angular-dotnet-dynamodb');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('returns Err when stack exists but has no prompts/ directory', () => {
    // Stack dir exists but prompts/ does not
    const fs = makeMockFs(['/stacks/react-node-prisma']);
    // Override exists to only match the stack dir, not prompts subdir
    (fs.exists as jest.Mock).mockImplementation(
      (p: string) => p === '/stacks/react-node-prisma',
    );

    const result = resolvePromptsDir(makeStackConfig(), '/stacks', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('no prompts/ directory');
    }
  });
});
