/**
 * P07: Schema Versioning and Migration validation tests.
 * Tests all 6 criteria from Wave 1 readiness validation.
 */

import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { Ok, Err } from '@agentforge/core';
import type { Result, FileSystem } from '@agentforge/core';
import { migrateCommand, MIGRATIONS, VERSIONED_FILES, findPendingMigrations } from './migrate.js';

/**
 * Create an in-memory FileSystem for testing.
 */
function createMockFs(files: Record<string, string> = {}): FileSystem {
  const store = new Map<string, string>(Object.entries(files));

  return {
    readFile(filePath: string): Result<string> {
      const content = store.get(filePath);
      if (content === undefined) {
        return Err({ code: 'INVALID_STATE' as const, message: `Not found: ${filePath}`, recoverable: false });
      }
      return Ok(content);
    },
    writeFile(filePath: string, content: string): Result<void> {
      store.set(filePath, content);
      return Ok(undefined);
    },
    writeFileAtomic(filePath: string, content: string): Result<void> {
      store.set(filePath, content);
      return Ok(undefined);
    },
    exists(filePath: string): boolean {
      return store.has(filePath);
    },
    mkdir(): Result<void> { return Ok(undefined); },
    rename(o: string, n: string): Result<void> {
      const c = store.get(o);
      if (!c) return Err({ code: 'INVALID_STATE' as const, message: 'not found', recoverable: false });
      store.set(n, c); store.delete(o);
      return Ok(undefined);
    },
    remove(p: string): Result<void> { store.delete(p); return Ok(undefined); },
    listDir(): Result<readonly string[]> { return Ok([]); },
    appendFile(p: string, c: string): Result<void> {
      store.set(p, (store.get(p) ?? '') + c);
      return Ok(undefined);
    },
  };
}

/** Capture output from migrateCommand */
function createOutputStream(): { stream: NodeJS.WritableStream; getOutput: () => string } {
  let output = '';
  const stream = {
    write(chunk: string) {
      output += chunk;
      return true;
    },
  } as NodeJS.WritableStream;
  return { stream, getOutput: () => output };
}

describe('P07: Schema Versioning and Migration', () => {
  describe('Criterion 1: YAML files have version fields', () => {
    it('VERSIONED_FILES includes all required YAML files', () => {
      expect(VERSIONED_FILES).toContain('agentforge.yaml');
      expect(VERSIONED_FILES).toContain('agentforge/spec/project.yaml');
      expect(VERSIONED_FILES).toContain('agentforge/spec/pages.yaml');
      expect(VERSIONED_FILES).toContain('agentforge/spec/api.yaml');
      expect(VERSIONED_FILES).toContain('agentforge/spec/models.yaml');
      expect(VERSIONED_FILES).toContain('agentforge/tasks.yaml');
      expect(VERSIONED_FILES).toContain('agentforge/learnings.yaml');
    });
  });

  describe('Criterion 2: Dry run shows changes without applying', () => {
    it('shows pending migrations without modifying files', async () => {
      const v1Data = { version: '1.0', project: { name: 'test' } };
      const fs = createMockFs({
        '/root/agentforge.yaml': stringifyYaml(v1Data),
      });

      const { stream, getOutput } = createOutputStream();
      await migrateCommand({ dry: true }, '/root', fs, stream);

      const output = getOutput();
      expect(output).toContain('v1.0');
      expect(output).toContain('v1.1');
      expect(output).toContain('Dry run');

      // File should NOT be modified
      const result = fs.readFile('/root/agentforge.yaml');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const parsed = parseYaml(result.value) as Record<string, unknown>;
        expect(parsed['version']).toBe('1.0'); // unchanged
      }
    });
  });

  describe('Criterion 3: Migration applies correctly', () => {
    it('applies v1.0 -> v1.1 migration and updates version', async () => {
      const v1Data = { version: '1.0', project: { name: 'test' } };
      const fs = createMockFs({
        '/root/agentforge.yaml': stringifyYaml(v1Data),
      });

      const { stream } = createOutputStream();
      await migrateCommand({}, '/root', fs, stream);

      const result = fs.readFile('/root/agentforge.yaml');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const parsed = parseYaml(result.value) as Record<string, unknown>;
        expect(parsed['version']).toBe('1.1');
        expect(parsed['circuit_breaker']).toBeDefined();
        expect(parsed['telemetry']).toBeDefined();
      }
    });
  });

  describe('Criterion 4: Migration is idempotent', () => {
    it('running migrate twice produces the same result', async () => {
      const v1Data = { version: '1.0', project: { name: 'test' } };
      const fs = createMockFs({
        '/root/agentforge.yaml': stringifyYaml(v1Data),
      });

      // First migration
      const { stream: s1 } = createOutputStream();
      await migrateCommand({}, '/root', fs, s1);

      const firstResult = fs.readFile('/root/agentforge.yaml');
      expect(firstResult.ok).toBe(true);

      // Second migration
      const { stream: s2, getOutput: getOutput2 } = createOutputStream();
      await migrateCommand({}, '/root', fs, s2);

      const secondResult = fs.readFile('/root/agentforge.yaml');
      expect(secondResult.ok).toBe(true);

      // Should be identical
      if (firstResult.ok && secondResult.ok) {
        expect(secondResult.value).toBe(firstResult.value);
      }

      // Output should say up to date
      expect(getOutput2()).toContain('up to date');
    });
  });

  describe('Criterion 5: New fields get sensible defaults', () => {
    it('circuit_breaker gets sensible defaults', () => {
      const migration = MIGRATIONS.find((m) => m.from === '1.0' && m.to === '1.1');
      expect(migration).toBeDefined();

      const result = migration!.transform({ version: '1.0' });

      const cb = result['circuit_breaker'] as Record<string, unknown>;
      expect(cb['max_consecutive_failures']).toBe(5);
      expect(cb['max_calls_without_progress']).toBe(5);
      expect(cb['reset_after_minutes']).toBe(5);

      const tel = result['telemetry'] as Record<string, unknown>;
      expect(tel['enabled']).toBe(false);
      expect(tel['endpoint']).toBe('');
      expect(tel['sample_rate']).toBe(1.0);
    });

    it('does not overwrite existing circuit_breaker config', () => {
      const migration = MIGRATIONS.find((m) => m.from === '1.0' && m.to === '1.1');
      const existing = {
        version: '1.0',
        circuit_breaker: { max_consecutive_failures: 10 },
      };

      const result = migration!.transform(existing);
      const cb = result['circuit_breaker'] as Record<string, unknown>;
      expect(cb['max_consecutive_failures']).toBe(10);
    });
  });

  describe('Criterion 6: No-op when no migrations pending', () => {
    it('handles no pending migrations gracefully', async () => {
      const v11Data = { version: '1.1', project: { name: 'test' } };
      const fs = createMockFs({
        '/root/agentforge.yaml': stringifyYaml(v11Data),
      });

      const { stream, getOutput } = createOutputStream();
      await migrateCommand({}, '/root', fs, stream);

      expect(getOutput()).toContain('up to date');
    });

    it('findPendingMigrations returns empty for current version', () => {
      const pending = findPendingMigrations('1.1');
      expect(pending).toHaveLength(0);
    });
  });
});
