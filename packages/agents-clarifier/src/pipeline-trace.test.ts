/**
 * Pipeline execution trace tests.
 * Scope: file I/O round-trip, JSONL append/read, sequence continuity,
 * directory auto-creation.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendStageRecord,
  appendQALog,
  readExecutionLog,
  readQALog,
  readStageIO,
  readLastSequence,
} from './pipeline-trace.js';
import type { QALogEntry } from './types.js';

let tmpDir: string;
const THREAD_ID = 'test-thread-001';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'clarifier-trace-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('appendStageRecord + readExecutionLog', () => {
  it('writes stage I/O files and appends log entry', () => {
    appendStageRecord(tmpDir, THREAD_ID, {
      stageName: 'contextRetriever',
      turnNumber: 0,
      sequenceNumber: 0,
      input: { rawInput: 'build a timer app' },
      output: { context: { catalog: 'base' } },
    });

    const log = readExecutionLog(tmpDir, THREAD_ID);
    expect(log).toHaveLength(1);
    expect(log[0]!.stageName).toBe('contextRetriever');
    expect(log[0]!.sequenceNumber).toBe(0);
    expect(log[0]!.turnNumber).toBe(0);
    expect(log[0]!.threadId).toBe(THREAD_ID);
    expect(log[0]!.inputFile).toBe('stages/000-contextRetriever-input.json');
    expect(log[0]!.outputFile).toBe('stages/000-contextRetriever-output.json');
  });

  it('appends multiple entries sequentially', () => {
    appendStageRecord(tmpDir, THREAD_ID, {
      stageName: 'contextRetriever',
      turnNumber: 0,
      sequenceNumber: 0,
      input: {},
      output: { context: {} },
    });
    appendStageRecord(tmpDir, THREAD_ID, {
      stageName: 'prdAnalyzer',
      turnNumber: 0,
      sequenceNumber: 1,
      input: { context: {} },
      output: { prdDraft: { id: 'prd-001' } },
    });

    const log = readExecutionLog(tmpDir, THREAD_ID);
    expect(log).toHaveLength(2);
    expect(log[0]!.stageName).toBe('contextRetriever');
    expect(log[1]!.stageName).toBe('prdAnalyzer');
    expect(log[1]!.sequenceNumber).toBe(1);
  });

  it('returns empty array when log does not exist', () => {
    const log = readExecutionLog(tmpDir, 'nonexistent-thread');
    expect(log).toEqual([]);
  });
});

describe('readStageIO', () => {
  it('reads full input/output JSON files', () => {
    const input = { rawInput: 'test', mode: 'bootstrap' };
    const output = { context: { catalog: 'yaml content' } };

    appendStageRecord(tmpDir, THREAD_ID, {
      stageName: 'contextRetriever',
      turnNumber: 0,
      sequenceNumber: 0,
      input,
      output,
    });

    const readInput = readStageIO(tmpDir, THREAD_ID, 0, 'contextRetriever', 'input');
    expect(readInput).toEqual(input);

    const readOutput = readStageIO(tmpDir, THREAD_ID, 0, 'contextRetriever', 'output');
    expect(readOutput).toEqual(output);
  });

  it('returns undefined for missing files', () => {
    const result = readStageIO(tmpDir, THREAD_ID, 99, 'missing', 'input');
    expect(result).toBeUndefined();
  });
});

describe('readLastSequence', () => {
  it('returns last sequence number', () => {
    appendStageRecord(tmpDir, THREAD_ID, {
      stageName: 'a', turnNumber: 0, sequenceNumber: 0, input: {}, output: {},
    });
    appendStageRecord(tmpDir, THREAD_ID, {
      stageName: 'b', turnNumber: 0, sequenceNumber: 1, input: {}, output: {},
    });
    appendStageRecord(tmpDir, THREAD_ID, {
      stageName: 'c', turnNumber: 0, sequenceNumber: 2, input: {}, output: {},
    });

    expect(readLastSequence(tmpDir, THREAD_ID)).toBe(2);
  });

  it('returns -1 when no records exist', () => {
    expect(readLastSequence(tmpDir, 'empty-thread')).toBe(-1);
  });
});

describe('appendQALog + readQALog', () => {
  it('writes and reads Q&A entries', () => {
    const entries: QALogEntry[] = [
      {
        timestamp: '2026-05-02T10:00:00Z',
        threadId: THREAD_ID,
        round: 0,
        questionId: 'q-0-0',
        gapId: 'gap-001',
        topic: 'Authentication',
        questionText: 'Do you need user authentication?',
        questionType: 'multiple-choice',
        answer: 'Yes, basic email/password',
        selectedOption: 'Email/password',
        optionCount: 3,
        evpiScore: 0.8,
      },
      {
        timestamp: '2026-05-02T10:00:01Z',
        threadId: THREAD_ID,
        round: 0,
        questionId: 'q-0-1',
        gapId: 'gap-002',
        questionText: 'What platform?',
        questionType: 'open',
        answer: 'Web only',
        evpiScore: 0.6,
      },
    ];

    appendQALog(tmpDir, THREAD_ID, entries);

    const read = readQALog(tmpDir, THREAD_ID);
    expect(read).toHaveLength(2);
    expect(read[0]!.questionId).toBe('q-0-0');
    expect(read[0]!.selectedOption).toBe('Email/password');
    expect(read[1]!.questionType).toBe('open');
  });

  it('appends across multiple calls', () => {
    const round0: QALogEntry[] = [{
      timestamp: '2026-05-02T10:00:00Z',
      threadId: THREAD_ID,
      round: 0,
      questionId: 'q-0-0',
      gapId: 'gap-001',
      questionText: 'Question 1?',
      questionType: 'open',
      answer: 'Answer 1',
      evpiScore: 0.5,
    }];

    const round1: QALogEntry[] = [{
      timestamp: '2026-05-02T10:01:00Z',
      threadId: THREAD_ID,
      round: 1,
      questionId: 'q-1-0',
      gapId: 'gap-003',
      questionText: 'Question 2?',
      questionType: 'open',
      answer: 'Answer 2',
      evpiScore: 0.6,
    }];

    appendQALog(tmpDir, THREAD_ID, round0);
    appendQALog(tmpDir, THREAD_ID, round1);

    const read = readQALog(tmpDir, THREAD_ID);
    expect(read).toHaveLength(2);
    expect(read[0]!.round).toBe(0);
    expect(read[1]!.round).toBe(1);
  });

  it('returns empty array when log does not exist', () => {
    const log = readQALog(tmpDir, 'nonexistent-thread');
    expect(log).toEqual([]);
  });
});

describe('directory auto-creation', () => {
  it('creates nested directories on first write', () => {
    const deepProject = join(tmpDir, 'deep', 'nested', 'project');
    appendStageRecord(deepProject, 'new-thread', {
      stageName: 'test',
      turnNumber: 0,
      sequenceNumber: 0,
      input: {},
      output: {},
    });

    const log = readExecutionLog(deepProject, 'new-thread');
    expect(log).toHaveLength(1);
  });
});
