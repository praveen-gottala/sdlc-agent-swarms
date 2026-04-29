/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

jest.mock('../../_lib/project-reader', () => ({
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
  getActiveProjectRoot: jest.fn().mockReturnValue('/mock/project'),
}));

jest.mock('../../_lib/run-manager', () => ({
  getActiveRun: jest.fn(),
}));

jest.mock('@agentforge/core', () => ({
  designSpecExists: jest.fn(),
}));

import { readYamlFile, writeYamlFile } from '../../_lib/project-reader';
import { getActiveRun } from '../../_lib/run-manager';
import { designSpecExists } from '@agentforge/core';

const mockReadYamlFile = readYamlFile as jest.MockedFunction<typeof readYamlFile>;
const mockWriteYamlFile = writeYamlFile as jest.MockedFunction<typeof writeYamlFile>;
const mockGetActiveRun = getActiveRun as jest.MockedFunction<typeof getActiveRun>;
const mockDesignSpecExists = designSpecExists as jest.MockedFunction<typeof designSpecExists>;

interface PageEntry {
  id: string;
  name: string;
  description: string;
  route: string;
  status: string;
  designStatus?: string;
}
interface PagesFile {
  pages: PageEntry[];
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return { json: async () => body } as NextRequest;
}

describe('POST /api/pages', () => {
  let pages: PageEntry[] = [];

  beforeEach(() => {
    jest.resetAllMocks();
    pages = [];
    mockReadYamlFile.mockImplementation((path: string) => {
      if (path === 'agentforge/spec/pages.yaml') {
        return { pages: [...pages] };
      }
      return null;
    });
    mockWriteYamlFile.mockImplementation((path: string, data: unknown) => {
      if (path === 'agentforge/spec/pages.yaml' && data && typeof data === 'object' && 'pages' in data) {
        pages = [...(data as PagesFile).pages];
      }
    });
  });

  it('returns 201 then 200 with the same pageId when description maps to the same route (dedup)', async () => {
    const description = 'Unique settings page for dedup test';

    const first = await POST(makeRequest({ description }));
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { pageId: string; description: string };
    expect(firstBody.pageId).toMatch(/^page-/);
    expect(mockWriteYamlFile).toHaveBeenCalledTimes(1);

    const second = await POST(makeRequest({ description }));
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { pageId: string; description: string };
    expect(secondBody.pageId).toBe(firstBody.pageId);
    expect(mockWriteYamlFile).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/pages', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetActiveRun.mockReturnValue(null);
    mockDesignSpecExists.mockReturnValue(false);
  });

  it('preserves generating status and returns activeRunId when a run is active for the page', async () => {
    mockReadYamlFile.mockReturnValue({
      pages: [{ id: 'page-1', name: 'Home', description: 'Home page', route: '/', status: 'draft', designStatus: 'generating' }],
    });
    mockGetActiveRun.mockReturnValue({
      runId: 'run-abc', type: 'design-browser', status: 'running',
      stage: 'Research', stageDescription: null, progress: null,
      agentRole: null, startedAt: new Date().toISOString(), completedAt: null,
      error: null, params: { pageId: 'page-1' }, cost: null, stageTimings: null,
    });

    const res = await GET();
    const data = await res.json();

    expect(data.pages[0].designStatus).toBe('generating');
    expect(data.pages[0].activeRunId).toBe('run-abc');
  });

  it('recovers generating to draft when no active run exists', async () => {
    mockReadYamlFile.mockReturnValue({
      pages: [{ id: 'page-1', name: 'Home', description: 'Home page', route: '/', status: 'draft', designStatus: 'generating' }],
    });
    mockGetActiveRun.mockReturnValue(null);

    const res = await GET();
    const data = await res.json();

    expect(data.pages[0].designStatus).toBe('draft');
    expect(data.pages[0].activeRunId).toBeUndefined();
  });

  it('recovers generating to draft when active run belongs to a different page', async () => {
    mockReadYamlFile.mockReturnValue({
      pages: [
        { id: 'page-1', name: 'Home', description: 'Home page', route: '/', status: 'draft', designStatus: 'generating' },
        { id: 'page-2', name: 'About', description: 'About page', route: '/about', status: 'draft', designStatus: 'draft' },
      ],
    });
    mockGetActiveRun.mockReturnValue({
      runId: 'run-xyz', type: 'design-browser', status: 'running',
      stage: 'Design', stageDescription: null, progress: null,
      agentRole: null, startedAt: new Date().toISOString(), completedAt: null,
      error: null, params: { pageId: 'page-2' }, cost: null, stageTimings: null,
    });

    const res = await GET();
    const data = await res.json();

    expect(data.pages[0].designStatus).toBe('draft');
    expect(data.pages[0].activeRunId).toBeUndefined();
  });

  it('preserves rendered status when spec file exists', async () => {
    mockReadYamlFile.mockReturnValue({
      pages: [{ id: 'page-1', name: 'Home', description: 'Home page', route: '/', status: 'draft', designStatus: 'rendered' }],
    });
    mockDesignSpecExists.mockReturnValue(true);

    const res = await GET();
    const data = await res.json();

    expect(data.pages[0].designStatus).toBe('rendered');
  });
});
