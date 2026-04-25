/**
 * @jest-environment node
 *
 * Scope (see CLAUDE.md §Test Quality Gates):
 *   - Owns: route handler validation branches, error→cleanup wiring,
 *     and the dashboard→core mapping contract (asserts that POST
 *     forwards the right shape to `scaffoldProject`).
 *   - Does NOT own: scaffold output correctness — that lives in
 *     `packages/core/src/scaffolding/__tests__/scaffold-parity.test.ts`.
 *     Do not re-assert created-file lists or YAML content here.
 *
 *   Heavy mock surface is acceptable until Phase 3 of unify-pipeline
 *   converts this into an integration test against a tmp dir.
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
  getComponentLibraryById: jest.fn(),
  optionToTokens: jest.fn(),
  optionToBrand: jest.fn(),
}));

jest.mock('@agentforge/core', () => ({
  buildDesignTokensSpec: jest.fn(),
  buildBrandSpec: jest.fn(),
  createRealFs: jest.fn(),
  saveComponentLibrary: jest.fn(),
  scaffoldProject: jest.fn(),
}));

import { existsSync, readFileSync, rmSync } from 'fs';
import { writePrefs } from '../_lib/project-reader';
import * as core from '@agentforge/core';
import * as cli from '@agentforge/cli';

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockRmSync = rmSync as jest.MockedFunction<typeof rmSync>;
const mockWritePrefs = writePrefs as jest.MockedFunction<typeof writePrefs>;
const mockBuildDesignTokensSpec = core.buildDesignTokensSpec as jest.MockedFunction<typeof core.buildDesignTokensSpec>;
const mockBuildBrandSpec = core.buildBrandSpec as jest.MockedFunction<typeof core.buildBrandSpec>;
const mockGetComponentLibraryById = cli.getComponentLibraryById as jest.MockedFunction<typeof cli.getComponentLibraryById>;
const mockCreateRealFs = core.createRealFs as jest.MockedFunction<typeof core.createRealFs>;
const mockSaveComponentLibrary = core.saveComponentLibrary as jest.MockedFunction<typeof core.saveComponentLibrary>;
const mockScaffoldProject = core.scaffoldProject as jest.MockedFunction<typeof core.scaffoldProject>;

function makeRequest(body: Record<string, unknown>) {
  return { json: async () => body } as Request;
}

function setupHappyPathMocks() {
  mockExistsSync.mockReturnValue(false);
  mockReadFileSync.mockReturnValue('version: "1.0"\ncomponents: {}\n');
  mockBuildDesignTokensSpec.mockReturnValue({
    touch_targets: { minimum_height: 44 },
  } as ReturnType<typeof core.buildDesignTokensSpec>);
  mockBuildBrandSpec.mockReturnValue({} as ReturnType<typeof core.buildBrandSpec>);
  mockCreateRealFs.mockReturnValue({} as ReturnType<typeof core.createRealFs>);
  mockSaveComponentLibrary.mockReturnValue({ ok: true, value: undefined } as ReturnType<typeof core.saveComponentLibrary>);
  mockScaffoldProject.mockReturnValue({ ok: true, value: { createdFiles: [] } } as ReturnType<typeof core.scaffoldProject>);
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
    expect(mockScaffoldProject).toHaveBeenCalledTimes(1);
    expect(mockScaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Music Showcase', componentLibraryId: 'mui' }),
      '/repo/apps/music-showcase',
      expect.anything(),
    );
    expect(mockWritePrefs).toHaveBeenCalledWith({ activeProject: '/repo/apps/music-showcase' });
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
    expect(mockScaffoldProject).toHaveBeenCalledTimes(1);
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
    let callCount = 0;
    mockExistsSync.mockImplementation(() => {
      callCount++;
      return callCount !== 2;
    });
    mockSaveComponentLibrary.mockReturnValue({
      ok: false,
      error: { message: 'Library save failed' },
    } as ReturnType<typeof core.saveComponentLibrary>);

    const response = await POST(makeRequest({ name: 'Cleanup Test' }) as never);

    expect(response.status).toBe(500);
    expect(mockRmSync).toHaveBeenCalledWith(
      '/repo/apps/cleanup-test',
      { recursive: true, force: true },
    );
  });

  it('cleans up project directory on scaffold failure', async () => {
    let callCount = 0;
    mockExistsSync.mockImplementation(() => {
      callCount++;
      return callCount !== 2;
    });
    mockScaffoldProject.mockReturnValue({
      ok: false,
      error: { code: 'INVALID_STATE' as const, message: 'Scaffold failed', recoverable: false },
    } as ReturnType<typeof core.scaffoldProject>);

    const response = await POST(makeRequest({ name: 'Scaffold Fail' }) as never);

    expect(response.status).toBe(500);
    expect(mockRmSync).toHaveBeenCalledWith(
      '/repo/apps/scaffold-fail',
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
