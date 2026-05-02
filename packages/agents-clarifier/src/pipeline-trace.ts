/**
 * @module @agentforge/agents-clarifier/pipeline-trace
 *
 * File-based execution trace for the Clarifier pipeline.
 * Records every stage's input/output as JSON files with a lightweight
 * JSONL execution log for sequential reconstruction.
 *
 * Storage layout:
 *   .agentforge/clarifier/{threadId}/
 *     execution-log.jsonl
 *     qa-log.jsonl
 *     stages/
 *       000-contextRetriever-input.json
 *       000-contextRetriever-output.json
 *       ...
 */

import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PipelineStageRecord, QALogEntry } from './types.js';

function traceDir(projectRoot: string, threadId: string): string {
  return join(projectRoot, '.agentforge', 'clarifier', threadId);
}

function stagesDir(projectRoot: string, threadId: string): string {
  return join(traceDir(projectRoot, threadId), 'stages');
}

function padSeq(seq: number): string {
  return String(seq).padStart(3, '0');
}

/** Write stage input/output JSON files and append a JSONL log entry. */
export function appendStageRecord(
  projectRoot: string,
  threadId: string,
  opts: {
    readonly stageName: string;
    readonly turnNumber: number;
    readonly sequenceNumber: number;
    readonly input: unknown;
    readonly output: unknown;
  },
): void {
  const dir = stagesDir(projectRoot, threadId);
  mkdirSync(dir, { recursive: true });

  const prefix = `${padSeq(opts.sequenceNumber)}-${opts.stageName}`;
  const inputFile = `stages/${prefix}-input.json`;
  const outputFile = `stages/${prefix}-output.json`;

  writeFileSync(join(dir, `${prefix}-input.json`), JSON.stringify(opts.input, null, 2));
  writeFileSync(join(dir, `${prefix}-output.json`), JSON.stringify(opts.output, null, 2));

  const record: PipelineStageRecord = {
    stageName: opts.stageName,
    turnNumber: opts.turnNumber,
    sequenceNumber: opts.sequenceNumber,
    timestamp: new Date().toISOString(),
    threadId,
    inputFile,
    outputFile,
  };

  const logPath = join(traceDir(projectRoot, threadId), 'execution-log.jsonl');
  appendFileSync(logPath, JSON.stringify(record) + '\n');
}

/** Append Q&A entries to the qa-log.jsonl file. */
export function appendQALog(
  projectRoot: string,
  threadId: string,
  entries: readonly QALogEntry[],
): void {
  const dir = traceDir(projectRoot, threadId);
  mkdirSync(dir, { recursive: true });

  const logPath = join(dir, 'qa-log.jsonl');
  const lines = entries.map((e) => JSON.stringify(e)).join('\n');
  appendFileSync(logPath, lines + '\n');
}

/** Read all execution log entries. */
export function readExecutionLog(
  projectRoot: string,
  threadId: string,
): PipelineStageRecord[] {
  const logPath = join(traceDir(projectRoot, threadId), 'execution-log.jsonl');
  if (!existsSync(logPath)) return [];

  return readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as PipelineStageRecord);
}

/** Read all Q&A log entries. */
export function readQALog(
  projectRoot: string,
  threadId: string,
): QALogEntry[] {
  const logPath = join(traceDir(projectRoot, threadId), 'qa-log.jsonl');
  if (!existsSync(logPath)) return [];

  return readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as QALogEntry);
}

/** Read a specific stage I/O file. */
export function readStageIO(
  projectRoot: string,
  threadId: string,
  sequenceNumber: number,
  stageName: string,
  which: 'input' | 'output',
): unknown {
  const prefix = `${padSeq(sequenceNumber)}-${stageName}`;
  const filePath = join(stagesDir(projectRoot, threadId), `${prefix}-${which}.json`);
  if (!existsSync(filePath)) return undefined;

  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/** Get the last sequence number from the execution log (for resume continuity). */
export function readLastSequence(
  projectRoot: string,
  threadId: string,
): number {
  const records = readExecutionLog(projectRoot, threadId);
  if (records.length === 0) return -1;
  return records[records.length - 1]!.sequenceNumber;
}
