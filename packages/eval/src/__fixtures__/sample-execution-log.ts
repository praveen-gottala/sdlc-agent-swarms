import type { PipelineStageRecord } from '@agentforge/agents-clarifier';

export const SAMPLE_EXECUTION_LOG: PipelineStageRecord[] = [
  { stageName: 'contextRetriever', turnNumber: 0, sequenceNumber: 0, timestamp: '2026-05-02T10:00:00Z', threadId: 'test-thread', inputFile: 'stages/000-contextRetriever-input.json', outputFile: 'stages/000-contextRetriever-output.json' },
  { stageName: 'prdAnalyzer', turnNumber: 0, sequenceNumber: 1, timestamp: '2026-05-02T10:00:01Z', threadId: 'test-thread', inputFile: 'stages/001-prdAnalyzer-input.json', outputFile: 'stages/001-prdAnalyzer-output.json' },
  { stageName: 'gapDetector', turnNumber: 1, sequenceNumber: 2, timestamp: '2026-05-02T10:00:02Z', threadId: 'test-thread', inputFile: 'stages/002-gapDetector-input.json', outputFile: 'stages/002-gapDetector-output.json' },
  { stageName: 'questionPrioritizer', turnNumber: 1, sequenceNumber: 3, timestamp: '2026-05-02T10:00:03Z', threadId: 'test-thread', inputFile: 'stages/003-questionPrioritizer-input.json', outputFile: 'stages/003-questionPrioritizer-output.json' },
  { stageName: 'storyWriter', turnNumber: 1, sequenceNumber: 4, timestamp: '2026-05-02T10:00:04Z', threadId: 'test-thread', inputFile: 'stages/004-storyWriter-input.json', outputFile: 'stages/004-storyWriter-output.json' },
  { stageName: 'critic', turnNumber: 1, sequenceNumber: 5, timestamp: '2026-05-02T10:00:05Z', threadId: 'test-thread', inputFile: 'stages/005-critic-input.json', outputFile: 'stages/005-critic-output.json' },
  { stageName: 'emitComplete', turnNumber: 1, sequenceNumber: 6, timestamp: '2026-05-02T10:00:06Z', threadId: 'test-thread', inputFile: 'stages/006-emitComplete-input.json', outputFile: 'stages/006-emitComplete-output.json' },
];

export const SAMPLE_EXECUTION_LOG_WITH_PRD_UPDATER: PipelineStageRecord[] = [
  ...SAMPLE_EXECUTION_LOG.slice(0, 6),
  { stageName: 'prdUpdater', turnNumber: 1, sequenceNumber: 6, timestamp: '2026-05-02T10:00:06Z', threadId: 'test-thread', inputFile: 'stages/006-prdUpdater-input.json', outputFile: 'stages/006-prdUpdater-output.json' },
  { stageName: 'gapDetector', turnNumber: 2, sequenceNumber: 7, timestamp: '2026-05-02T10:00:07Z', threadId: 'test-thread', inputFile: 'stages/007-gapDetector-input.json', outputFile: 'stages/007-gapDetector-output.json' },
  { stageName: 'questionPrioritizer', turnNumber: 2, sequenceNumber: 8, timestamp: '2026-05-02T10:00:08Z', threadId: 'test-thread', inputFile: 'stages/008-questionPrioritizer-input.json', outputFile: 'stages/008-questionPrioritizer-output.json' },
  { stageName: 'storyWriter', turnNumber: 2, sequenceNumber: 9, timestamp: '2026-05-02T10:00:09Z', threadId: 'test-thread', inputFile: 'stages/009-storyWriter-input.json', outputFile: 'stages/009-storyWriter-output.json' },
  { stageName: 'critic', turnNumber: 2, sequenceNumber: 10, timestamp: '2026-05-02T10:00:10Z', threadId: 'test-thread', inputFile: 'stages/010-critic-input.json', outputFile: 'stages/010-critic-output.json' },
  { stageName: 'emitComplete', turnNumber: 2, sequenceNumber: 11, timestamp: '2026-05-02T10:00:11Z', threadId: 'test-thread', inputFile: 'stages/011-emitComplete-input.json', outputFile: 'stages/011-emitComplete-output.json' },
];

export const SAMPLE_EXECUTION_LOG_NO_PRD_UPDATER: PipelineStageRecord[] = SAMPLE_EXECUTION_LOG;
