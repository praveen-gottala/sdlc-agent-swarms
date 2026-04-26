/**
 * @jest-environment node
 *
 * Scope: chat route (POST /api/pages/[pageId]/design/chat).
 * Verifies the route uses BrowserFeedbackAdapter for a single LLM call
 * instead of the old 3-stage pipeline.
 */

import { NextRequest } from 'next/server';

// ── Mocks ──

const mockReviewDesign = jest.fn();
const mockApplyPatch = jest.fn();

jest.mock('@agentforge/designspec-renderer', () => ({
  normalizeSpecOverrides: jest.fn((spec: unknown) => spec),
}));

jest.mock('@agentforge/agents-ux', () => ({
  BrowserFeedbackAdapter: jest.fn().mockImplementation(() => ({
    reviewDesign: mockReviewDesign,
    applyPatch: mockApplyPatch,
    showPreview: jest.fn(),
  })),
}));

jest.mock('../../_lib/project-reader', () => ({
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
  readTextFile: jest.fn(),
  getActiveProjectRoot: jest.fn(() => '/test-project'),
}));

jest.mock('../../_lib/run-manager', () => ({
  startRun: jest.fn(() => ({ ok: true, run: { runId: 'run-1' } })),
  updateRunStatus: jest.fn(),
  completeRun: jest.fn(),
  failRun: jest.fn(),
}));

jest.mock('../../_lib/dashboard-sink', () => {
  return {
    DashboardSseSink: jest.fn().mockImplementation(() => ({
      onStageStart: jest.fn(),
      onStageComplete: jest.fn(),
      onStageFail: jest.fn(),
      onLlmCall: jest.fn(),
      onLog: jest.fn(),
      getTotalCostUsd: jest.fn(() => 0),
      getTotalTokens: jest.fn(() => 0),
    })),
  };
});

jest.mock('../../_lib/llm-provider', () => ({
  getClaudeProvider: jest.fn(() => ({
    provider: { complete: jest.fn(), stream: jest.fn(), estimateCost: jest.fn(), name: 'test' },
    authMethod: 'api_key',
  })),
  NO_CLAUDE_AUTH_ERROR: 'No Claude auth',
}));

jest.mock('../../_lib/pipeline-helpers', () => ({
  resolveDesignModel: jest.fn(() => 'claude-sonnet-4-6'),
  transitionTaskStatus: jest.fn(),
}));

jest.mock('@agentforge/core', () => ({
  addTask: jest.fn(() => ({ ok: true, value: { tasks: [] } })),
  saveTasks: jest.fn(),
  loadTasks: jest.fn(() => ({ ok: true, value: { tasks: [] } })),
  createRealFs: jest.fn(() => ({})),
}));

jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(() => JSON.stringify({
    screen: 'dashboard',
    width: 1440,
    nodes: {
      root: { parent: null, type: 'page', order: 0 },
      header: { parent: 'root', type: 'header', order: 0 },
    },
  })),
}));

import { readYamlFile } from '../../_lib/project-reader';
import { completeRun, failRun } from '../../_lib/run-manager';
import { writeFileSync } from 'fs';
import { BrowserFeedbackAdapter } from '@agentforge/agents-ux';

const mockReadYaml = readYamlFile as jest.MockedFunction<typeof readYamlFile>;

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/pages/dashboard/design/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/pages/[pageId]/design/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockReadYaml.mockImplementation((path: string) => {
      if (path === 'agentforge/spec/pages.yaml') {
        return {
          pages: [{
            id: 'dashboard',
            name: 'Dashboard',
            description: 'Main dashboard',
            route: '/dashboard',
            status: 'approved',
            designStatus: 'rendered',
            chatIteration: 0,
          }],
        };
      }
      return null;
    });

    mockReviewDesign.mockResolvedValue({
      ok: true,
      value: {
        patches: { header: { background: 'primary' } },
        reasoning: 'Changed header background',
      },
    });

    mockApplyPatch.mockReturnValue({
      screen: 'dashboard',
      width: 1440,
      nodes: {
        root: { parent: null, type: 'page', order: 0 },
        header: { parent: 'root', type: 'header', order: 0, background: 'primary' },
      },
    });
  });

  it('returns 400 when message is missing', async () => {
    const { POST } = await import('../[pageId]/design/chat/route');
    const res = await POST(makeRequest({}), { params: Promise.resolve({ pageId: 'dashboard' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when page does not exist', async () => {
    const { POST } = await import('../[pageId]/design/chat/route');
    const res = await POST(
      makeRequest({ message: 'change color' }),
      { params: Promise.resolve({ pageId: 'nonexistent' }) },
    );
    expect(res.status).toBe(404);
  });

  it('creates BrowserFeedbackAdapter (not 3-stage pipeline)', async () => {
    const { POST } = await import('../[pageId]/design/chat/route');
    const res = await POST(
      makeRequest({ message: 'change the header to blue' }),
      { params: Promise.resolve({ pageId: 'dashboard' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('running');
    expect(json.runId).toBe('run-1');

    // Wait for async pipeline to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(BrowserFeedbackAdapter).toHaveBeenCalledTimes(1);
    expect(mockReviewDesign).toHaveBeenCalledTimes(1);
    expect(mockReviewDesign).toHaveBeenCalledWith(
      expect.objectContaining({ screen: 'dashboard', nodes: expect.any(Object) }),
      'change the header to blue',
    );
  });

  it('writes updated spec to disk after applying patch', async () => {
    const { POST } = await import('../[pageId]/design/chat/route');
    await POST(
      makeRequest({ message: 'change color' }),
      { params: Promise.resolve({ pageId: 'dashboard' }) },
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockApplyPatch).toHaveBeenCalledTimes(1);

    const specWriteCalls = (writeFileSync as jest.Mock).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).endsWith('dashboard.json'),
    );
    expect(specWriteCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('writes chat message artifact', async () => {
    const { POST } = await import('../[pageId]/design/chat/route');
    await POST(
      makeRequest({ message: 'make it red' }),
      { params: Promise.resolve({ pageId: 'dashboard' }) },
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    const chatMsgCalls = (writeFileSync as jest.Mock).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('chat-message.txt'),
    );
    expect(chatMsgCalls.length).toBe(1);
    expect(chatMsgCalls[0][1]).toBe('make it red');
  });

  it('completes the run on success', async () => {
    const { POST } = await import('../[pageId]/design/chat/route');
    await POST(
      makeRequest({ message: 'tweak spacing' }),
      { params: Promise.resolve({ pageId: 'dashboard' }) },
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(completeRun).toHaveBeenCalledWith('run-1', expect.objectContaining({
      totalCostUsd: expect.any(Number),
      tokensUsed: expect.any(Number),
    }));
  });

  it('fails the run when reviewDesign returns error', async () => {
    mockReviewDesign.mockResolvedValue({
      ok: false,
      error: { code: 'LLM_API_ERROR', message: 'API key expired', recoverable: false },
    });

    const { POST } = await import('../[pageId]/design/chat/route');
    await POST(
      makeRequest({ message: 'change color' }),
      { params: Promise.resolve({ pageId: 'dashboard' }) },
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(failRun).toHaveBeenCalledWith('run-1', 'API key expired');
  });
});
