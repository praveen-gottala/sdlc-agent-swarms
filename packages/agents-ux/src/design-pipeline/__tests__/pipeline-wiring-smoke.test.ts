/**
 * Pipeline wiring smoke test — real codepath, spy provider, mkdtempSync.
 *
 * Canonical home for real-codepath pipeline verification.
 * See docs/lessons-learned.md § "Mock-Only Tests Hide Wiring Bugs".
 *
 * Imports runDesignPipeline (not individual work fns) to verify the full
 * orchestration path: provider resolution → node dispatch → cache writes.
 * Uses a spy provider returning canned tool responses — no real LLM needed.
 *
 * Telemetry note: only browserDesignWork fires ctx.telemetry?.onLlmCall
 * in Phase 1. uxResearchWork/uxPlanningWork pre-date the sink interface.
 * Phase 2 (CLI sink) and Phase 3 (dashboard sink) will thread telemetry
 * into those work fns or wrap them with timing/cost instrumentation.
 */

import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDesignPipeline } from '../pipeline.js';
import type { PipelineInput } from '../types.js';
import type { AgentContext, LLMProviderRef, Result } from '@agentforge/core';
import { createRealFs, Ok, buildDesignTokensSpec } from '@agentforge/core';
import { rmSync } from 'node:fs';
import yaml from 'yaml';

// ── Canned responses ──

const RESEARCH_RESPONSE = {
  briefId: 'smoke-page',
  moduleId: 'smoke-page',
  requirementIds: ['req-1'],
  designConstraints: ['mobile-first layout'],
  referencePatterns: ['analytics-dashboard'],
  accessibilityRequirements: ['wcag-2.1-aa'],
  dataModelDependencies: ['user-model'],
};

const PLANNING_RESPONSE = {
  specRef: 'smoke-page',
  moduleId: 'smoke-page',
  componentTree: [{ name: 'Header', type: 'container', children: [] }],
  tokenBindings: { 'primary-bg': 'surface.primary' },
  responsiveRules: [{ breakpoint: 768, changes: ['stack columns'] }],
};

const DESIGN_TOOL_RESPONSE = {
  screen: 'smoke-page',
  width: 1440,
  nodes: {
    root: { type: 'frame', parent: null, order: 0, label: 'Root Page' },
    header: { type: 'frame', parent: 'root', order: 0, label: 'Header', catalog: 'header' },
    title: { type: 'text', parent: 'header', order: 0, label: 'Dashboard', content: 'Analytics Dashboard' },
  },
};

// ── Spy provider ──

function createSpyProvider(): LLMProviderRef & { calls: Array<{ prompt: unknown; options: unknown }> } {
  const calls: Array<{ prompt: unknown; options: unknown }> = [];

  return {
    name: 'spy-provider',
    calls,
    complete: jest.fn(async (prompt: unknown, options: unknown): Promise<Result<unknown>> => {
      calls.push({ prompt, options });

      const opts = options as Record<string, unknown>;

      // Call 1: research (no tools, no responseSchema)
      if (!opts.responseSchema && !opts.toolChoice) {
        return Ok({
          content: JSON.stringify(RESEARCH_RESPONSE),
          usage: { inputTokens: 500, outputTokens: 300, cacheReadTokens: 200 },
          cost: { totalCostUsd: 0.01, inputCostUsd: 0.005, outputCostUsd: 0.005 },
          finishReason: 'end_turn',
          latencyMs: 1200,
        });
      }

      // Call 2: planning (responseSchema present)
      if (opts.responseSchema) {
        return Ok({
          content: JSON.stringify(PLANNING_RESPONSE),
          structured: PLANNING_RESPONSE,
          usage: { inputTokens: 800, outputTokens: 500 },
          cost: { totalCostUsd: 0.02, inputCostUsd: 0.01, outputCostUsd: 0.01 },
          finishReason: 'end_turn',
          latencyMs: 2000,
        });
      }

      // Call 3: design (toolChoice = submit_design)
      if ((opts.toolChoice as Record<string, unknown>)?.name === 'submit_design') {
        return Ok({
          content: '',
          toolCalls: [{ id: 'tc-1', name: 'submit_design', args: DESIGN_TOOL_RESPONSE }],
          usage: { inputTokens: 2000, outputTokens: 3000 },
          cost: { totalCostUsd: 0.08, inputCostUsd: 0.03, outputCostUsd: 0.05 },
          finishReason: 'tool_use',
          latencyMs: 5000,
        });
      }

      return Ok({ content: '{}', usage: { inputTokens: 0, outputTokens: 0 }, cost: { totalCostUsd: 0 }, finishReason: 'end_turn' });
    }),
    stream: jest.fn(),
    estimateCost: jest.fn().mockReturnValue({ inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, inputTokens: 0, outputTokens: 0 }),
  };
}

// ── Test ──

describe('pipeline wiring smoke test', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pipeline-smoke-'));
    // Set up minimal spec files that work functions expect
    mkdirSync(join(tmpDir, 'agentforge/spec'), { recursive: true });
    writeFileSync(join(tmpDir, 'agentforge/spec/pages.yaml'), 'version: "1.0"\npages: []');
    writeFileSync(join(tmpDir, 'agentforge/spec/project.yaml'), 'name: smoke-test\ndescription: test');
    const tokens = buildDesignTokensSpec('professional');
    writeFileSync(join(tmpDir, 'agentforge/spec/design-tokens.yaml'), yaml.stringify(tokens));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs runDesignPipeline end-to-end with spy provider and writes artifacts to disk', async () => {
    const provider = createSpyProvider();

    const input: PipelineInput = {
      moduleId: 'smoke-page',
      taskId: 'task-1',
      projectRoot: tmpDir,
      designTool: 'browser',
      providerString: 'claude-sonnet-4-6',
      prdRequirements: ['Build an analytics dashboard with user engagement metrics and real-time charts'],
      description: 'An analytics dashboard for tracking user engagement',
      agentContext: {
        taskId: 'task-1',
        projectRoot: tmpDir,
        eventBus: { emit: jest.fn(), on: jest.fn(), off: jest.fn(), once: jest.fn() } as unknown as AgentContext['eventBus'],
        fs: createRealFs(),
        runGovernance: jest.fn().mockResolvedValue({ outcome: 'proceed' }),
        resolveProvider: jest.fn().mockReturnValue({ ok: true, value: provider }),
        recordAudit: jest.fn(),
        resolvedModel: 'claude-sonnet-4-6',
      },
    };

    const result = await runDesignPipeline(input);

    // ── Pipeline completed successfully ──
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // ── All 3 LLM-calling stages were invoked ──
    // research (text), planning (structured), design (tool_use)
    expect(provider.calls.length).toBeGreaterThanOrEqual(3);

    // ── Stage outputs are populated ──
    expect(result.value.research).toBeDefined();
    expect(result.value.research?.briefId).toBe('smoke-page');
    expect(result.value.planning).toBeDefined();
    expect(result.value.planning?.componentTree).toHaveLength(1);
    expect(result.value.design).toBeDefined();

    // ── Design spec has non-empty nodes ──
    const spec = result.value.design!.spec as Record<string, unknown>;
    const nodes = spec.nodes as Record<string, unknown>;
    expect(Object.keys(nodes).length).toBeGreaterThan(0);
    expect(nodes).toHaveProperty('root');
    expect(nodes).toHaveProperty('header');

    // ── WIRING ASSERTIONS: inspect prompt content, not just outputs ──
    // Find calls by signature (planning may retry on token validation, shifting indices)
    const planningCalls = provider.calls.filter(c =>
      (c.options as Record<string, unknown>).responseSchema !== undefined);
    const designCalls = provider.calls.filter(c =>
      ((c.options as Record<string, unknown>).toolChoice as Record<string, unknown>)?.name === 'submit_design');

    // (a) Planning prompt contains research output (research→planning handoff)
    expect(planningCalls.length).toBeGreaterThanOrEqual(1);
    const planningPrompt = JSON.stringify(planningCalls[0].prompt);
    expect(planningPrompt).toContain('mobile-first layout');
    expect(planningPrompt).toContain('analytics-dashboard');

    // (b) Design prompt contains prdRequirements content (not just labels)
    expect(designCalls.length).toBeGreaterThanOrEqual(1);
    const designPrompt = JSON.stringify(designCalls[0].prompt);
    expect(designPrompt).toContain('analytics dashboard');
    expect(designPrompt).toContain('user engagement');

    // ── Artifacts landed on disk ──
    const previewDir = join(tmpDir, 'agentforge/designs/smoke-page');
    expect(existsSync(join(previewDir, 'research-brief.json'))).toBe(true);
    expect(existsSync(join(previewDir, 'planning-spec.json'))).toBe(true);
    expect(existsSync(join(previewDir, 'scripts/designspec-v2.json'))).toBe(true);
    const cachedDesignSpec = JSON.parse(readFileSync(join(previewDir, 'scripts/designspec-v2.json'), 'utf-8')) as Record<string, unknown>;
    expect(cachedDesignSpec.nodes).toBeDefined();
    expect(cachedDesignSpec.spec).toBeUndefined();
  }, 10_000);

  it('chromePass.spec appears in design prompt when mode=consume', async () => {
    const provider = createSpyProvider();
    const frozenSpec = {
      screen: '__chrome__', width: 1440,
      nodes: { 'nav-header': { type: 'frame', parent: null, order: 0 } },
    };

    const input: PipelineInput = {
      moduleId: 'smoke-page',
      taskId: 'task-1',
      projectRoot: tmpDir,
      designTool: 'browser',
      providerString: 'claude-sonnet-4-6',
      prdRequirements: ['Build a dashboard'],
      description: 'A dashboard app',
      chromePass: { mode: 'consume', spec: frozenSpec as never, activePageId: 'dashboard' },
      agentContext: {
        taskId: 'task-1',
        projectRoot: tmpDir,
        eventBus: { emit: jest.fn(), on: jest.fn(), off: jest.fn(), once: jest.fn() } as unknown as AgentContext['eventBus'],
        fs: createRealFs(),
        runGovernance: jest.fn().mockResolvedValue({ outcome: 'proceed' }),
        resolveProvider: jest.fn().mockReturnValue({ ok: true, value: provider }),
        recordAudit: jest.fn(),
        resolvedModel: 'claude-sonnet-4-6',
      },
    };

    const result = await runDesignPipeline(input);
    expect(result.ok).toBe(true);

    // (c) chromePass.spec node IDs appear in the design prompt
    const designCalls = provider.calls.filter(c =>
      ((c.options as Record<string, unknown>).toolChoice as Record<string, unknown>)?.name === 'submit_design');
    expect(designCalls.length).toBeGreaterThanOrEqual(1);
    const designPrompt = JSON.stringify(designCalls[0].prompt);
    expect(designPrompt).toContain('nav-header');
    expect(designPrompt).toContain('Frozen shared chrome');
  }, 10_000);
});
