/**
 * @jest-environment node
 */
import { POST } from './route';

jest.mock('../../_lib/project-reader', () => ({
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
}));

import { readYamlFile, writeYamlFile } from '../../_lib/project-reader';

const mockReadYamlFile = readYamlFile as jest.MockedFunction<typeof readYamlFile>;
const mockWriteYamlFile = writeYamlFile as jest.MockedFunction<typeof writeYamlFile>;

function makeRequest(body: Record<string, unknown>) {
  return { json: async () => body } as Request;
}

function setupManifestMocks() {
  mockReadYamlFile.mockImplementation((path: string) => {
    if (path === 'agentforge.yaml') {
      return {
        project: {
          name: 'Music Showcase v3',
          description: 'Streaming app',
        },
      };
    }
    if (path === 'agentforge/spec/project.yaml') {
      return {
        version: '1.0',
        app: { name: 'Older Name', description: 'Older description' },
        adrs: [{ id: 'ADR-001' }],
      };
    }
    return null;
  });
}

describe('POST /api/spec/approve', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupManifestMocks();
  });

  it('writes project.yaml alongside approved spec files', async () => {
    const response = await POST(makeRequest({
      pages: [{ id: 'discover', name: 'Discover', components: [] }],
      models: [{ id: 'album', name: 'Album', fields: [] }],
      endpoints: [{ method: 'GET', path: '/api/albums', description: 'List albums' }],
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.written).toEqual(['project.yaml', 'pages.yaml', 'models.yaml', 'api.yaml']);
    expect(mockWriteYamlFile).toHaveBeenCalledWith('agentforge/spec/project.yaml', {
      version: '1.0',
      app: {
        name: 'Music Showcase v3',
        description: 'Streaming app',
      },
      adrs: [{ id: 'ADR-001' }],
    });
  });

  it('writes only pages when models and endpoints are absent', async () => {
    const response = await POST(makeRequest({
      pages: [{ name: 'Home' }],
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.written).toEqual(['project.yaml', 'pages.yaml']);
    expect(mockWriteYamlFile).toHaveBeenCalledTimes(2); // project.yaml + pages.yaml
  });

  it('writes only models when pages and endpoints are absent', async () => {
    const response = await POST(makeRequest({
      models: [{ id: 'user', name: 'User', fields: [] }],
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.written).toEqual(['project.yaml', 'models.yaml']);
  });

  it('writes only endpoints when pages and models are absent', async () => {
    const response = await POST(makeRequest({
      endpoints: [{ method: 'POST', path: '/api/users', description: 'Create user' }],
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.written).toEqual(['project.yaml', 'api.yaml']);
  });

  it('returns 400 when no specs are provided', async () => {
    const response = await POST(makeRequest({}) as never);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/at least one/i);
  });

  it('adds default fields to pages missing id and route', async () => {
    const response = await POST(makeRequest({
      pages: [{ name: 'Dashboard Settings' }],
    }) as never);

    expect(response.status).toBe(200);
    const pagesCall = mockWriteYamlFile.mock.calls.find(
      (call) => call[0] === 'agentforge/spec/pages.yaml',
    );
    expect(pagesCall).toBeDefined();
    const pagesData = pagesCall![1] as { pages: Array<Record<string, unknown>> };
    expect(pagesData.pages[0].id).toBe('dashboard-settings');
    expect(pagesData.pages[0].route).toBe('/dashboard-settings');
    expect(pagesData.pages[0].status).toBe('draft');
    expect(pagesData.pages[0].designStatus).toBe('draft');
  });

  it('returns 500 when writeYamlFile throws', async () => {
    mockWriteYamlFile.mockImplementation(() => {
      throw new Error('disk full');
    });

    const response = await POST(makeRequest({
      pages: [{ name: 'Fail Page' }],
    }) as never);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('disk full');
  });

  it('falls back to Untitled Project when manifest has no project name', async () => {
    mockReadYamlFile.mockImplementation(() => null);

    const response = await POST(makeRequest({
      pages: [{ name: 'Test' }],
    }) as never);

    expect(response.status).toBe(200);
    const projectCall = mockWriteYamlFile.mock.calls.find(
      (call) => call[0] === 'agentforge/spec/project.yaml',
    );
    expect(projectCall).toBeDefined();
    const projectData = projectCall![1] as { app: { name: string } };
    expect(projectData.app.name).toBe('Untitled Project');
  });
});
