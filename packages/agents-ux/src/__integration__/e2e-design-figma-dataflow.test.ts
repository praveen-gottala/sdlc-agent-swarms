/**
 * @module e2e-design-figma-dataflow
 *
 * End-to-end integration test verifying that PRD content and design tokens
 * flow through the real LLM pipeline and influence research/planning output.
 *
 * This test was created because two critical bugs went undetected:
 * 1. PRD not passed — research stage received only ["home"] instead of full PRD content
 * 2. Design system not wired — design tokens and brand spec were never loaded
 *
 * Skipped by default. Enable with:
 *   RUN_E2E_PROOF=true ANTHROPIC_API_KEY=sk-ant-... npx jest \
 *     --config packages/agents-ux/jest.config.cjs \
 *     --testPathPattern="e2e-design-figma-dataflow" \
 *     --verbose --testTimeout=600000
 *
 * Estimated cost: ~$0.50-1.00 in API tokens per run.
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from repo root before reading env vars
dotenvConfig({ path: resolve(__dirname, '../../../../.env') });

import type {
  AgentContext,
  MCPClient,
  FileSystem,
  LLMProviderRef,
  DesignTokensSpec,
  BrandSpec,
} from '@agentforge/core';
import { Ok, Err, createEventBus } from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import { stringify } from 'yaml';
import type {
  UXDashboardResearchInput,
  UXDashboardResearchOutput,
  UXDashboardPlanningInput,
  UXDashboardPlanningOutput,
} from '../index.js';
import {
  uxDashboardResearchWork,
  uxDashboardPlanningWork,
  buildDesignSystemContextFromSpec,
} from '../index.js';

// ============================================================================
// Environment gate
// ============================================================================

const E2E_ENABLED = process.env.RUN_E2E_PROOF === 'true';
const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

const describeE2E = E2E_ENABLED ? describe : describe.skip;

// ============================================================================
// Test data — distinctive domain terms for assertion
// ============================================================================

const PRD_CONTENT = `# BookShelf

BookShelf is a personal library app for tracking books by ISBN, managing reading
lists, sharing book reviews with friends, and discovering new titles.

## Key Features
- ISBN barcode scanning for quick book entry
- Reading list management with progress tracking
- Review writing and sharing via social feed
- Book discovery recommendations based on reading history
- Library statistics dashboard showing genres read, pages per month
`;

const BOOKSHELF_TOKENS: DesignTokensSpec = {
  version: '1.0',
  created_by: 'e2e-test',
  colors: {
    primitive: {
      'forest-green': '#228B22',
      cream: '#FFFDD0',
      'dark-walnut': '#5C4033',
    },
    semantic: {
      'background-primary': 'cream',
      'text-primary': 'dark-walnut',
      'cta-primary': 'forest-green',
    },
  },
  typography: {
    font_families: { display: 'Merriweather', body: 'Lato' },
    scale: [
      { role: 'heading-1', size: 36, weight: 700, family: 'display' },
      { role: 'body', size: 16, weight: 400, family: 'body' },
    ],
  },
  spacing: { unit: 8, scale: [4, 8, 12, 16, 24, 32] },
  borders: { radius: { small: 8, medium: 12 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
  elevation: {
    levels: [
      { level: 0, shadow: 'none', description: 'Flat, no elevation' },
      { level: 1, shadow: '0 1px 3px rgba(0,0,0,0.08)', description: 'Cards resting on surface' },
      { level: 2, shadow: '0 4px 12px rgba(0,0,0,0.12)', description: 'Dropdowns, popovers' },
      { level: 3, shadow: '0 8px 24px rgba(0,0,0,0.16)', description: 'Modals, dialogs' },
    ],
  },
  layout: {
    grid: { columns: 12, gutter: 24, margin: 24 },
    content_max_width: 1280,
    breakpoints: { mobile: 640, tablet: 768, desktop: 1024, wide: 1440 },
  },
  z_index: { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300, tooltip: 1400 },
};

const BOOKSHELF_BRAND: BrandSpec = {
  version: '1.0',
  created_by: 'e2e-test',
  identity: { tone: 'warm and bookish', audience: 'book lovers' },
  illustration_style: { direction: 'illustrated', description: 'Cozy hand-drawn feel' },
  motion_principles: {
    page_transitions: 'fade',
    interaction_feel: 'gentle',
    easing: 'ease-in-out',
    duration_base_ms: 300,
  },
  accessibility: { wcag_level: 'AA' },
};

// ============================================================================
// Mock factories
// ============================================================================

const createMockFs = (): FileSystem => ({
  readFile: () => Err({ code: 'INVALID_STATE' as const, message: 'mock fs: no file', recoverable: false }),
  writeFile: () => Ok(undefined),
  writeFileAtomic: () => Ok(undefined),
  exists: () => false,
  mkdir: () => Ok(undefined),
  rename: () => Ok(undefined),
  remove: () => Ok(undefined),
  listDir: () => Ok([]),
  appendFile: () => Ok(undefined),
});

/** Disk-backed design-tokens.yaml required for planning+ after research (disk-only token policy). */
const createMockFsWithDesignTokens = (projectRoot: string): FileSystem => {
  const specDir = `${projectRoot}/agentforge/spec`;
  const tokensPath = `${specDir}/design-tokens.yaml`;
  const base = createMockFs();
  return {
    ...base,
    exists: (p: string) => p === specDir || p === tokensPath,
    readFile: (p: string) =>
      p === tokensPath ? Ok(stringify(BOOKSHELF_TOKENS)) : base.readFile(p),
  };
};

const createMockMCPClient = (): MCPClient => ({
  callTool: async () => Ok({}),
  listTools: async () => Ok([]),
  isAvailable: async () => true,
});

const createMockContext = (): AgentContext => ({
  taskId: 'e2e-dataflow-001',
  projectRoot: '/tmp/agentforge-e2e',
  eventBus: createEventBus(),
  fs: createMockFs(),
  mcpClient: createMockMCPClient(),
  runGovernance: async () => Ok({ status: 'proceed' as const }),
  resolveProvider: () => Err({ code: 'MCP_UNAVAILABLE' as const, message: 'mock', recoverable: false }),
  recordAudit: () => {},
});

// ============================================================================
// Pipeline
// ============================================================================

describeE2E('E2E: PRD + design system data flow through pipeline', () => {
  let researchOutput: UXDashboardResearchOutput;
  let planningOutput: UXDashboardPlanningOutput;
  let designSystemPrompt: string;

  beforeAll(async () => {
    const base = createMockContext();
    const context: AgentContext = {
      ...base,
      fs: createMockFsWithDesignTokens(base.projectRoot),
    };
    const provider = createClaudeProvider('claude-sonnet-4', { apiKey: API_KEY });

    // Stage 1: Research — with full PRD content + design tokens
    const researchInput: UXDashboardResearchInput = {
      moduleId: 'bookshelf-home',
      taskId: 'e2e-dataflow-001',
      prdRequirements: ['home', PRD_CONTENT],
      designTokensSpec: BOOKSHELF_TOKENS,
    };

    const researchResult = await uxDashboardResearchWork(
      researchInput,
      provider as unknown as LLMProviderRef,
      [],
      context,
    );

    if (!researchResult.ok) {
      throw new Error(`Research failed: ${researchResult.error.message}`);
    }
    researchOutput = researchResult.value;

    // Stage 2: Planning
    const planningInput: UXDashboardPlanningInput = {
      briefId: researchOutput.briefId,
      moduleId: 'bookshelf-home',
      taskId: 'e2e-dataflow-001',
      designBrief: researchOutput,
    };

    const planningResult = await uxDashboardPlanningWork(
      planningInput,
      provider as unknown as LLMProviderRef,
      [],
      context,
    );

    if (!planningResult.ok) {
      throw new Error(`Planning failed: ${planningResult.error.message}`);
    }
    planningOutput = planningResult.value;

    // Build design system prompt from spec
    const dsCtx = buildDesignSystemContextFromSpec(
      BOOKSHELF_TOKENS,
      BOOKSHELF_BRAND,
      planningOutput,
    );
    designSystemPrompt = dsCtx.designSystemPrompt;
  }, 600_000);

  it('research output references app-specific terms', () => {
    const serialized = JSON.stringify(researchOutput);
    // This would have FAILED with the old bug (only "home" was passed)
    expect(serialized).toMatch(/book|library|isbn|reading/i);
  });

  it('planning output inherits domain context', () => {
    const serialized = JSON.stringify(planningOutput);
    // Component names/descriptions should reference book/library concepts
    expect(serialized).toMatch(/book|library|reading|review/i);
  });

  it('design system prompt contains project brand', () => {
    expect(designSystemPrompt).toContain('warm and bookish');
    expect(designSystemPrompt).toContain('AA');
  });

  it('design system prompt contains project colors', () => {
    // Should contain either the color name or its hex/RGB equivalent
    expect(designSystemPrompt).toMatch(/forest-green|228B22|0\.13.*0\.55.*0\.13/i);
  });
});
