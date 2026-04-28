import { computePrecisionAtK } from './eval-runner.js';
import type { GoldenQuery } from './golden-queries.js';
import type { EvalHit } from './eval-runner.js';

describe('computePrecisionAtK', () => {
  const queries: GoldenQuery[] = [
    { query: 'Result pattern', type: 'code', expectedFiles: ['types/result.ts'], description: 'test' },
    { query: 'event bus', type: 'code', expectedFiles: ['events/event-bus.ts'], description: 'test' },
    { query: 'config loading', type: 'code', expectedFiles: ['config/loader.ts'], description: 'test' },
  ];

  it('computes 100% precision when all queries hit', () => {
    const results = new Map<string, EvalHit[]>([
      ['Result pattern', [{ filePath: 'src/types/result.ts', score: 0.9 }]],
      ['event bus', [{ filePath: 'src/events/event-bus.ts', score: 0.8 }]],
      ['config loading', [{ filePath: 'src/config/loader.ts', score: 0.7 }]],
    ]);

    const eval_ = computePrecisionAtK(queries, results, 5);
    expect(eval_.precisionAtK).toBe(1.0);
    expect(eval_.hits).toBe(3);
    expect(eval_.misses).toBe(0);
  });

  it('computes partial precision', () => {
    const results = new Map<string, EvalHit[]>([
      ['Result pattern', [{ filePath: 'src/types/result.ts', score: 0.9 }]],
      ['event bus', [{ filePath: 'src/unrelated.ts', score: 0.5 }]],
      ['config loading', [{ filePath: 'src/config/loader.ts', score: 0.7 }]],
    ]);

    const eval_ = computePrecisionAtK(queries, results, 5);
    expect(eval_.precisionAtK).toBeCloseTo(2 / 3);
    expect(eval_.hits).toBe(2);
    expect(eval_.misses).toBe(1);
  });

  it('computes 0% precision when no queries hit', () => {
    const results = new Map<string, EvalHit[]>([
      ['Result pattern', [{ filePath: 'wrong.ts', score: 0.9 }]],
      ['event bus', [{ filePath: 'wrong.ts', score: 0.8 }]],
      ['config loading', [{ filePath: 'wrong.ts', score: 0.7 }]],
    ]);

    const eval_ = computePrecisionAtK(queries, results, 5);
    expect(eval_.precisionAtK).toBe(0);
    expect(eval_.misses).toBe(3);
  });

  it('only considers top K results', () => {
    const results = new Map<string, EvalHit[]>([
      ['Result pattern', [
        { filePath: 'wrong1.ts', score: 0.9 },
        { filePath: 'wrong2.ts', score: 0.8 },
        { filePath: 'src/types/result.ts', score: 0.1 },
      ]],
    ]);

    // K=2: expected file is at index 2, outside window
    const eval2 = computePrecisionAtK([queries[0]!], results, 2);
    expect(eval2.hits).toBe(0);

    // K=5: expected file is at index 2, inside window
    const eval5 = computePrecisionAtK([queries[0]!], results, 5);
    expect(eval5.hits).toBe(1);
  });

  it('handles empty queries', () => {
    const eval_ = computePrecisionAtK([], new Map(), 5);
    expect(eval_.precisionAtK).toBe(0);
    expect(eval_.totalQueries).toBe(0);
  });

  it('handles directory prefix matching for expected files', () => {
    const dirQuery: GoldenQuery = {
      query: 'something in docs',
      type: 'docs',
      expectedFiles: ['docs/adrs/'],
      description: 'test',
    };

    const results = new Map<string, EvalHit[]>([
      ['something in docs', [{ filePath: 'docs/adrs/ADR-043-typescript-only.md', score: 0.9 }]],
    ]);

    const eval_ = computePrecisionAtK([dirQuery], results, 5);
    expect(eval_.hits).toBe(1);
    expect(eval_.results[0]!.matchedFile).toContain('docs/adrs/');
  });
});
