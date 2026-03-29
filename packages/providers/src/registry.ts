/**
 * @module @agentforge/providers/registry
 *
 * Provider registry — resolves provider strings like "claude-sonnet-4-6"
 * to configured LLMProvider instances.
 */

import { Ok, Err, debugLog } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import type {
  LLMProvider,
  ProviderConfig,
  ProviderError,
  ProviderFactory,
  ProviderInfo,
} from './types.js';

/** Known model prefixes mapped to provider names. */
const MODEL_PREFIX_MAP: Record<string, string> = {
  claude: 'claude',
  gpt: 'openai',
};

/**
 * Parse a provider string into provider name and model ID.
 *
 * Examples:
 *   "claude-sonnet-4-6"  -> { provider: "claude",  model: "claude-sonnet-4-6" }
 *   "gpt-4o-mini"      -> { provider: "openai",  model: "gpt-4o-mini" }
 *   "ollama/codellama"  -> { provider: "ollama",  model: "codellama" }
 */
export function parseProviderString(providerString: string): { provider: string; model: string } {
  // Explicit provider/model format (e.g. "ollama/codellama")
  if (providerString.includes('/')) {
    const [provider, ...rest] = providerString.split('/');
    return { provider, model: rest.join('/') };
  }

  // Match by known prefix
  for (const [prefix, providerName] of Object.entries(MODEL_PREFIX_MAP)) {
    if (providerString.startsWith(prefix)) {
      return { provider: providerName, model: providerString };
    }
  }

  // Fallback: use the full string as both provider and model
  debugLog(`parseProviderString: no known prefix for "${providerString}" → using full string as both provider and model`);
  return { provider: providerString, model: providerString };
}

/** Registry for LLM providers. */
export class ProviderRegistry {
  private readonly factories = new Map<string, ProviderFactory>();
  private readonly configs = new Map<string, ProviderConfig>();

  /** Register a provider factory by name. */
  register(name: string, factory: ProviderFactory, config: ProviderConfig = {}): void {
    this.factories.set(name, factory);
    this.configs.set(name, config);
  }

  /** Resolve a provider string to a configured LLMProvider instance. */
  get(providerString: string): Result<LLMProvider, ProviderError> {
    const { provider, model } = parseProviderString(providerString);
    const factory = this.factories.get(provider);

    if (!factory) {
      return Err({ code: 'MODEL_NOT_FOUND' as const, model: providerString });
    }

    const config = this.configs.get(provider);
    if (!config) {
      debugLog(`ProviderRegistry.get: no config for provider "${provider}" → default: "empty config {}"`);
    }
    return Ok(factory(model, config ?? {}));
  }

  /** List all registered providers with availability info. */
  listAvailable(): ProviderInfo[] {
    const result: ProviderInfo[] = [];
    for (const [name, factory] of this.factories) {
      const config = this.configs.get(name) ?? {};
      const provider = factory('', config);
      result.push({
        name,
        models: provider.models,
        available: !!config.apiKey,
      });
    }
    return result;
  }
}
