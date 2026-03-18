/**
 * @module @agentforge/cli/engine-setup.test
 *
 * Tests for engine auto-setup logic.
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  checkPython,
  checkPip,
  checkEngineSource,
  checkVenv,
  resolveEngineDir,
  resolveVenvDir,
  findPythonBinary,
  isSetupComplete,
  getUvicornPath,
  getEnginePythonPath,
} from './engine-setup.js';

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execSync: jest.fn(),
}));

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const mockExecSync = childProcess.execSync as jest.MockedFunction<typeof childProcess.execSync>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

describe('findPythonBinary', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns python3 when available', () => {
    mockExecSync.mockReturnValueOnce('Python 3.12.1' as ReturnType<typeof childProcess.execSync>);
    expect(findPythonBinary()).toBe('python3');
  });

  it('falls back to python when python3 is not available', () => {
    mockExecSync
      .mockImplementationOnce(() => { throw new Error('not found'); })
      .mockReturnValueOnce('Python 3.11.0' as ReturnType<typeof childProcess.execSync>);
    expect(findPythonBinary()).toBe('python');
  });

  it('returns null when no Python 3 is found', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(findPythonBinary()).toBeNull();
  });

  it('returns null when only Python 2 is found', () => {
    mockExecSync
      .mockImplementationOnce(() => { throw new Error('not found'); })
      .mockReturnValueOnce('Python 2.7.18' as ReturnType<typeof childProcess.execSync>);
    expect(findPythonBinary()).toBeNull();
  });
});

describe('checkPython', () => {
  afterEach(() => jest.clearAllMocks());

  it('passes when Python 3.12 is found', () => {
    mockExecSync.mockReturnValue('Python 3.12.1' as ReturnType<typeof childProcess.execSync>);
    const result = checkPython();
    expect(result.status).toBe('pass');
    expect(result.message).toContain('3.12.1');
  });

  it('passes for Python 3.10 (minimum)', () => {
    mockExecSync.mockReturnValue('Python 3.10.0' as ReturnType<typeof childProcess.execSync>);
    const result = checkPython();
    expect(result.status).toBe('pass');
  });

  it('fails for Python 3.9 (below minimum)', () => {
    mockExecSync.mockReturnValue('Python 3.9.7' as ReturnType<typeof childProcess.execSync>);
    const result = checkPython();
    expect(result.status).toBe('fail');
    expect(result.message).toContain('3.10');
  });

  it('fails when Python is not found', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    const result = checkPython();
    expect(result.status).toBe('fail');
    expect(result.fixHint).toContain('python.org');
  });
});

describe('checkPip', () => {
  afterEach(() => jest.clearAllMocks());

  it('passes when pip is available', () => {
    mockExecSync
      .mockReturnValueOnce('Python 3.12.1' as ReturnType<typeof childProcess.execSync>) // findPythonBinary
      .mockReturnValueOnce('pip 24.0 from /usr/lib (python 3.12)' as ReturnType<typeof childProcess.execSync>);
    const result = checkPip();
    expect(result.status).toBe('pass');
    expect(result.message).toContain('pip 24.0');
  });

  it('fails when pip is not available', () => {
    mockExecSync
      .mockReturnValueOnce('Python 3.12.1' as ReturnType<typeof childProcess.execSync>) // findPythonBinary
      .mockImplementationOnce(() => { throw new Error('not found'); });
    const result = checkPip();
    expect(result.status).toBe('fail');
    expect(result.fixHint).toContain('ensurepip');
  });

  it('fails when Python is not available', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    const result = checkPip();
    expect(result.status).toBe('fail');
  });
});

describe('checkEngineSource', () => {
  afterEach(() => jest.clearAllMocks());

  it('passes when pyproject.toml exists', () => {
    mockExistsSync.mockReturnValue(true);
    const result = checkEngineSource('/repo/services/engine');
    expect(result.status).toBe('pass');
  });

  it('fails when pyproject.toml is missing', () => {
    mockExistsSync.mockReturnValue(false);
    const result = checkEngineSource('/repo/services/engine');
    expect(result.status).toBe('fail');
  });
});

describe('checkVenv', () => {
  afterEach(() => jest.clearAllMocks());

  it('passes when venv and uvicorn are present', () => {
    mockExistsSync.mockReturnValue(true);
    mockExecSync.mockReturnValueOnce('0.27.0' as ReturnType<typeof childProcess.execSync>);
    const result = checkVenv('/repo/services/engine/.venv');
    expect(result.status).toBe('pass');
    expect(result.message).toContain('uvicorn 0.27.0');
  });

  it('fails when venv python does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = checkVenv('/repo/services/engine/.venv');
    expect(result.status).toBe('fail');
    expect(result.fixHint).toContain('agentforge setup');
  });

  it('fails when uvicorn is not installed in venv', () => {
    mockExistsSync.mockReturnValue(true);
    mockExecSync.mockImplementationOnce(() => { throw new Error('ModuleNotFoundError'); });
    const result = checkVenv('/repo/services/engine/.venv');
    expect(result.status).toBe('fail');
  });
});

describe('resolveEngineDir', () => {
  afterEach(() => jest.clearAllMocks());

  it('finds services/engine when pyproject.toml exists', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      return typeof p === 'string' && p.endsWith('pyproject.toml') &&
        p.includes(path.join('services', 'engine'));
    });
    const result = resolveEngineDir('/repo/my-project');
    // Should find it by walking up to /repo
    expect(result).toContain(path.join('services', 'engine'));
  });

  it('uses override path when set', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('/custom/engine\n');
    const result = resolveEngineDir('/repo');
    expect(result).toBe('/custom/engine');
  });
});

describe('resolveVenvDir', () => {
  it('returns .venv inside engine dir', () => {
    expect(resolveVenvDir('/repo/services/engine')).toBe(
      path.join('/repo/services/engine', '.venv'),
    );
  });
});

describe('isSetupComplete', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns false when marker does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(isSetupComplete('/project')).toBe(false);
  });

  it('returns true when marker and venv both exist', () => {
    mockExistsSync.mockReturnValue(true);
    // resolveEngineDir reads override file — return a valid path
    mockReadFileSync.mockReturnValue('/project/services/engine\n');
    expect(isSetupComplete('/project')).toBe(true);
  });
});

describe('getUvicornPath', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns venv uvicorn when it exists', () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      return typeof p === 'string' && p.endsWith(path.join('bin', 'uvicorn'));
    });
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const result = getUvicornPath('/project');
    expect(result).toContain('bin/uvicorn');
  });

  it('falls back to system uvicorn when venv not found', () => {
    mockExistsSync.mockReturnValue(false);
    const result = getUvicornPath('/project');
    expect(result).toBe('uvicorn');
  });
});

describe('getEnginePythonPath', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns src directory under engine dir', () => {
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const result = getEnginePythonPath('/project');
    expect(result).toContain('src');
  });
});
