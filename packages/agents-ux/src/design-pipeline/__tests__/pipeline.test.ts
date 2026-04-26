/**
 * Unit tests for runDesignPipeline orchestrator.
 *
 * Mock-heavy: mocks researchNode, planningNode, designNode, evaluatorNode.
 * Real-codepath canonical home: pipeline-wiring-smoke.test.ts (same directory).
 */

import type { PipelineInput, PipelineTelemetrySink, PipelineStageError } from '../types.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { createRealFs } from '@agentforge/core';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock nodes to isolate orchestrator logic
jest.mock('../nodes.js', () => ({
  researchNode: jest.fn(),
  planningNode: jest.fn(),
  designNode: jest.fn(),
  evaluatorNode: jest.fn(),
}));

import { runDesignPipeline } from '../pipeline.js';
import { researchNode, planningNode, designNode, evaluatorNode } from '../nodes.js';

const mockedResearch = researchNode as jest.MockedFunction<typeof researchNode>;
const mockedPlanning = planningNode as jest.MockedFunction<typeof planningNode>;
const mockedDesign = designNode as jest.MockedFunction<typeof designNode>;
const mockedEvaluator = evaluatorNode as jest.MockedFunction<typeof evaluatorNode>;

// ── Helpers ──

function createProvider(): LLMProviderRef {
  return {
    name: 'test',
    complete: jest.fn(),
    stream: jest.fn(),
    estimateCost: jest.fn().mockReturnValue({ inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, inputTokens: 0, outputTokens: 0 }),
  };
}

function createInput(overrides?: Partial<PipelineInput>): PipelineInput {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pipeline-test-'));
  mkdirSync(join(tmpDir, 'agentforge/spec'), { recursive: true });

  return {
    moduleId: 'test-page',
    taskId: 'task-1',
    projectRoot: tmpDir,
    designTool: 'browser',
    providerString: 'claude-sonnet-4-6',
    agentContext: {
      taskId: 'task-1',
      projectRoot: tmpDir,
      eventBus: { emit: jest.fn(), on: jest.fn(), off: jest.fn(), once: jest.fn() } as unknown as AgentContext['eventBus'],
      fs: createRealFs(),
      runGovernance: jest.fn(),
      resolveProvider: jest.fn().mockReturnValue({ ok: true, value: createProvider() }),
      recordAudit: jest.fn(),
    },
    ...overrides,
  };
}

function createSink(): PipelineTelemetrySink & { log: Array<{ method: string; stage: string }> } {
  const log: Array<{ method: string; stage: string }> = [];
  return {
    log,
    onStageStart: jest.fn((stage) => log.push({ method: 'onStageStart', stage })),
    onStageComplete: jest.fn((stage) => log.push({ method: 'onStageComplete', stage })),
    onStageFail: jest.fn((stage) => log.push({ method: 'onStageFail', stage })),
    onLlmCall: jest.fn(),
    onLog: jest.fn(),
  };
}

beforeEach(() => jest.clearAllMocks());

// ── Tests ──

describe('runDesignPipeline', () => {
  it('calls all 4 stages in order', async () => {
    mockedResearch.mockResolvedValue({ ok: true, value: { research: { briefId: 'p', moduleId: 'p', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] } } });
    mockedPlanning.mockResolvedValue({ ok: true, value: { planning: { specRef: 'p', moduleId: 'p', componentTree: [], tokenBindings: {}, responsiveRules: [] } } });
    mockedDesign.mockResolvedValue({ ok: true, value: { design: { spec: { screen: 'test', nodes: {} } } } });
    mockedEvaluator.mockResolvedValue({ ok: true, value: { evaluation: undefined } });

    const sink = createSink();
    const input = createInput({ telemetry: sink });
    const result = await runDesignPipeline(input);

    expect(result.ok).toBe(true);
    expect(mockedResearch).toHaveBeenCalledTimes(1);
    expect(mockedPlanning).toHaveBeenCalledTimes(1);
    expect(mockedDesign).toHaveBeenCalledTimes(1);
    expect(mockedEvaluator).toHaveBeenCalledTimes(1);

    const stageOrder = sink.log
      .filter(e => e.method === 'onStageStart')
      .map(e => e.stage);
    expect(stageOrder).toEqual(['research', 'planning', 'design', 'evaluator']);
  });

  it('fires onStageStart before onStageComplete for each stage', async () => {
    mockedResearch.mockResolvedValue({ ok: true, value: { research: { briefId: 'p', moduleId: 'p', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] } } });
    mockedPlanning.mockResolvedValue({ ok: true, value: { planning: { specRef: 'p', moduleId: 'p', componentTree: [], tokenBindings: {}, responsiveRules: [] } } });
    mockedDesign.mockResolvedValue({ ok: true, value: { design: { spec: {} } } });
    mockedEvaluator.mockResolvedValue({ ok: true, value: { evaluation: undefined } });

    const sink = createSink();
    const input = createInput({ telemetry: sink });
    await runDesignPipeline(input);

    for (const stage of ['research', 'planning', 'design', 'evaluator']) {
      const startIdx = sink.log.findIndex(e => e.method === 'onStageStart' && e.stage === stage);
      const completeIdx = sink.log.findIndex(e => e.method === 'onStageComplete' && e.stage === stage);
      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(completeIdx).toBeGreaterThan(startIdx);
    }
  });

  it('stops and calls onStageFail on node error', async () => {
    mockedResearch.mockResolvedValue({
      ok: false,
      error: { code: 'PIPELINE_STAGE_FAILED', stage: 'research', message: 'LLM failed', recoverable: false },
    });

    const sink = createSink();
    const input = createInput({ telemetry: sink });
    const result = await runDesignPipeline(input);

    expect(result.ok).toBe(false);
    expect(mockedPlanning).not.toHaveBeenCalled();
    expect(sink.onStageFail).toHaveBeenCalledWith('research', 'LLM failed');
  });

  it('returns Err when provider resolution fails', async () => {
    const input = createInput();
    (input.agentContext.resolveProvider as jest.Mock).mockReturnValue({
      ok: false,
      error: { code: 'PROVIDER_NOT_FOUND', message: 'No API key' },
    });

    const result = await runDesignPipeline(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as PipelineStageError).stage).toBe('init');
    }
  });

  it('skips research when resume=true and cache exists', async () => {
    mockedPlanning.mockResolvedValue({ ok: true, value: { planning: { specRef: 'p', moduleId: 'p', componentTree: [], tokenBindings: {}, responsiveRules: [] } } });
    mockedDesign.mockResolvedValue({ ok: true, value: { design: { spec: {} } } });
    mockedEvaluator.mockResolvedValue({ ok: true, value: { evaluation: undefined } });

    const input = createInput({ resume: true });

    // Write cached research artifact
    const cacheDir = join(input.projectRoot, 'agentforge/designs/test-page');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'research-brief.json'), JSON.stringify({
      briefId: 'cached',
      moduleId: 'test-page',
      requirementIds: [],
      designConstraints: ['cached-constraint'],
      referencePatterns: [],
      accessibilityRequirements: [],
      dataModelDependencies: [],
    }));

    const result = await runDesignPipeline(input);

    expect(result.ok).toBe(true);
    expect(mockedResearch).not.toHaveBeenCalled();
    expect(mockedPlanning).toHaveBeenCalledTimes(1);
  });

  it('resumes with legacy { brief: string } shape by migrating', async () => {
    mockedPlanning.mockResolvedValue({ ok: true, value: { planning: { specRef: 'p', moduleId: 'p', componentTree: [], tokenBindings: {}, responsiveRules: [] } } });
    mockedDesign.mockResolvedValue({ ok: true, value: { design: { spec: {} } } });
    mockedEvaluator.mockResolvedValue({ ok: true, value: { evaluation: undefined } });

    const input = createInput({ resume: true });

    // Write legacy research artifact
    const cacheDir = join(input.projectRoot, 'agentforge/designs/test-page');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'research-brief.json'), JSON.stringify({ brief: 'some legacy research content' }));

    const result = await runDesignPipeline(input);

    expect(result.ok).toBe(true);
    expect(mockedResearch).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value.research).toBeDefined();
      // The migrated artifact has _migrated and _rawMarkdown via passthrough
      expect(result.value.research).toHaveProperty('_migrated', true);
      expect(result.value.research).toHaveProperty('_rawMarkdown', 'some legacy research content');
    }
  });

  it('resumes with legacy { spec: string } planning shape by migrating', async () => {
    mockedResearch.mockResolvedValue({ ok: true, value: { research: { briefId: 'p', moduleId: 'p', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] } } });
    mockedDesign.mockResolvedValue({ ok: true, value: { design: { spec: {} } } });
    mockedEvaluator.mockResolvedValue({ ok: true, value: { evaluation: undefined } });

    const input = createInput({ resume: true });

    const cacheDir = join(input.projectRoot, 'agentforge/designs/test-page');
    mkdirSync(cacheDir, { recursive: true });
    // Write canonical research so research stage is skipped
    writeFileSync(join(cacheDir, 'research-brief.json'), JSON.stringify({ briefId: 'p', moduleId: 'p', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] }));
    // Write legacy planning artifact
    writeFileSync(join(cacheDir, 'planning-spec.json'), JSON.stringify({ spec: 'some legacy planning content' }));

    const result = await runDesignPipeline(input);

    expect(result.ok).toBe(true);
    expect(mockedPlanning).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value.planning).toBeDefined();
      expect(result.value.planning).toHaveProperty('_migrated', true);
      expect(result.value.planning).toHaveProperty('_rawMarkdown', 'some legacy planning content');
    }
  });

  it('skips stages before input.stage and loads their cache', async () => {
    mockedDesign.mockResolvedValue({ ok: true, value: { design: { spec: {} } } });
    mockedEvaluator.mockResolvedValue({ ok: true, value: { evaluation: undefined } });

    const input = createInput({ stage: 'design' });

    // Write cached research + planning
    const cacheDir = join(input.projectRoot, 'agentforge/designs/test-page');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'research-brief.json'), JSON.stringify({ briefId: 'cached', moduleId: 'test-page', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] }));
    writeFileSync(join(cacheDir, 'planning-spec.json'), JSON.stringify({ specRef: 'cached', moduleId: 'test-page', componentTree: [], tokenBindings: {}, responsiveRules: [] }));

    const result = await runDesignPipeline(input);

    expect(result.ok).toBe(true);
    expect(mockedResearch).not.toHaveBeenCalled();
    expect(mockedPlanning).not.toHaveBeenCalled();
    expect(mockedDesign).toHaveBeenCalledTimes(1);
  });

  it('caches stage output to disk', async () => {
    const researchOutput = { briefId: 'p', moduleId: 'p', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] };
    mockedResearch.mockResolvedValue({ ok: true, value: { research: researchOutput } });
    mockedPlanning.mockResolvedValue({ ok: true, value: { planning: { specRef: 'p', moduleId: 'p', componentTree: [], tokenBindings: {}, responsiveRules: [] } } });
    mockedDesign.mockResolvedValue({ ok: true, value: { design: { spec: { screen: 'test', nodes: {} } } } });
    mockedEvaluator.mockResolvedValue({ ok: true, value: { evaluation: undefined } });

    const input = createInput();
    await runDesignPipeline(input);

    const cachedResearch = JSON.parse(readFileSync(join(input.projectRoot, 'agentforge/designs/test-page/research-brief.json'), 'utf-8'));
    expect(cachedResearch.briefId).toBe('p');
  });
});
