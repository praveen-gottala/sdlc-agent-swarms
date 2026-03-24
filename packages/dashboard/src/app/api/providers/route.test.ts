/**
 * @jest-environment node
 */
import { GET } from './route';

jest.mock('../_lib/project-reader', () => ({
  readYamlFile: jest.fn(),
}));

import { readYamlFile } from '../_lib/project-reader';
const mockReadYaml = readYamlFile as jest.MockedFunction<typeof readYamlFile>;

describe('GET /api/providers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns configured and available providers', async () => {
    mockReadYaml.mockReturnValue({
      agents: {
        providers: {
          default: 'claude-sonnet-4',
          overrides: {
            architecture: 'claude-opus-4',
            code_review: 'claude-haiku-4',
          },
        },
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data.providers).toBeDefined();
    expect(Array.isArray(data.providers)).toBe(true);

    // Anthropic should be active (configured)
    const anthropic = data.providers.find((p: Record<string, unknown>) => p.id === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic.status).toBe('active');
    expect(anthropic.name).toBe('Anthropic');
    expect(anthropic.models.length).toBeGreaterThanOrEqual(3);

    // OpenAI should be available
    const openai = data.providers.find((p: Record<string, unknown>) => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai.name).toBe('OpenAI');
    expect(openai.models.some((m: Record<string, unknown>) => m.name === 'o3-mini')).toBe(true);

    // Google should be available
    const google = data.providers.find((p: Record<string, unknown>) => p.id === 'google');
    expect(google).toBeDefined();
    expect(google.name).toBe('Google');
    expect(google.models.some((m: Record<string, unknown>) => m.name === 'gemini-2.5-flash')).toBe(true);

    // Ollama should be available
    const ollama = data.providers.find((p: Record<string, unknown>) => p.id === 'ollama');
    expect(ollama).toBeDefined();
    expect(ollama.name).toBe('Ollama');
    expect(ollama.models.some((m: Record<string, unknown>) => m.name === 'llama-3.3-70b')).toBe(true);
    expect(ollama.models.some((m: Record<string, unknown>) => m.name === 'deepseek-r1')).toBe(true);
  });

  it('returns fallback providers when no config exists', async () => {
    mockReadYaml.mockReturnValue(null);

    const response = await GET();
    const data = await response.json();

    expect(data.providers).toBeDefined();
    const ids = data.providers.map((p: Record<string, unknown>) => p.id);
    expect(ids).toContain('openai');
    expect(ids).toContain('google');
    expect(ids).toContain('ollama');
  });

  it('includes model metadata with context window and costs', async () => {
    mockReadYaml.mockReturnValue({
      agents: { providers: { default: 'claude-sonnet-4' } },
    });

    const response = await GET();
    const data = await response.json();
    const anthropic = data.providers.find((p: Record<string, unknown>) => p.id === 'anthropic');
    const sonnet = anthropic.models.find((m: Record<string, unknown>) => m.name === 'claude-sonnet-4');

    expect(sonnet.contextWindow).toBe(200000);
    expect(sonnet.costPer1kInput).toBe(0.003);
    expect(sonnet.costPer1kOutput).toBe(0.015);
  });
});
