/**
 * @jest-environment node
 */
import { POST } from './route';

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  rmSync: jest.fn(),
}));

jest.mock('../_lib/project-reader', () => ({
  discoverProjects: jest.fn(),
  MONOREPO_ROOT: '/repo',
  writePrefs: jest.fn(),
}));

jest.mock('@agentforge/cli', () => ({
  buildDesignTokensSpec: jest.fn(),
  buildBrandSpec: jest.fn(),
  getComponentLibraryById: jest.fn(),
  generateTailwindConfig: jest.fn(),
  generateGlobalCss: jest.fn(),
  optionToTokens: jest.fn(),
  optionToBrand: jest.fn(),
}));

jest.mock('@agentforge/core', () => ({
  createRealFs: jest.fn(),
  generateProjectCatalog: jest.fn(),
  saveComponentCatalog: jest.fn(),
  saveComponentLibrary: jest.fn(),
}));

import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { writePrefs } from '../_lib/project-reader';
import * as core from '@agentforge/core';
import * as cli from '@agentforge/cli';

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;
const mockRmSync = rmSync as jest.MockedFunction<typeof rmSync>;
const mockWritePrefs = writePrefs as jest.MockedFunction<typeof writePrefs>;
const mockBuildDesignTokensSpec = cli.buildDesignTokensSpec as jest.MockedFunction<typeof cli.buildDesignTokensSpec>;
const mockBuildBrandSpec = cli.buildBrandSpec as jest.MockedFunction<typeof cli.buildBrandSpec>;
const mockGenerateTailwindConfig = cli.generateTailwindConfig as jest.MockedFunction<typeof cli.generateTailwindConfig>;
const mockGenerateGlobalCss = cli.generateGlobalCss as jest.MockedFunction<typeof cli.generateGlobalCss>;
const mockGetComponentLibraryById = cli.getComponentLibraryById as jest.MockedFunction<typeof cli.getComponentLibraryById>;
const mockCreateRealFs = core.createRealFs as jest.MockedFunction<typeof core.createRealFs>;
const mockGenerateProjectCatalog = core.generateProjectCatalog as jest.MockedFunction<typeof core.generateProjectCatalog>;
const mockSaveComponentLibrary = core.saveComponentLibrary as jest.MockedFunction<typeof core.saveComponentLibrary>;
const mockSaveComponentCatalog = core.saveComponentCatalog as jest.MockedFunction<typeof core.saveComponentCatalog>;

function makeRequest(body: Record<string, unknown>) {
  return { json: async () => body } as Request;
}

function setupHappyPathMocks() {
  mockExistsSync.mockReturnValue(false);
  mockReadFileSync.mockReturnValue('version: "1.0"\ncomponents: {}\n');
  mockBuildDesignTokensSpec.mockReturnValue({
    touch_targets: { minimum_height: 44 },
  } as ReturnType<typeof cli.buildDesignTokensSpec>);
  mockBuildBrandSpec.mockReturnValue({} as ReturnType<typeof cli.buildBrandSpec>);
  mockGenerateTailwindConfig.mockReturnValue('// tailwind');
  mockGenerateGlobalCss.mockReturnValue('/* css */');
  mockCreateRealFs.mockReturnValue({} as ReturnType<typeof core.createRealFs>);
  mockGenerateProjectCatalog.mockReturnValue({ components: {} } as ReturnType<typeof core.generateProjectCatalog>);
  mockSaveComponentLibrary.mockReturnValue({ ok: true, value: undefined } as ReturnType<typeof core.saveComponentLibrary>);
  mockSaveComponentCatalog.mockReturnValue({ ok: true, value: undefined } as ReturnType<typeof core.saveComponentCatalog>);
  mockGetComponentLibraryById.mockReturnValue({
    id: 'mui',
    libraryName: 'MUI v5',
    description: 'Material library',
    installHint: 'npm install @mui/material',
    docsUrl: 'https://mui.com',
    reactMappings: {},
  });
}

describe('POST /api/projects', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setupHappyPathMocks();
  });

  it('creates component library and catalog files for dashboard projects', async () => {
    const response = await POST(makeRequest({
      name: 'Music Showcase',
      description: 'A dashboard-created project',
      designArchetype: 'professional',
      componentLibrary: 'material',
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.projectId).toBe('music-showcase');
    expect(mockGetComponentLibraryById).toHaveBeenCalledWith('mui');
    expect(mockSaveComponentLibrary).toHaveBeenCalledTimes(1);
    expect(mockGenerateProjectCatalog).toHaveBeenCalledTimes(1);
    expect(mockSaveComponentCatalog).toHaveBeenCalledTimes(1);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/repo/music-showcase/agentforge/spec/project.yaml',
      expect.stringContaining('app:'),
    );
    expect(mockWritePrefs).toHaveBeenCalledWith({ activeProject: '/repo/music-showcase' });
  });

  it('falls back to shadcn when the wizard sends custom', async () => {
    mockGetComponentLibraryById.mockReturnValue({
      id: 'shadcn',
      libraryName: 'shadcn/ui',
      description: 'Default fallback',
      installHint: 'npx shadcn-ui@latest init',
      docsUrl: 'https://ui.shadcn.com',
      reactMappings: {},
    });

    const response = await POST(makeRequest({
      name: 'Fallback Project',
      componentLibrary: 'custom',
    }) as never);

    expect(response.status).toBe(201);
    expect(mockGetComponentLibraryById).toHaveBeenCalledWith('shadcn');
    expect(mockSaveComponentCatalog).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when name is missing', async () => {
    const response = await POST(makeRequest({ description: 'No name' }) as never);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/required/i);
  });

  it('returns 400 when name is empty or whitespace-only', async () => {
    const response = await POST(makeRequest({ name: '   ' }) as never);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/required/i);
  });

  it('returns 400 when name has no alphanumeric characters', async () => {
    const response = await POST(makeRequest({ name: '---' }) as never);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/alphanumeric/i);
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    const response = await POST(makeRequest({ name: 'a'.repeat(101) }) as never);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/100 characters/i);
  });

  it('returns 409 when project directory already exists', async () => {
    mockExistsSync.mockReturnValue(true);

    const response = await POST(makeRequest({ name: 'Existing Project' }) as never);

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toMatch(/already exists/i);
  });

  it('cleans up project directory on component library save failure', async () => {
    // existsSync: false for "already exists" check, true for cleanup check
    let callCount = 0;
    mockExistsSync.mockImplementation(() => {
      callCount++;
      return callCount > 1; // first call = "already exists?" (false), subsequent = cleanup (true)
    });
    mockSaveComponentLibrary.mockReturnValue({
      ok: false,
      error: { message: 'Library save failed' },
    } as ReturnType<typeof core.saveComponentLibrary>);

    const response = await POST(makeRequest({ name: 'Cleanup Test' }) as never);

    expect(response.status).toBe(500);
    expect(mockRmSync).toHaveBeenCalledWith(
      '/repo/cleanup-test',
      { recursive: true, force: true },
    );
  });

  it('cleans up project directory on catalog save failure', async () => {
    let callCount = 0;
    mockExistsSync.mockImplementation(() => {
      callCount++;
      return callCount > 1;
    });
    mockSaveComponentCatalog.mockReturnValue({
      ok: false,
      error: { message: 'Catalog save failed' },
    } as ReturnType<typeof core.saveComponentCatalog>);

    const response = await POST(makeRequest({ name: 'Catalog Fail' }) as never);

    expect(response.status).toBe(500);
    expect(mockRmSync).toHaveBeenCalledWith(
      '/repo/catalog-fail',
      { recursive: true, force: true },
    );
  });

  it('does not leak internal error details to the client', async () => {
    mockSaveComponentLibrary.mockReturnValue({
      ok: false,
      error: { message: 'EACCES: permission denied, open /repo/secret/path' },
    } as ReturnType<typeof core.saveComponentLibrary>);

    const response = await POST(makeRequest({ name: 'Error Leak' }) as never);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to create project');
    expect(data.error).not.toContain('/repo/secret/path');
  });
});
