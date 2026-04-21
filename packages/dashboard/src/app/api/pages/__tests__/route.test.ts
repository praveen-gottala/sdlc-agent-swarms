/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST } from '../route';

jest.mock('../../_lib/project-reader', () => ({
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
}));

import { readYamlFile, writeYamlFile } from '../../_lib/project-reader';

const mockReadYamlFile = readYamlFile as jest.MockedFunction<typeof readYamlFile>;
const mockWriteYamlFile = writeYamlFile as jest.MockedFunction<typeof writeYamlFile>;

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
