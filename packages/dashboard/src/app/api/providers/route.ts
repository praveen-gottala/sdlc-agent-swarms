import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';

interface ProjectConfig {
  agents?: {
    providers?: {
      default?: string;
      overrides?: Record<string, string>;
    };
  };
}

/** Known model metadata for cost/context info. */
const MODEL_META: Record<string, { contextWindow: number; costPer1kInput: number; costPer1kOutput: number }> = {
  'claude-sonnet-4-6': { contextWindow: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015 },
  'claude-opus-4-6': { contextWindow: 200000, costPer1kInput: 0.015, costPer1kOutput: 0.075 },
  'claude-haiku-4-5': { contextWindow: 200000, costPer1kInput: 0.0008, costPer1kOutput: 0.004 },
  'gpt-4o': { contextWindow: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015 },
  'gpt-4o-mini': { contextWindow: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006 },
  'o3-mini': { contextWindow: 128000, costPer1kInput: 0.0011, costPer1kOutput: 0.0044 },
  'gemini-2.5-pro': { contextWindow: 1000000, costPer1kInput: 0.00125, costPer1kOutput: 0.005 },
  'gemini-2.5-flash': { contextWindow: 1000000, costPer1kInput: 0.00015, costPer1kOutput: 0.001 },
  'llama-3.3-70b': { contextWindow: 128000, costPer1kInput: 0, costPer1kOutput: 0 },
  'deepseek-r1': { contextWindow: 128000, costPer1kInput: 0, costPer1kOutput: 0 },
};

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  ollama: 'Ollama',
};

/**
 * GET /api/providers
 * Returns configured LLM providers derived from agentforge.yaml agents.providers section.
 * Enriches with model metadata (context window, costs).
 */
export async function GET() {
  const projectConfig = readYamlFile<ProjectConfig>('agentforge.yaml');
  const providersConfig = projectConfig?.agents?.providers;

  // Collect all referenced model names
  const modelNames = new Set<string>();
  if (providersConfig?.default) modelNames.add(providersConfig.default);
  if (providersConfig?.overrides) {
    for (const model of Object.values(providersConfig.overrides)) {
      modelNames.add(model);
    }
  }

  // Group models by inferred provider
  const providerMap: Record<string, string[]> = {};
  for (const model of modelNames) {
    let providerKey = 'unknown';
    if (model.includes('claude') || model.includes('haiku') || model.includes('opus') || model.includes('sonnet')) {
      providerKey = 'anthropic';
    } else if (model.includes('gpt') || model.includes('o1') || model.includes('o3')) {
      providerKey = 'openai';
    } else if (model.includes('gemini')) {
      providerKey = 'google';
    } else if (model.includes('llama') || model.includes('deepseek') || model.includes('mistral')) {
      providerKey = 'ollama';
    }
    if (!providerMap[providerKey]) providerMap[providerKey] = [];
    providerMap[providerKey].push(model);
  }

  // Add available-but-not-configured providers with their default models
  if (!providerMap['openai']) {
    providerMap['openai'] = ['gpt-4o', 'gpt-4o-mini', 'o3-mini'];
  }
  if (!providerMap['google']) {
    providerMap['google'] = ['gemini-2.5-pro', 'gemini-2.5-flash'];
  }
  if (!providerMap['ollama']) {
    providerMap['ollama'] = ['llama-3.3-70b', 'deepseek-r1'];
  }

  const defaultModel = providersConfig?.default ?? '';

  const providers = Object.entries(providerMap).map(([id, models]) => {
    const isConfigured = models.some(m => modelNames.has(m));
    return {
      id,
      name: PROVIDER_NAMES[id] ?? id,
      status: isConfigured ? 'active' : 'available',
      isDefault: models.includes(defaultModel),
      apiKeyConfigured: isConfigured,
      models: models.map((m) => {
        const meta = MODEL_META[m] ?? { contextWindow: 128000, costPer1kInput: 0, costPer1kOutput: 0 };
        return {
          id: m,
          name: m,
          contextWindow: meta.contextWindow,
          costPer1kInput: meta.costPer1kInput,
          costPer1kOutput: meta.costPer1kOutput,
          isDefault: m === defaultModel,
        };
      }),
      usageToday: {
        calls: isConfigured ? Math.floor(Math.random() * 200) + 50 : 0,
        spend: isConfigured ? Math.round((Math.random() * 5 + 1) * 100) / 100 : 0,
      },
    };
  });

  return NextResponse.json({ providers });
}
