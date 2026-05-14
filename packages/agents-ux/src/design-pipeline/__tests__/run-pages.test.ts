/**
 * Tests for runPagesWithChromePass() shared helper (M1 Phase 3).
 *
 * Uses a mock pipeline via jest.mock on './pipeline.js'. The helper's
 * responsibility is orchestration (Chrome Pass selection, sequential loop,
 * callbacks) — not pipeline correctness.
 */

import type { PageEntry } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { PipelineInput, DesignPhaseState, PipelineStageError } from '../types.js';
import { runPagesWithChromePass } from '../run-pages.js';

jest.mock('../pipeline.js', () => ({
  runDesignPipeline: jest.fn(),
}));

jest.mock('../../prototype/index.js', () => ({
  resolveSharedComponents: jest.fn(),
  buildSharedChromeFilePayload: jest.fn().mockReturnValue({ nodes: {}, regions: [] }),
}));

jest.mock('node:fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import { runDesignPipeline } from '../pipeline.js';
import { resolveSharedComponents } from '../../prototype/index.js';

const mockRunPipeline = runDesignPipeline as jest.MockedFunction<typeof runDesignPipeline>;
const mockResolveShared = resolveSharedComponents as jest.MockedFunction<typeof resolveSharedComponents>;

function makePage(id: string, components: string[] = [], status = 'approved'): PageEntry {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    description: `${id} page`,
    route: `/${id}`,
    status,
    components,
  };
}

function makeMockInput(pageId: string): PipelineInput {
  return {
    moduleId: pageId,
    taskId: `task_${pageId}`,
    projectRoot: '/tmp/test',
    designTool: 'browser',
    providerString: 'claude',
    agentContext: {} as PipelineInput['agentContext'],
  };
}

function makeState(pageId: string): DesignPhaseState {
  return {
    moduleId: pageId,
    taskId: `task_${pageId}`,
    projectRoot: '/tmp/test',
    designTool: 'browser',
    research: { brief: 'test' } as unknown as DesignPhaseState['research'],
  };
}

function makeError(stage: string): PipelineStageError {
  return { code: 'PIPELINE_STAGE_FAILED', stage, message: `${stage} failed`, recoverable: false };
}

describe('runPagesWithChromePass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveShared.mockReturnValue(null);
  });

  it('runs all pages sequentially and calls callbacks', async () => {
    const pages = [makePage('home'), makePage('settings')];
    const onPageStart = jest.fn();
    const onPageComplete = jest.fn();

    mockRunPipeline
      .mockResolvedValueOnce(Ok(makeState('home')))
      .mockResolvedValueOnce(Ok(makeState('settings')));

    const result = await runPagesWithChromePass({
      pages,
      projectRoot: '/tmp/test',
      buildInput: (pageId) => makeMockInput(pageId),
      onPageStart,
      onPageComplete,
    });

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].status).toBe('ok');
    expect(result.pages[1].status).toBe('ok');

    expect(onPageStart).toHaveBeenCalledTimes(2);
    expect(onPageStart).toHaveBeenCalledWith('home', 0, 2);
    expect(onPageStart).toHaveBeenCalledWith('settings', 1, 2);

    expect(onPageComplete).toHaveBeenCalledTimes(2);
  });

  it('partial failure — one page fails, others still complete', async () => {
    const pages = [makePage('home'), makePage('broken'), makePage('about')];
    const onPageComplete = jest.fn();
    const onPageFail = jest.fn();

    mockRunPipeline
      .mockResolvedValueOnce(Ok(makeState('home')))
      .mockResolvedValueOnce(Err(makeError('design')))
      .mockResolvedValueOnce(Ok(makeState('about')));

    const result = await runPagesWithChromePass({
      pages,
      projectRoot: '/tmp/test',
      buildInput: (pageId) => makeMockInput(pageId),
      onPageComplete,
      onPageFail,
    });

    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].status).toBe('ok');
    expect(result.pages[1].status).toBe('failed');
    expect(result.pages[1].error?.stage).toBe('design');
    expect(result.pages[2].status).toBe('ok');

    expect(onPageComplete).toHaveBeenCalledTimes(2);
    expect(onPageFail).toHaveBeenCalledTimes(1);
    expect(onPageFail).toHaveBeenCalledWith('broken', expect.objectContaining({ stage: 'design' }), expect.any(Number));
  });

  it('handles buildInput returning null for a page', async () => {
    const pages = [makePage('home'), makePage('missing')];

    mockRunPipeline.mockResolvedValueOnce(Ok(makeState('home')));

    const result = await runPagesWithChromePass({
      pages,
      projectRoot: '/tmp/test',
      buildInput: (pageId) => pageId === 'missing' ? null : makeMockInput(pageId),
    });

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].status).toBe('ok');
    expect(result.pages[1].status).toBe('failed');
    expect(result.pages[1].error?.stage).toBe('init');

    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  it('runs Chrome Pass when shared components exist', async () => {
    const pages = [
      makePage('dashboard', ['Header', 'Sidebar']),
      makePage('settings', ['Header', 'Sidebar']),
      makePage('profile', ['Header', 'Sidebar']),
    ];

    mockResolveShared.mockReturnValue({
      components: ['Header', 'Sidebar'],
      regions: [],
      referencePageId: 'dashboard',
    });

    const chromeState: DesignPhaseState = {
      ...makeState('dashboard'),
      design: {
        spec: { screen: 'chrome', width: 1440, nodes: { header: {} } },
      },
    };

    mockRunPipeline
      .mockResolvedValueOnce(Ok(chromeState))
      .mockResolvedValueOnce(Ok(makeState('dashboard')))
      .mockResolvedValueOnce(Ok(makeState('settings')))
      .mockResolvedValueOnce(Ok(makeState('profile')));

    const onChromeComplete = jest.fn();
    const buildInput = jest.fn().mockImplementation((pageId) => makeMockInput(pageId));

    const result = await runPagesWithChromePass({
      pages,
      projectRoot: '/tmp/test',
      buildInput,
      onChromePassStart: jest.fn(),
      onChromePassComplete: onChromeComplete,
      writeChromeFile: false,
    });

    expect(mockRunPipeline).toHaveBeenCalledTimes(4);
    expect(onChromeComplete).toHaveBeenCalledTimes(1);
    expect(result.sharedChromeSpec).toBeDefined();
    expect(result.pages).toHaveLength(3);

    // Chrome Pass call should have mode='generate'
    expect(buildInput.mock.calls[0][1]).toEqual({ mode: 'generate' });

    // Per-page calls should receive chromePass config with mode='consume'
    const perPageCalls = buildInput.mock.calls.slice(1);
    for (const [, chromePass] of perPageCalls) {
      expect(chromePass).toEqual(expect.objectContaining({ mode: 'consume' }));
    }
  });

  it('skips Chrome Pass when skipChromeGeneration is true', async () => {
    const pages = [makePage('home'), makePage('settings')];
    mockResolveShared.mockReturnValue({
      components: ['Header'],
      regions: [],
      referencePageId: 'home',
    });

    mockRunPipeline
      .mockResolvedValueOnce(Ok(makeState('home')))
      .mockResolvedValueOnce(Ok(makeState('settings')));

    const result = await runPagesWithChromePass({
      pages,
      projectRoot: '/tmp/test',
      buildInput: (pageId) => makeMockInput(pageId),
      skipChromeGeneration: true,
    });

    expect(result.pages).toHaveLength(2);
    expect(mockRunPipeline).toHaveBeenCalledTimes(2);
    expect(result.sharedChromeSpec).toBeUndefined();
  });

  it('uses preloadedChromeSpec without running Chrome Pass', async () => {
    const pages = [makePage('home'), makePage('settings')];
    const preloaded = { screen: 'chrome', width: 1440, nodes: {} } as unknown as import('@agentforge/designspec-renderer').DesignSpecV2;

    mockRunPipeline
      .mockResolvedValueOnce(Ok(makeState('home')))
      .mockResolvedValueOnce(Ok(makeState('settings')));

    const buildInput = jest.fn().mockImplementation((pageId) => makeMockInput(pageId));

    const result = await runPagesWithChromePass({
      pages,
      projectRoot: '/tmp/test',
      buildInput,
      preloadedChromeSpec: preloaded,
    });

    expect(mockRunPipeline).toHaveBeenCalledTimes(2);
    expect(result.sharedChromeSpec).toBe(preloaded);

    for (const [, chromePass] of buildInput.mock.calls) {
      expect(chromePass).toEqual(expect.objectContaining({ mode: 'consume' }));
    }
  });

  it('reports duration for each page', async () => {
    const pages = [makePage('home')];

    mockRunPipeline.mockResolvedValueOnce(Ok(makeState('home')));

    const result = await runPagesWithChromePass({
      pages,
      projectRoot: '/tmp/test',
      buildInput: (pageId) => makeMockInput(pageId),
    });

    expect(result.pages[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
