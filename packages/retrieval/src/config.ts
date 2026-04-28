/**
 * @module @agentforge/retrieval/config
 *
 * Resolves retrieval configuration from environment variables.
 * Graceful no-op when env vars are unset — callers check the Result.
 */

import { Ok, Err } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import type { RetrievalConfig, RetrievalError } from './types.js';

const DEFAULTS = {
  codeModel: 'voyage-code-3',
  docsModel: 'voyage-3-large',
  outputDimension: 1024,
  maxBatchSize: 128,
  rerankModel: 'rerank-v3.5',
  rerankTopN: 10,
  qdrantUrl: 'http://localhost:6333',
  codeCollection: 'agentforge_code',
  docsCollection: 'agentforge_docs',
  designsCollection: 'agentforge_designs',
} as const;

/** Resolve retrieval config from environment. Returns Err if required keys are missing. */
export function resolveRetrievalConfig(): Result<RetrievalConfig, RetrievalError> {
  const voyageKey = process.env['VOYAGE_API_KEY'];
  const cohereKey = process.env['COHERE_API_KEY'];

  if (!voyageKey) {
    return Err({
      code: 'CONFIG_MISSING',
      message: 'VOYAGE_API_KEY is required for retrieval',
      recoverable: false,
    });
  }

  if (!cohereKey) {
    return Err({
      code: 'CONFIG_MISSING',
      message: 'COHERE_API_KEY is required for retrieval',
      recoverable: false,
    });
  }

  return Ok({
    voyage: {
      apiKey: voyageKey,
      codeModel: process.env['VOYAGE_CODE_MODEL'] ?? DEFAULTS.codeModel,
      docsModel: process.env['VOYAGE_DOCS_MODEL'] ?? DEFAULTS.docsModel,
      outputDimension: parseInt(process.env['VOYAGE_OUTPUT_DIMENSION'] ?? '', 10) || DEFAULTS.outputDimension,
      maxBatchSize: parseInt(process.env['VOYAGE_MAX_BATCH_SIZE'] ?? '', 10) || DEFAULTS.maxBatchSize,
    },
    cohere: {
      apiKey: cohereKey,
      rerankModel: process.env['COHERE_RERANK_MODEL'] ?? DEFAULTS.rerankModel,
      topN: parseInt(process.env['COHERE_TOP_N'] ?? '', 10) || DEFAULTS.rerankTopN,
    },
    qdrant: {
      url: process.env['QDRANT_URL'] ?? DEFAULTS.qdrantUrl,
      apiKey: process.env['QDRANT_API_KEY'],
      codeCollection: DEFAULTS.codeCollection,
      docsCollection: DEFAULTS.docsCollection,
      designsCollection: DEFAULTS.designsCollection,
    },
  });
}
