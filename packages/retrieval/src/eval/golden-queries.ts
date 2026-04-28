/**
 * @module @agentforge/retrieval/eval/golden-queries
 *
 * Golden query set for evaluating retrieval quality.
 * Each query has expected files that should appear in top-5 results.
 */

export interface GoldenQuery {
  readonly query: string;
  readonly type: 'code' | 'docs';
  readonly expectedFiles: readonly string[];
  readonly description: string;
}

export const GOLDEN_CODE_QUERIES: readonly GoldenQuery[] = [
  {
    query: 'Result pattern error handling Ok Err',
    type: 'code',
    expectedFiles: ['packages/core/src/types/result.ts'],
    description: 'Core Result type definition',
  },
  {
    query: 'LLM provider complete function with streaming',
    type: 'code',
    expectedFiles: ['packages/providers/src/types.ts'],
    description: 'Provider interface',
  },
  {
    query: 'design spec v2 node type definition',
    type: 'code',
    expectedFiles: ['packages/designspec-renderer/src/types/design-spec-v2.ts'],
    description: 'DesignSpec V2 types',
  },
  {
    query: 'catalog resolver normalize component ID',
    type: 'code',
    expectedFiles: ['packages/designspec-renderer/src/catalog/resolver.ts'],
    description: 'Catalog resolution logic',
  },
  {
    query: 'create traced provider for LLM observability',
    type: 'code',
    expectedFiles: ['packages/telemetry/src/traced-provider.ts'],
    description: 'Telemetry traced provider',
  },
  {
    query: 'event bus publish subscribe domain events',
    type: 'code',
    expectedFiles: ['packages/core/src/events/event-bus.ts'],
    description: 'Event bus implementation',
  },
  {
    query: 'CLI init command scaffold project',
    type: 'code',
    expectedFiles: ['packages/cli/src/commands/init.ts'],
    description: 'CLI init command',
  },
  {
    query: 'design evaluator vision LLM scoring',
    type: 'code',
    expectedFiles: ['packages/agents-ux/src/ux-design/design-evaluator.ts'],
    description: 'Design evaluator',
  },
  {
    query: 'parse YAML configuration file loading',
    type: 'code',
    expectedFiles: ['packages/core/src/config/'],
    description: 'Config file parsing',
  },
  {
    query: 'Zod schema cross boundary artifacts',
    type: 'code',
    expectedFiles: ['packages/core/src/types/cross-boundary-artifacts.schemas.ts'],
    description: 'Cross-boundary artifact schemas',
  },
  {
    query: 'BM25 sparse vector tokenize vocabulary',
    type: 'code',
    expectedFiles: ['packages/retrieval/src/chunking/bm25.ts'],
    description: 'BM25 implementation',
  },
  {
    query: 'Merkle tree diff incremental indexing',
    type: 'code',
    expectedFiles: ['packages/retrieval/src/indexing/merkle-tree.ts'],
    description: 'Merkle tree for incremental indexing',
  },
  {
    query: 'PageRank algorithm symbol importance',
    type: 'code',
    expectedFiles: ['packages/retrieval/src/repo-map/pagerank.ts'],
    description: 'PageRank for symbol ranking',
  },
  {
    query: 'Qdrant hybrid search dense sparse fusion',
    type: 'code',
    expectedFiles: ['packages/retrieval/src/clients/qdrant-client.ts'],
    description: 'Qdrant client with hybrid search',
  },
  {
    query: 'withEnv test utility process environment',
    type: 'code',
    expectedFiles: ['packages/core/src/test-utils/with-env.ts'],
    description: 'Test utility for env vars',
  },
];

export const GOLDEN_DOC_QUERIES: readonly GoldenQuery[] = [
  {
    query: 'how does the clarifier work six stages',
    type: 'docs',
    expectedFiles: ['docs/vision.md'],
    description: 'Vision Layer 5 Clarifier',
  },
  {
    query: 'architectural decisions ADR LangGraph TypeScript',
    type: 'docs',
    expectedFiles: ['docs/adrs/'],
    description: 'ADR for orchestration runtime',
  },
  {
    query: 'observability Langfuse setup guide',
    type: 'docs',
    expectedFiles: ['docs/guides/langfuse-setup.md'],
    description: 'Langfuse setup instructions',
  },
  {
    query: 'visual diversity container treatment patterns',
    type: 'docs',
    expectedFiles: ['docs/plans/active/visual-diversity/'],
    description: 'Visual diversity execution plan',
  },
  {
    query: 'lessons learned test quality gates one canonical site',
    type: 'docs',
    expectedFiles: ['docs/lessons-learned-rules.md'],
    description: 'Test quality gates rule',
  },
];
