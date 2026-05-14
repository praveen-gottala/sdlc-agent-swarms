/**
 * M1 "Connect" integration tests — Clarifier→Design data flow.
 *
 * Verifies the full M1 data path: enriched requirement on disk →
 * buildPipelineInput() reads it → PipelineInput.enrichedRequirement populated →
 * initState() threads it into DesignPhaseState → prdRequirements derived via
 * renderPrdToMarkdown.
 *
 * Uses the CashPulse M1 fixture (real YAML files, real filesystem).
 * Mocks only pipeline node functions (no LLM calls).
 *
 * @module __tests__/m1-connect.integration.test
 */

import { join } from 'node:path';
import { mkdtempSync, mkdirSync, cpSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { AgentContext, LLMProviderRef, EnrichedRequirement } from '@agentforge/core';
import { createRealFs, Ok, writeYaml, renderPrdToMarkdown } from '@agentforge/core';
import type { DesignPhaseState } from '../src/design-pipeline/types.js';

// Mock nodes to isolate from LLM calls — only pipeline wiring under test
jest.mock('../src/design-pipeline/nodes.js', () => ({
  researchNode: jest.fn(),
  planningNode: jest.fn(),
  designNode: jest.fn(),
  evaluatorNode: jest.fn(),
}));

import { buildPipelineInput, runDesignPipeline } from '../src/index.js';
import { researchNode } from '../src/design-pipeline/nodes.js';

const mockedResearch = researchNode as jest.MockedFunction<typeof researchNode>;

// ── Helpers ──

const FIXTURE_DIR = join(__dirname, 'fixtures/cashpulse-m1');

function copyFixtureToTemp(): string {
  const tmp = mkdtempSync(join(tmpdir(), 'm1-connect-'));
  cpSync(FIXTURE_DIR, tmp, { recursive: true });
  return tmp;
}

function createMockAgentContext(projectRoot: string): AgentContext {
  return {
    taskId: 'test-task',
    projectRoot,
    eventBus: {
      publish: jest.fn(),
      emit: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      history: jest.fn().mockReturnValue([]),
    },
    fs: createRealFs(),
    runGovernance: jest.fn(),
    resolveProvider: jest.fn().mockReturnValue(Ok({
      name: 'test',
      complete: jest.fn(),
      stream: jest.fn(),
      estimateCost: jest.fn().mockReturnValue({ inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, inputTokens: 0, outputTokens: 0 }),
    } as LLMProviderRef)),
    recordAudit: jest.fn(),
  };
}

beforeEach(() => jest.clearAllMocks());

// ── Tests ──

describe('M1 Connect: Clarifier→Design data flow', () => {
  it('happy path: enriched requirement flows from disk through pipeline state', async () => {
    const projectRoot = copyFixtureToTemp();
    const agentContext = createMockAgentContext(projectRoot);

    // 1. buildPipelineInput reads enriched-requirement.yaml
    const input = buildPipelineInput({
      pageId: 'dashboard',
      taskId: 'task-m1-happy',
      projectRoot,
      agentContext,
    });

    expect(input).not.toBeNull();
    const pi = input!;

    // enrichedRequirement present with correct structure
    expect(pi.enrichedRequirement).toBeDefined();
    const er = pi.enrichedRequirement!;

    // Correct screen count from CashPulse PRD (7 screens)
    expect(er.prd.screens).toHaveLength(7);

    // Entity names present
    const entityNames = er.prd.dataEntities.map(e => e.name);
    expect(entityNames).toContain('Expense');
    expect(entityNames).toContain('Category');
    expect(entityNames).toContain('Budget');

    // Confidence is valid number
    expect(typeof er.confidence).toBe('number');
    expect(er.confidence).toBeGreaterThanOrEqual(0);
    expect(er.confidence).toBeLessThanOrEqual(1);

    // prdRequirements undefined — initState() will derive via renderPrdToMarkdown
    expect(pi.prdRequirements).toBeUndefined();

    // 2. runDesignPipeline threads enrichedRequirement into state via initState()
    let capturedState: DesignPhaseState | undefined;
    mockedResearch.mockImplementation(async (state) => {
      capturedState = state;
      return Ok({ research: { briefId: 'r', moduleId: 'dashboard', requirementIds: [], designConstraints: [], referencePatterns: [], accessibilityRequirements: [], dataModelDependencies: [] } });
    });

    // Mock remaining nodes to let pipeline complete
    const { planningNode, designNode, evaluatorNode } = jest.requireMock('../src/design-pipeline/nodes.js');
    (planningNode as jest.Mock).mockResolvedValue(Ok({ planning: { specRef: 'p', moduleId: 'dashboard', componentTree: [], tokenBindings: {}, responsiveRules: [] } }));
    (designNode as jest.Mock).mockResolvedValue(Ok({ design: { spec: {} } }));
    (evaluatorNode as jest.Mock).mockResolvedValue(Ok({ evaluation: undefined }));

    const result = await runDesignPipeline(pi);
    expect(result.ok).toBe(true);

    // initState() threaded enrichedRequirement through to state
    expect(capturedState).toBeDefined();
    expect(capturedState!.enrichedRequirement).toBeDefined();
    expect(capturedState!.enrichedRequirement!.prd.title).toBe('CashPulse — Personal Expense Tracker');

    // initState() derived prdRequirements from enrichedRequirement.prd via renderPrdToMarkdown
    expect(capturedState!.prdRequirements).toBeDefined();
    expect(capturedState!.prdRequirements!.length).toBe(1);
    const prdContent = capturedState!.prdRequirements![0];
    expect(prdContent).toContain('Expense');
    expect(prdContent).toContain('Category');
    expect(prdContent).toContain('Budget Summary Dashboard');

    // Verify it matches the deterministic renderer output
    expect(prdContent).toBe(renderPrdToMarkdown(er.prd));
  });

  it('fallback path: missing enriched-requirement.yaml falls back to flat PRD', () => {
    const projectRoot = copyFixtureToTemp();

    // Remove enriched-requirement.yaml to simulate pre-M1 project
    unlinkSync(join(projectRoot, 'agentforge/spec/enriched-requirement.yaml'));

    const agentContext = createMockAgentContext(projectRoot);
    const input = buildPipelineInput({
      pageId: 'dashboard',
      taskId: 'task-m1-fallback',
      projectRoot,
      agentContext,
    });

    expect(input).not.toBeNull();
    const pi = input!;

    // enrichedRequirement absent
    expect(pi.enrichedRequirement).toBeUndefined();

    // prdRequirements populated from description + docs/prd.md
    expect(pi.prdRequirements).toBeDefined();
    expect(pi.prdRequirements!.length).toBeGreaterThanOrEqual(1);

    // Two elements: [description, prdContent from docs/prd.md]
    expect(pi.prdRequirements!.length).toBe(2);
    expect(pi.prdRequirements![0]).toContain('budget summary');
    expect(pi.prdRequirements![1]).toContain('CashPulse');
  });

  it('cross-phase disk path parity: write path matches read path', () => {
    // Replicate the exact write sequence from createProject (project-creation.ts:247-265):
    //   writeYaml(specDir/enriched-requirement.yaml, enrichedRequirement)
    //   writeYaml(specDir/assumption-ledger.yaml, assumptionLedger)
    // Then verify buildPipelineInput reads the same data back.
    const projectRoot = mkdtempSync(join(tmpdir(), 'm1-parity-'));
    mkdirSync(join(projectRoot, 'agentforge/spec'), { recursive: true });
    mkdirSync(join(projectRoot, 'docs'), { recursive: true });

    const fs = createRealFs();

    // Write pages.yaml (required by buildPipelineInput)
    writeYaml(
      join(projectRoot, 'agentforge/spec/pages.yaml'),
      { pages: [{ id: 'home', name: 'Home', description: 'Test page', route: '/', status: 'approved' }] },
      fs,
    );

    // Source enriched requirement (what the Clarifier produces)
    const sourceEnriched: EnrichedRequirement = {
      id: 'er-parity-test',
      rawInput: 'Test parity check',
      mode: 'bootstrap',
      prd: {
        id: 'prd-parity',
        title: 'Parity Test App',
        description: 'Tests write/read path match',
        features: [
          { id: 'f1', name: 'Feature A', description: 'First feature', priority: 'must-have' },
        ],
        personas: [
          { id: 'p1', name: 'Tester', role: 'QA', goals: ['Verify parity'] },
        ],
        dataEntities: [
          { id: 'de1', name: 'Widget', fields: [{ name: 'id', type: 'string', required: true }] },
        ],
        screens: [
          { id: 's1', name: 'Home', description: 'Main page' },
        ],
        nfrs: [],
        successMetrics: [],
        outOfScope: [],
        version: '1.0',
        status: 'draft',
      },
      assumptionLedger: {
        id: 'al-parity',
        entries: [],
        createdAt: '2026-05-14T00:00:00Z',
        lastUpdatedAt: '2026-05-14T00:00:00Z',
      },
      clarificationRounds: [],
      confidence: 0.9,
      createdAt: '2026-05-14T00:00:00Z',
    };

    // Write using the same path pattern as createProject (project-creation.ts:249,258)
    const specDir = join(projectRoot, 'agentforge', 'spec');
    const erResult = writeYaml(join(specDir, 'enriched-requirement.yaml'), sourceEnriched, fs);
    expect(erResult.ok).toBe(true);

    const alResult = writeYaml(join(specDir, 'assumption-ledger.yaml'), sourceEnriched.assumptionLedger, fs);
    expect(alResult.ok).toBe(true);

    // Read back via buildPipelineInput
    const agentContext = createMockAgentContext(projectRoot);
    const input = buildPipelineInput({
      pageId: 'home',
      taskId: 'task-parity',
      projectRoot,
      agentContext,
    });

    expect(input).not.toBeNull();
    const readBack = input!.enrichedRequirement;
    expect(readBack).toBeDefined();

    // Structural parity: key fields match what was written
    expect(readBack!.id).toBe(sourceEnriched.id);
    expect(readBack!.confidence).toBe(sourceEnriched.confidence);
    expect(readBack!.prd.title).toBe(sourceEnriched.prd.title);
    expect(readBack!.prd.features).toHaveLength(sourceEnriched.prd.features.length);
    expect(readBack!.prd.dataEntities[0].name).toBe('Widget');
    expect(readBack!.assumptionLedger.id).toBe(sourceEnriched.assumptionLedger.id);

    // Deep equality — YAML round-trip preserves all data
    expect(readBack!.prd).toEqual(sourceEnriched.prd);
    expect(readBack!.assumptionLedger).toEqual(sourceEnriched.assumptionLedger);
  });
});
