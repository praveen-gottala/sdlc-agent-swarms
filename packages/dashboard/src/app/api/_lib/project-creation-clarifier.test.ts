/**
 * @jest-environment node
 *
 * Scope: Clarifier approval path in createProject().
 * Tests clarifierOutput handling: enriched-requirement.yaml, assumption-ledger.yaml,
 * PRD via renderPrdToMarkdown, threadId in agentforge.yaml, backward compat.
 */
import { createProject, CreateProjectSchema, type CreateProjectInput } from './project-creation';
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse } from 'yaml';

const REAL_MONOREPO = join(__dirname, '..', '..', '..', '..', '..', '..');

jest.mock('./project-reader', () => ({
  get MONOREPO_ROOT() {
    return process.env.__TEST_MONOREPO_ROOT ?? '/repo';
  },
  writePrefs: jest.fn(),
}));

jest.mock('@agentforge/cli', () => ({
  getComponentLibraryById: jest.fn().mockReturnValue({
    id: 'shadcn',
    libraryName: 'shadcn/ui',
    description: 'Default',
    installHint: 'npx shadcn-ui@latest init',
    docsUrl: 'https://ui.shadcn.com',
    reactMappings: {},
  }),
  optionToTokens: jest.fn(),
  optionToBrand: jest.fn(),
}));

const ENRICHED_REQUIREMENT = {
  id: 'er-1',
  rawInput: 'Build a personal finance tracker',
  mode: 'bootstrap' as const,
  prd: {
    id: 'prd-1',
    title: 'CashPulse',
    description: 'Personal finance tracker',
    features: [
      { id: 'f1', name: 'Expense Tracking', description: 'Track daily expenses', priority: 'must-have' as const },
    ],
    personas: [{ id: 'p1', name: 'User', role: 'End user', goals: ['Track spending'] }],
    dataEntities: [{
      id: 'e1',
      name: 'Expense',
      fields: [{ name: 'amount', type: 'number', required: true }],
    }],
    screens: [{ id: 's1', name: 'Dashboard', description: 'Main view', screenType: 'page' as const }],
    nfrs: [],
    successMetrics: [],
    outOfScope: [],
    version: '1.0',
    status: 'approved' as const,
  },
  assumptionLedger: {
    id: 'al-1',
    entries: [{
      id: 'a1',
      statement: 'Users have bank accounts',
      evidence: 'Common',
      confidence: 0.9,
      blastRadius: 'low' as const,
      requiresConfirmation: false,
    }],
    createdAt: '2026-05-12T00:00:00Z',
    lastUpdatedAt: '2026-05-12T00:00:00Z',
  },
  clarificationRounds: [{ round: 1, questionsAsked: 1, questionsAnswered: 1, timestamp: '2026-05-12T00:00:00Z' }],
  confidence: 0.92,
  createdAt: '2026-05-12T00:00:00Z',
};

function makeInput(overrides?: Partial<CreateProjectInput>): CreateProjectInput {
  return {
    name: `Test Project ${Date.now()}`,
    ...overrides,
  };
}

describe('createProject — clarifier approval flow', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'clarifier-test-'));
    process.env.__TEST_MONOREPO_ROOT = tempRoot;

    const catalogDir = join(tempRoot, 'packages', 'core', 'src', 'catalogs');
    mkdirSync(catalogDir, { recursive: true });
    copyFileSync(
      join(REAL_MONOREPO, 'packages', 'core', 'src', 'catalogs', 'base-component-catalog.yaml'),
      join(catalogDir, 'base-component-catalog.yaml'),
    );
  });

  afterEach(() => {
    delete process.env.__TEST_MONOREPO_ROOT;
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('writes enriched-requirement.yaml and assumption-ledger.yaml when clarifierOutput is present', async () => {
    const result = await createProject(makeInput({
      name: 'CashPulse',
      clarifierOutput: {
        enrichedRequirement: ENRICHED_REQUIREMENT,
        threadId: 'thread-123',
      },
    }));

    const projectDir = result.path;
    const erPath = join(projectDir, 'agentforge', 'spec', 'enriched-requirement.yaml');
    const alPath = join(projectDir, 'agentforge', 'spec', 'assumption-ledger.yaml');

    expect(existsSync(erPath)).toBe(true);
    expect(existsSync(alPath)).toBe(true);

    const er = parse(readFileSync(erPath, 'utf-8'));
    expect(er.id).toBe('er-1');
    expect(er.prd.title).toBe('CashPulse');
    expect(er.confidence).toBe(0.92);

    const al = parse(readFileSync(alPath, 'utf-8'));
    expect(al.id).toBe('al-1');
    expect(al.entries).toHaveLength(1);
    expect(al.entries[0].statement).toBe('Users have bank accounts');
  });

  it('writes docs/prd.md via renderPrdToMarkdown when clarifierOutput is present', async () => {
    const result = await createProject(makeInput({
      name: 'CashPulse PRD',
      clarifierOutput: {
        enrichedRequirement: ENRICHED_REQUIREMENT,
        threadId: 'thread-prd',
      },
    }));

    const prdPath = join(result.path, 'docs', 'prd.md');
    expect(existsSync(prdPath)).toBe(true);

    const prdContent = readFileSync(prdPath, 'utf-8');
    expect(prdContent).toContain('# CashPulse');
    expect(prdContent).toContain('Expense Tracking');
    expect(prdContent).toContain('`amount`');
  });

  it('writes clarifier.threadId into agentforge.yaml', async () => {
    const result = await createProject(makeInput({
      name: 'ThreadId Check',
      clarifierOutput: {
        enrichedRequirement: ENRICHED_REQUIREMENT,
        threadId: 'thread-abc-123',
      },
    }));

    const configPath = join(result.path, 'agentforge.yaml');
    const config = parse(readFileSync(configPath, 'utf-8'));
    expect(config.clarifier).toBeDefined();
    expect(config.clarifier.threadId).toBe('thread-abc-123');
    expect(config.clarifier.lastRunAt).toBeDefined();
  });

  it('does not write clarifier artifacts when clarifierOutput is absent', async () => {
    const result = await createProject(makeInput({
      name: 'No Clarifier',
    }));

    const erPath = join(result.path, 'agentforge', 'spec', 'enriched-requirement.yaml');
    const alPath = join(result.path, 'agentforge', 'spec', 'assumption-ledger.yaml');
    expect(existsSync(erPath)).toBe(false);
    expect(existsSync(alPath)).toBe(false);

    const configPath = join(result.path, 'agentforge.yaml');
    const config = parse(readFileSync(configPath, 'utf-8'));
    expect(config.clarifier).toBeUndefined();
  });

  it('returns 400 for invalid clarifierOutput data via schema validation', () => {
    const parsed = CreateProjectSchema.safeParse({
      name: 'Bad Data',
      clarifierOutput: {
        enrichedRequirement: { invalid: true },
        threadId: 'thread-bad',
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.errors.length).toBeGreaterThan(0);
    }
  });
});
