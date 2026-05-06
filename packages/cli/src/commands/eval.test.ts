/**
 * Tests for the eval CLI command.
 * Mocks the eval package to avoid LLM calls.
 */

import { Writable } from 'node:stream';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

jest.mock('@agentforge/eval', () => ({
  loadScenarios: jest.fn(() => [
    { id: 'pomodoro', name: 'Pomodoro', description: 'test', rawInput: 'Build a pomodoro app', mode: 'bootstrap', maxRounds: 3, expectedBehavior: { minQuestions: 1, maxQuestions: 15, expectEscalation: false } },
  ]),
  loadScenario: jest.fn((id: string) => {
    if (id === 'pomodoro') {
      return { id: 'pomodoro', name: 'Pomodoro', description: 'test', rawInput: 'Build a pomodoro app', mode: 'bootstrap', maxRounds: 3, expectedBehavior: { minQuestions: 1, maxQuestions: 15, expectEscalation: false } };
    }
    return undefined;
  }),
  runScenario: jest.fn(async () => ({
    ok: true as const,
    value: {
      scenarioId: 'pomodoro',
      threadId: 'eval-pomodoro-123',
      totalQuestions: 7,
      roundCount: 1,
      gapOverlapRatio: 0.0,
      prdDiffBytes: null,
      prdHashEqualAcrossRounds: null,
      totalCostUsd: 0.42,
      durationMs: 5000,
    },
  })),
  createRecordingProvider: jest.fn(() => ({ name: 'replay', models: ['replay'] })),
  clearCassette: jest.fn(),
  compareToBaseline: jest.fn(() => []),
  buildReport: jest.fn(() => ({
    timestamp: '2026-05-02T10:00:00Z',
    scenarios: [],
    totalCost: { totalCostUsd: 0.42, totalInputTokens: 0, totalOutputTokens: 0, callCount: 0 },
    hasRegressions: false,
  })),
  renderMarkdown: jest.fn(() => '# Report\nAll good.'),
  renderJson: jest.fn(() => '{"scenarios":[]}'),
}));

jest.mock('@agentforge/providers', () => ({
  resolveClaudeAuth: jest.fn(() => ({ type: 'api_key', key: 'test-key' })),
  authResultToProviderConfig: jest.fn(() => ({ apiKey: 'test-key' })),
  createClaudeProvider: jest.fn(() => ({
    name: 'claude',
    models: ['claude-sonnet-4-6'],
    complete: jest.fn(),
    stream: jest.fn(),
    isAvailable: jest.fn(async () => true),
    estimateCost: jest.fn(),
  })),
}));

import { evalCommand } from './eval.js';

function captureOutput(): { stream: Writable; getOutput: () => string } {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  return { stream, getOutput: () => output };
}

describe('evalCommand', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'eval-cli-test-'));
    mkdirSync(join(rootDir, '.agentforge', 'eval'), { recursive: true });
    process.exitCode = undefined;
  });

  it('runs all scenarios and prints metrics', async () => {
    const { stream, getOutput } = captureOutput();
    await evalCommand({}, rootDir, stream);

    const out = getOutput();
    expect(out).toContain('Running scenario: pomodoro');
    expect(out).toContain('totalQuestions: 7');
    expect(out).toContain('$0.4200');
  });

  it('exits with code 1 for unknown scenario', async () => {
    const { loadScenario } = jest.requireMock('@agentforge/eval') as { loadScenario: jest.Mock };
    loadScenario.mockReturnValueOnce(undefined);

    const { stream, getOutput } = captureOutput();
    await evalCommand({ scenario: 'nonexistent' }, rootDir, stream);

    expect(getOutput()).toContain('No scenario found');
    expect(process.exitCode).toBe(1);
  });

  it('runs a specific scenario by id', async () => {
    const { stream, getOutput } = captureOutput();
    await evalCommand({ scenario: 'pomodoro' }, rootDir, stream);

    const out = getOutput();
    expect(out).toContain('Running scenario: pomodoro');
  });

  it('outputs JSON when --output json', async () => {
    const { stream, getOutput } = captureOutput();
    await evalCommand({ output: 'json' }, rootDir, stream);

    const out = getOutput();
    expect(out).toContain('{"scenarios":[]}');
  });

  it('saves baseline when --baseline flag set', async () => {
    const { stream, getOutput } = captureOutput();
    await evalCommand({ baseline: true }, rootDir, stream);

    const out = getOutput();
    expect(out).toContain('Baseline saved');
  });

  it('exits with code 1 when no auth configured', async () => {
    const { resolveClaudeAuth } = jest.requireMock('@agentforge/providers') as { resolveClaudeAuth: jest.Mock };
    resolveClaudeAuth.mockReturnValueOnce(null);

    const { stream, getOutput } = captureOutput();
    await evalCommand({}, rootDir, stream);

    expect(getOutput()).toContain('No Claude API authentication');
    expect(process.exitCode).toBe(1);
  });
});
