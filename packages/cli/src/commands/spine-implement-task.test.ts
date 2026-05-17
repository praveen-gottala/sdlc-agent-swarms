/**
 * Tests for the bounded retry loop in spine:implement CLI command.
 * Verifies: rejected → cycle 2 → approved; escalate after max cycles.
 */

import { spineImplementCommand } from './spine-implement-task.js';

// Mock all external dependencies
jest.mock('node:fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
}));

jest.mock('@agentforge/core', () => ({
  readYaml: jest.fn().mockReturnValue({
    ok: true,
    value: {
      projectId: 'test-project',
      tasks: [
        {
          id: 'task-1',
          title: 'Test task',
          type: 'frontend',
          mode: 'NEW',
          filePaths: ['src/main.ts'],
          writeOrder: 0,
        },
      ],
    },
  }),
  createRealFs: jest.fn().mockReturnValue({}),
}));

jest.mock('@agentforge/providers', () => ({
  resolveClaudeAuth: jest.fn().mockReturnValue({ type: 'api_key', key: 'test' }),
  authResultToProviderConfig: jest.fn().mockReturnValue({}),
  createClaudeProvider: jest.fn().mockReturnValue({}),
}));

jest.mock('@agentforge/telemetry', () => ({
  createTracedProvider: jest.fn((p: unknown) => p),
  initLangfuseTracing: jest.fn(),
}));

const mockImplementerStream = jest.fn();
jest.mock('@agentforge/agents-implementer', () => ({
  runImplementerPipelineStream: (...args: unknown[]) => mockImplementerStream(...args),
}));

const mockReviewerStream = jest.fn();
jest.mock('@agentforge/agents-reviewer', () => ({
  runReviewerPipelineStream: (...args: unknown[]) => mockReviewerStream(...args),
}));

function makeImplementerEvents() {
  return (async function* () {
    yield {
      type: 'node-complete' as const,
      node: 'generateCode',
      state: { artifacts: [{ path: 'src/main.ts', action: 'created' }] },
      durationMs: 100,
    };
    yield {
      type: 'complete' as const,
      state: {
        completionReport: {
          taskId: 'task-1',
          filesWritten: ['src/main.ts'],
          interfacesExposed: [],
          patternsApplied: [],
          deviationsFromContract: [],
        },
        artifacts: [{ path: 'src/main.ts', action: 'created' }],
      },
      threadId: 'thread-1',
    };
  })();
}

function makeReviewerEvents(outcome: 'approved' | 'rejected' | 'escalated') {
  return (async function* () {
    yield {
      type: 'node-complete' as const,
      node: 'deterministicGates',
      state: { gateResults: [] },
      durationMs: 50,
    };
    yield {
      type: 'complete' as const,
      reviewResult: {
        id: 'r1',
        diffId: 'd1',
        findings: outcome === 'rejected'
          ? [{ id: 'f1', category: 'blocking', description: 'Missing check', file: 'src/main.ts', evidence: 'line 5' }]
          : [],
        assumptionViolations: [],
        outcome,
        revisionCount: 0,
      },
      threadId: 'thread-r1',
    };
  })();
}

describe('spineImplementCommand bounded retry', () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
  });

  it('completes on first cycle when reviewer approves', async () => {
    mockImplementerStream.mockReturnValue(makeImplementerEvents());
    mockReviewerStream.mockReturnValue(makeReviewerEvents('approved'));

    await spineImplementCommand('/project', {});

    expect(mockImplementerStream).toHaveBeenCalledTimes(1);
    expect(mockReviewerStream).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  it('retries on rejected then succeeds on cycle 2', async () => {
    // Cycle 0: implement → review rejects
    // Cycle 1: implement → review approves
    mockImplementerStream
      .mockReturnValueOnce(makeImplementerEvents())
      .mockReturnValueOnce(makeImplementerEvents());
    mockReviewerStream
      .mockReturnValueOnce(makeReviewerEvents('rejected'))
      .mockReturnValueOnce(makeReviewerEvents('approved'));

    await spineImplementCommand('/project', {});

    expect(mockImplementerStream).toHaveBeenCalledTimes(2);
    expect(mockReviewerStream).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBeUndefined();
  });

  it('escalates after MAX_REVISION_CYCLES rejected outcomes', async () => {
    // Cycle 0: rejected, Cycle 1: rejected, Cycle 2: rejected → escalate
    mockImplementerStream
      .mockReturnValueOnce(makeImplementerEvents())
      .mockReturnValueOnce(makeImplementerEvents())
      .mockReturnValueOnce(makeImplementerEvents());
    mockReviewerStream
      .mockReturnValueOnce(makeReviewerEvents('rejected'))
      .mockReturnValueOnce(makeReviewerEvents('rejected'))
      .mockReturnValueOnce(makeReviewerEvents('rejected'));

    await spineImplementCommand('/project', {});

    // MAX_REVISION_CYCLES = 2, so 3 implement calls (cycles 0,1,2)
    // but after cycle 2 rejection, it escalates
    expect(mockImplementerStream).toHaveBeenCalledTimes(3);
    expect(mockReviewerStream).toHaveBeenCalledTimes(3);
    expect(process.exitCode).toBe(1);
  });

  it('escalates immediately on escalated outcome', async () => {
    mockImplementerStream.mockReturnValue(makeImplementerEvents());
    mockReviewerStream.mockReturnValue(makeReviewerEvents('escalated'));

    await spineImplementCommand('/project', {});

    expect(mockImplementerStream).toHaveBeenCalledTimes(1);
    expect(mockReviewerStream).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  it('skips review when skipReview option is set', async () => {
    mockImplementerStream.mockReturnValue(makeImplementerEvents());

    await spineImplementCommand('/project', { skipReview: true });

    expect(mockImplementerStream).toHaveBeenCalledTimes(1);
    expect(mockReviewerStream).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
