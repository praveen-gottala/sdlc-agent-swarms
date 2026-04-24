/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST } from '../route';

jest.mock('../../../../../_lib/project-reader', () => ({
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
  readTextFile: jest.fn(),
  getActiveProjectRoot: jest.fn(() => '/tmp/test-project'),
}));

jest.mock('../../../../../_lib/run-manager', () => ({
  startRun: jest.fn(),
  updateRunStatus: jest.fn(),
  completeRun: jest.fn(),
  failRun: jest.fn(),
}));

jest.mock('../../../../../_lib/llm-provider', () => ({
  getClaudeProvider: jest.fn(),
  NO_CLAUDE_AUTH_ERROR: 'No Claude auth configured',
}));

jest.mock('../../../../../_lib/event-writer', () => ({
  emitStageEvent: jest.fn(),
  emitLLMCallEvent: jest.fn(),
  emitAgentLogEvent: jest.fn(),
}));

const mockLoadTasks = jest.fn().mockReturnValue({ ok: true, value: { tasks: [] } });
const mockAddTask = jest.fn().mockReturnValue({ ok: true, value: { tasks: [] } });
jest.mock('@agentforge/core', () => ({
  addTask: () => mockAddTask(),
  saveTasks: jest.fn(),
  loadTasks: () => mockLoadTasks(),
  createRealFs: jest.fn(() => ({})),
  debugLog: jest.fn(),
}));

jest.mock('../../../../../_lib/pipeline-helpers', () => ({
  resolveDesignModel: jest.fn((m: string) => m || 'claude-sonnet-4-6'),
  buildDesignSpecSystemPrompt: jest.fn(() => 'system prompt'),
  callPipelineStage: jest.fn(),
  callClaudeDesignAPI: jest.fn(),
  transitionTaskStatus: jest.fn(),
  DEFAULT_DESIGN_MODEL: 'claude-sonnet-4-6',
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

import { readYamlFile, getActiveProjectRoot } from '../../../../../_lib/project-reader';
import { startRun } from '../../../../../_lib/run-manager';
import { getClaudeProvider } from '../../../../../_lib/llm-provider';
import { existsSync } from 'fs';

const mockGetProjectRoot = getActiveProjectRoot as jest.MockedFunction<typeof getActiveProjectRoot>;

const mockReadYaml = readYamlFile as jest.MockedFunction<typeof readYamlFile>;
const mockStartRun = startRun as jest.MockedFunction<typeof startRun>;
const mockGetClaude = getClaudeProvider as jest.MockedFunction<typeof getClaudeProvider>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

function makeRequest(body: Record<string, unknown>): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function makeParams(pageId: string): { params: Promise<{ pageId: string }> } {
  return { params: Promise.resolve({ pageId }) };
}

const PAGES = [
  { id: 'page-001', name: 'Dashboard', description: 'Main dashboard', route: '/dashboard', status: 'active', designStatus: 'rendered' },
];

describe('POST /api/pages/[pageId]/design/chat', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetProjectRoot.mockReturnValue('/tmp/test-project');
    mockReadYaml.mockImplementation((path: string) => {
      if (path === 'agentforge/spec/pages.yaml') return { pages: [...PAGES] };
      return null;
    });
    mockLoadTasks.mockReturnValue({ ok: true, value: { tasks: [] } });
    mockAddTask.mockReturnValue({ ok: true, value: { tasks: [] } });
  });

  it('returns 400 when message is empty', async () => {
    const res = await POST(makeRequest({ message: '' }), makeParams('page-001'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/message.*required/i);
  });

  it('returns 400 when message is missing', async () => {
    const res = await POST(makeRequest({}), makeParams('page-001'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is invalid JSON', async () => {
    const badReq = { json: async () => { throw new Error('bad json'); } } as unknown as NextRequest;
    const res = await POST(badReq, makeParams('page-001'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when page does not exist', async () => {
    const res = await POST(makeRequest({ message: 'change something' }), makeParams('page-999'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 404 when design spec does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await POST(makeRequest({ message: 'change something' }), makeParams('page-001'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/generate.*first/i);
  });

  it('returns 503 when no Claude auth is configured', async () => {
    mockExistsSync.mockReturnValue(true);
    mockGetClaude.mockReturnValue(null);
    const res = await POST(makeRequest({ message: 'change something' }), makeParams('page-001'));
    expect(res.status).toBe(503);
  });

  it('returns 409 when a run is already active', async () => {
    mockExistsSync.mockReturnValue(true);
    mockGetClaude.mockReturnValue({ provider: {} as never, authMethod: 'api_key' });
    mockStartRun.mockReturnValue({ ok: false, error: 'A pipeline run is already in progress', activeRun: {} as never });
    const res = await POST(makeRequest({ message: 'change something' }), makeParams('page-001'));
    expect(res.status).toBe(409);
  });

  it('returns 200 with runId when all validations pass', async () => {
    mockExistsSync.mockReturnValue(true);
    mockGetClaude.mockReturnValue({ provider: {} as never, authMethod: 'api_key' });
    mockStartRun.mockReturnValue({ ok: true, run: { runId: 'run-test-123' } as never });
    const res = await POST(makeRequest({ message: 'add a sidebar' }), makeParams('page-001'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe('run-test-123');
    expect(body.pageId).toBe('page-001');
    expect(body.status).toBe('running');
  });
});
