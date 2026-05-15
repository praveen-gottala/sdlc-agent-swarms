/**
 * Tests for Node 3 — Architecture & ADR Writer.
 * Greenfield / brownfield paths, pattern merge, prompt wiring (Options Bundle in user message).
 */

import type { Result } from '@agentforge/core';
import { Err } from '@agentforge/core';
import type { CompletionResult, LLMProvider, ProviderError } from '@agentforge/providers';
import { makeState, mockDeps, stubProvider } from '../../test-utils.js';
import {
  createArchitectureWriter,
  buildArchitectureWriterUserMessage,
  ARCHITECTURE_WRITER_RESPONSE_SCHEMA,
  _resetArchitectureWriterPromptCache,
} from './architecture-writer.js';
import { BASELINE_IMPLEMENTATION_PATTERNS } from '../../patterns/baseline.js';

jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core');
  return {
    ...actual,
    debugLog: jest.fn(),
  };
});

function okStructured(data: Record<string, unknown>): Result<CompletionResult, ProviderError> {
  return {
    ok: true as const,
    value: {
      content: JSON.stringify(data),
      structured: data,
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 200 },
      cost: {
        inputCostUsd: 0,
        outputCostUsd: 0,
        totalCostUsd: 0,
        model: 'claude-opus-4-6',
        timestamp: new Date().toISOString(),
      },
      model: 'claude-opus-4-6',
      latencyMs: 10,
      finishReason: 'stop' as const,
    },
  };
}

const CASHPULSE_OPTIONS = {
  projectId: 'cashpulse-fixture',
  memos: [
    {
      gapId: 'gap-orm',
      axis: 'persistence',
      alternatives: [
        {
          id: 'alt-drizzle',
          name: 'Drizzle',
          description: 'SQL-first TS ORM',
          tradeoffs: ['Smaller ecosystem'],
          blastRadius: 'low' as const,
          references: ['https://orm.drizzle.team'],
        },
        {
          id: 'alt-prisma',
          name: 'Prisma',
          description: 'Schema-first ORM',
          tradeoffs: ['Heavier client'],
          blastRadius: 'medium' as const,
          references: [],
        },
      ],
      rationale: 'Persistence layer must be chosen before API tasks.',
    },
  ],
};

const VALID_STRUCTURED = {
  decisions: [
    {
      gapId: 'gap-orm',
      chosenAlternativeId: 'alt-drizzle',
      rationale: 'Matches baseline data-access-drizzle-only and minimizes blast radius.',
      adrId: 'adr-orm-001',
    },
  ],
  adrs: [
    {
      id: 'adr-orm-001',
      title: 'Adopt Drizzle for CashPulse persistence',
      status: 'proposed' as const,
      decision: 'Use Drizzle ORM with SQL migrations in repo.',
      rationale: 'Type-safe schema aligns with parallel backend tasks (R6 Q2/Q5).',
    },
  ],
  implementationPatterns: [
    {
      id: 'data-access-drizzle-only',
      category: 'data-access',
      title: 'Drizzle ORM for all persistence (fixture override)',
      rule: 'All DB access via Drizzle; migrations under /drizzle per task plan.',
    },
  ],
  stackConfig: {
    frontend: 'react',
    backend: 'node',
    database: 'postgres',
    styling: 'tailwind',
  },
};

describe('createArchitectureWriter (Node 3)', () => {
  beforeEach(() => {
    _resetArchitectureWriterPromptCache();
  });

  it('returns {} when provider returns Err', async () => {
    const complete = jest.fn().mockResolvedValue(
      Err<ProviderError>({ code: 'PROVIDER_DOWN', status: 503, message: 'unavailable' }),
    );
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createArchitectureWriter(deps)(makeState({ optionsBundle: CASHPULSE_OPTIONS }));
    expect(out).toEqual({});
  });

  it('returns {} when response content is not JSON and structured is absent', async () => {
    const complete = jest.fn().mockResolvedValue({
      ok: true as const,
      value: {
        content: '<<< not-json >>>',
        structured: undefined,
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 2 },
        cost: {
          inputCostUsd: 0,
          outputCostUsd: 0,
          totalCostUsd: 0,
          model: 'claude-opus-4-6',
          timestamp: new Date().toISOString(),
        },
        model: 'claude-opus-4-6',
        latencyMs: 1,
        finishReason: 'stop' as const,
      },
    } satisfies Result<CompletionResult, ProviderError>);
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createArchitectureWriter(deps)(makeState({ optionsBundle: CASHPULSE_OPTIONS }));
    expect(out).toEqual({});
  });

  it('returns {} when structured payload fails Zod validation', async () => {
    const complete = jest.fn().mockImplementation(async () =>
      okStructured({
        decisions: 'not-an-array',
        adrs: [],
        implementationPatterns: [],
        stackConfig: VALID_STRUCTURED.stackConfig,
      }),
    );
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createArchitectureWriter(deps)(makeState({ optionsBundle: CASHPULSE_OPTIONS }));
    expect(out).toEqual({});
  });

  it('user message includes Gate 2 architectureSpec slice when gate2Edits present', () => {
    const slice = {
      projectId: 'gate2-edit',
      decisions: [],
      stackConfig: VALID_STRUCTURED.stackConfig,
      assumptionLedgerUpdates: [],
      implementationPatterns: [],
    };
    const msg = buildArchitectureWriterUserMessage(
      makeState({
        optionsBundle: CASHPULSE_OPTIONS,
        gate2Edits: { architectureSpec: slice },
      }),
    );
    expect(msg).toContain('Gate 2 partial edits');
    expect(msg).toContain('gate2-edit');
  });

  it('returns {} when options bundle has no memos', async () => {
    const node = createArchitectureWriter(mockDeps);
    const result = await node(
      makeState({
        optionsBundle: { projectId: 'p', memos: [] },
      }),
    );
    expect(result.architectureSpec).toBeUndefined();
    expect(result.adrs).toBeUndefined();
  });

  it('greenfield happy path: architectureSpec + adrs + merged baseline patterns', async () => {
    const complete = jest.fn().mockImplementation(async () => okStructured(VALID_STRUCTURED));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const node = createArchitectureWriter(deps);

    const result = await node(
      makeState({
        optionsBundle: CASHPULSE_OPTIONS,
      }),
    );

    expect(result.architectureSpec).toBeDefined();
    expect(result.architectureSpec!.projectId).toBe('test-project');
    expect(result.architectureSpec!.decisions[0]!.gapId).toBe('gap-orm');
    expect(result.architectureSpec!.decisions[0]!.chosenAlternativeId).toBe('alt-drizzle');
    expect(result.adrs).toHaveLength(1);
    expect(result.adrs![0]!.id).toBe('adr-orm-001');

    const patternIds = new Set(result.architectureSpec!.implementationPatterns.map((p) => p.id));
    expect(patternIds.has('data-access-drizzle-only')).toBe(true);
    expect(patternIds.has('api-error-rfc7807')).toBe(true);
    const drizzle = result.architectureSpec!.implementationPatterns.find((p) => p.id === 'data-access-drizzle-only');
    expect(drizzle!.title).toContain('fixture override');

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      }),
      expect.objectContaining({
        model: 'claude-opus-4-6',
        responseSchema: ARCHITECTURE_WRITER_RESPONSE_SCHEMA,
      }),
    );
  });

  it('brownfield: user message includes change classification', async () => {
    const msg = buildArchitectureWriterUserMessage(
      makeState({
        mode: 'brownfield',
        optionsBundle: CASHPULSE_OPTIONS,
        changeClassification: {
          id: 'cc-1',
          changeRequestId: 'cr-1',
          scopeAxes: ['api' as const],
          blastRadius: 'medium' as const,
          affectedModules: ['packages/api'],
          confidence: 0.88,
        },
      }),
    );

    expect(msg).toContain('Change classification');
    expect(msg).toContain('scopeAxes');
    expect(msg).toContain('packages/api');
  });

  it('prompt wiring: Options bundle JSON is present for Node 2 traceability', async () => {
    const captured: string[] = [];
    const complete = jest.fn().mockImplementation(async (prompt: { readonly messages: readonly { content: string }[] }) => {
      captured.push(prompt.messages[0]!.content);
      return okStructured(VALID_STRUCTURED);
    });
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    await createArchitectureWriter(deps)(
      makeState({ optionsBundle: CASHPULSE_OPTIONS }),
    );

    expect(captured[0]).toContain('gap-orm');
    expect(captured[0]).toContain('alt-drizzle');
    expect(captured[0]).toContain('alt-prisma');
    expect(captured[0]).toContain(BASELINE_IMPLEMENTATION_PATTERNS[0]!.id);
  });

  it('CashPulse fixture snapshot: normalized architectureSpec output', async () => {
    const complete = jest.fn().mockImplementation(async () => okStructured(VALID_STRUCTURED));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createArchitectureWriter(deps)(
      makeState({ optionsBundle: CASHPULSE_OPTIONS }),
    );

    const snapshotBody = {
      decisions: out.architectureSpec!.decisions,
      stackConfig: out.architectureSpec!.stackConfig,
      patternIds: out.architectureSpec!.implementationPatterns.map((p) => p.id).sort(),
      adrTitles: out.adrs!.map((a) => a.title),
    };
    expect(snapshotBody).toMatchSnapshot();
  });
});
