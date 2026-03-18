import { parseProviderString, ProviderRegistry } from './registry.js';
import type { LLMProvider, ProviderConfig } from './types.js';

describe('parseProviderString', () => {
  it('parses claude model strings', () => {
    expect(parseProviderString('claude-sonnet-4')).toEqual({
      provider: 'claude',
      model: 'claude-sonnet-4',
    });
  });

  it('parses openai model strings', () => {
    expect(parseProviderString('gpt-4o-mini')).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  it('parses slash-separated provider strings', () => {
    expect(parseProviderString('ollama/codellama')).toEqual({
      provider: 'ollama',
      model: 'codellama',
    });
  });

  it('handles unknown prefixes by using full string', () => {
    expect(parseProviderString('mistral-7b')).toEqual({
      provider: 'mistral-7b',
      model: 'mistral-7b',
    });
  });
});

describe('ProviderRegistry', () => {
  function createMockProvider(name: string, models: string[]): LLMProvider {
    return {
      name,
      models,
      complete: jest.fn(),
      stream: jest.fn() as unknown as LLMProvider['stream'],
      isAvailable: jest.fn().mockResolvedValue(true),
      estimateCost: jest.fn(),
    };
  }

  it('registers and resolves a provider', () => {
    const registry = new ProviderRegistry();
    const mockProvider = createMockProvider('claude', ['claude-sonnet-4']);

    registry.register('claude', () => mockProvider);
    const result = registry.get('claude-sonnet-4');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('claude');
    }
  });

  it('returns error for unregistered provider', () => {
    const registry = new ProviderRegistry();
    const result = registry.get('unknown-model');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MODEL_NOT_FOUND');
    }
  });

  it('lists available providers', () => {
    const registry = new ProviderRegistry();
    const mockProvider = createMockProvider('claude', ['claude-sonnet-4', 'claude-opus-4']);

    registry.register('claude', () => mockProvider, { apiKey: 'test-key' });
    const list = registry.listAvailable();

    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      name: 'claude',
      models: ['claude-sonnet-4', 'claude-opus-4'],
      available: true,
    });
  });

  it('marks providers without API key as unavailable', () => {
    const registry = new ProviderRegistry();
    const mockProvider = createMockProvider('claude', ['claude-sonnet-4']);

    registry.register('claude', () => mockProvider);
    const list = registry.listAvailable();

    expect(list[0].available).toBe(false);
  });

  it('passes config to factory', () => {
    const registry = new ProviderRegistry();
    const factory = jest.fn((_model: string, _config: ProviderConfig) =>
      createMockProvider('claude', ['claude-sonnet-4']),
    );

    registry.register('claude', factory, { apiKey: 'sk-test', timeout: 5000 });
    registry.get('claude-sonnet-4');

    expect(factory).toHaveBeenCalledWith('claude-sonnet-4', {
      apiKey: 'sk-test',
      timeout: 5000,
    });
  });
});
