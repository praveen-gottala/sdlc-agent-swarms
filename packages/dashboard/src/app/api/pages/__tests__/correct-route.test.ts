/**
 * @jest-environment node
 *
 * Scope: correct route (POST /api/pages/[pageId]/design/correct).
 * Verifies the route uses BrowserFeedbackAdapter to apply LLM-driven
 * corrections from user feedback tags.
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

jest.mock('../../_lib/llm-provider', () => ({
  getClaudeProvider: jest.fn(() => ({
    provider: { complete: jest.fn(), stream: jest.fn(), estimateCost: jest.fn(), name: 'test' },
    authMethod: 'api_key',
  })),
  NO_CLAUDE_AUTH_ERROR: 'No Claude auth',
}));

jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
}));

const mockWriteDesignSpec = jest.fn();
const mockReadDesignSpecText = jest.fn();
const mockBackupDesignSpec = jest.fn();

jest.mock('@agentforge/core', () => ({
  readDesignSpecText: (...args: unknown[]) => mockReadDesignSpecText(...args),
  writeDesignSpec: (...args: unknown[]) => mockWriteDesignSpec(...args),
  backupDesignSpec: (...args: unknown[]) => mockBackupDesignSpec(...args),
}));

import { readYamlFile, writeYamlFile, readTextFile } from '../../_lib/project-reader';
import { BrowserFeedbackAdapter } from '@agentforge/agents-ux';

const mockReadYaml = readYamlFile as jest.MockedFunction<typeof readYamlFile>;
const mockReadText = readTextFile as jest.MockedFunction<typeof readTextFile>;
const mockWriteYaml = writeYamlFile as jest.MockedFunction<typeof writeYamlFile>;

const SAMPLE_SPEC = {
  screen: 'dashboard',
  width: 1440,
  nodes: {
    root: { parent: null, type: 'page', order: 0 },
    header: { parent: 'root', type: 'header', order: 0 },
    card: { parent: 'root', type: 'container', order: 1 },
  },
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/pages/dashboard/design/correct', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/pages/[pageId]/design/correct', () => {
  let pages: Array<Record<string, unknown>>;

  beforeEach(() => {
    jest.clearAllMocks();

    pages = [{
      id: 'dashboard',
      name: 'Dashboard',
      description: 'Main dashboard',
      route: '/dashboard',
      status: 'approved',
      designStatus: 'rendered',
      correctionIteration: 0,
    }];

    mockReadYaml.mockImplementation((path: string) => {
      if (path === 'agentforge/spec/pages.yaml') {
        return { pages: JSON.parse(JSON.stringify(pages)) };
      }
      return null;
    });

    mockWriteYaml.mockImplementation((_path: string, data: unknown) => {
      if (data && typeof data === 'object' && 'pages' in data) {
        pages = (data as { pages: Array<Record<string, unknown>> }).pages;
      }
    });

    mockReadDesignSpecText.mockReturnValue(JSON.stringify(SAMPLE_SPEC));

    mockReadText.mockImplementation((path: string) => {
      if (path === 'agentforge/designs/dashboard.json') {
        return JSON.stringify(SAMPLE_SPEC);
      }
      return null;
    });

    mockReviewDesign.mockResolvedValue({
      ok: true,
      value: {
        patches: { header: { background: 'accent' }, card: { radius: 8 } },
        reasoning: 'Applied requested fixes',
      },
    });

    mockApplyPatch.mockReturnValue({
      ...SAMPLE_SPEC,
      nodes: {
        root: { parent: null, type: 'page', order: 0 },
        header: { parent: 'root', type: 'header', order: 0, background: 'accent' },
        card: { parent: 'root', type: 'container', order: 1, radius: 8 },
      },
    });
  });

  it('returns 400 when tags array is missing', async () => {
    const { POST } = await import('../[pageId]/design/correct/route');
    const res = await POST(makeRequest({}), { params: Promise.resolve({ pageId: 'dashboard' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when page does not exist', async () => {
    const { POST } = await import('../[pageId]/design/correct/route');
    const res = await POST(
      makeRequest({ tags: [{ nodeId: 'header', feedback: 'fix color' }] }),
      { params: Promise.resolve({ pageId: 'nonexistent' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when max correction iterations reached', async () => {
    pages[0].correctionIteration = 3;
    const { POST } = await import('../[pageId]/design/correct/route');
    const res = await POST(
      makeRequest({ tags: [{ nodeId: 'header', feedback: 'fix it' }] }),
      { params: Promise.resolve({ pageId: 'dashboard' }) },
    );
    expect(res.status).toBe(409);
  });

  it('calls BrowserFeedbackAdapter with feedback message from tags', async () => {
    const { POST } = await import('../[pageId]/design/correct/route');
    const res = await POST(
      makeRequest({
        tags: [
          { nodeId: 'header', feedback: 'wrong color' },
          { nodeId: 'card', feedback: 'needs rounded corners' },
        ],
      }),
      { params: Promise.resolve({ pageId: 'dashboard' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(BrowserFeedbackAdapter).toHaveBeenCalledTimes(1);
    expect(mockReviewDesign).toHaveBeenCalledTimes(1);

    const feedbackMsg = mockReviewDesign.mock.calls[0][1] as string;
    expect(feedbackMsg).toContain('[header]: wrong color');
    expect(feedbackMsg).toContain('[card]: needs rounded corners');

    expect(json.patchesApplied).toBe(2);
    expect(json.reasoning).toBe('Applied requested fixes');
  });

  it('writes corrected spec to disk', async () => {
    const { POST } = await import('../[pageId]/design/correct/route');
    await POST(
      makeRequest({ tags: [{ nodeId: 'header', feedback: 'fix' }] }),
      { params: Promise.resolve({ pageId: 'dashboard' }) },
    );

    expect(mockApplyPatch).toHaveBeenCalledTimes(1);

    expect(mockWriteDesignSpec).toHaveBeenCalledWith('/test-project', 'dashboard', expect.anything());
  });

  it('increments correctionIteration', async () => {
    const { POST } = await import('../[pageId]/design/correct/route');
    const res = await POST(
      makeRequest({ tags: [{ nodeId: 'header', feedback: 'fix' }] }),
      { params: Promise.resolve({ pageId: 'dashboard' }) },
    );
    const json = await res.json();

    expect(json.iteration).toBe(1);
    expect(pages[0].correctionIteration).toBe(1);
    expect(pages[0].designStatus).toBe('rendered');
  });

  it('returns 503 when no LLM provider available', async () => {
    const { getClaudeProvider } = await import('../../_lib/llm-provider');
    (getClaudeProvider as jest.Mock).mockReturnValue(null);

    const { POST } = await import('../[pageId]/design/correct/route');
    const res = await POST(
      makeRequest({ tags: [{ nodeId: 'header', feedback: 'fix' }] }),
      { params: Promise.resolve({ pageId: 'dashboard' }) },
    );
    expect(res.status).toBe(503);
  });
});
