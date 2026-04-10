/**
 * @module llm-provider
 *
 * Shared Claude LLM provider factory for dashboard API routes.
 * Centralizes auth detection (API key or Vertex AI) and provider creation.
 */

import {
  resolveClaudeAuth,
  authResultToProviderConfig,
  createClaudeProvider,
} from '@agentforge/providers';
import type { LLMProvider } from '@agentforge/providers';
import { debugLog } from '@agentforge/core';

export interface ClaudeProviderResult {
  /** Ready-to-use LLM provider (supports both direct API and Vertex AI). */
  provider: LLMProvider;
  /** Which auth method was resolved: 'api_key' or 'vertex'. */
  authMethod: 'api_key' | 'vertex';
}

/**
 * Resolve Claude auth from environment variables and create a provider.
 *
 * Checks (in order):
 * 1. ANTHROPIC_API_KEY — direct Anthropic API
 * 2. ANTHROPIC_VERTEX_PROJECT_ID / CLOUD_ML_REGION — Google Vertex AI
 *
 * Returns null if no auth is configured, so the caller can return 503.
 */
export function getClaudeProvider(model = 'claude-sonnet-4-6'): ClaudeProviderResult | null {
  const auth = resolveClaudeAuth();
  if (!auth) {
    debugLog('llm-provider: no Claude auth found (checked ANTHROPIC_API_KEY and Vertex AI env vars)');
    return null;
  }

  debugLog(`llm-provider: auth resolved (method=${auth.type})`);
  return {
    provider: createClaudeProvider(model, authResultToProviderConfig(auth)),
    authMethod: auth.type,
  };
}

/** Standard 503 error message when no Claude auth is configured. */
export const NO_CLAUDE_AUTH_ERROR =
  'Claude auth is required. Set ANTHROPIC_API_KEY or configure Vertex AI ' +
  '(ANTHROPIC_VERTEX_PROJECT_ID + CLOUD_ML_REGION).';
