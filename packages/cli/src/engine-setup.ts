/**
 * @module @agentforge/cli/engine-setup
 *
 * Auto-setup for the Python orchestration engine.
 * Detects whether Python, pip, and engine dependencies are installed,
 * and bootstraps them automatically on first run.
 */

import { execSync, type ExecSyncOptions } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

/** Minimum Python version required by the engine. */
const MIN_PYTHON_VERSION = { major: 3, minor: 10 };

/** Marker file written after successful dependency install. */
const SETUP_MARKER = '.agentforge/engine-installed';

/** Result of a single prerequisite check. */
export interface PrereqCheck {
  readonly name: string;
  readonly status: 'pass' | 'fail';
  readonly message: string;
  readonly fixHint?: string;
}

/** Overall setup status. */
export interface SetupStatus {
  readonly ready: boolean;
  readonly checks: readonly PrereqCheck[];
  readonly engineDir: string;
  readonly venvDir: string;
}

/**
 * Resolve the engine source directory.
 * In development (monorepo), it's at `services/engine` relative to the repo root.
 * The engine dir is also stored at `.agentforge/engine-path` if overridden.
 */
export function resolveEngineDir(projectRoot: string): string {
  // Check for override
  const overridePath = path.join(projectRoot, '.agentforge', 'engine-path');
  if (fs.existsSync(overridePath)) {
    const custom = fs.readFileSync(overridePath, 'utf-8').trim();
    if (custom && fs.existsSync(custom)) return custom;
  }

  // Walk up from projectRoot looking for services/engine/pyproject.toml
  let dir = projectRoot;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'services', 'engine');
    if (fs.existsSync(path.join(candidate, 'pyproject.toml'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Fallback: assume monorepo layout from cwd
  return path.join(projectRoot, 'services', 'engine');
}

/**
 * Resolve the virtual environment directory for the engine.
 */
export function resolveVenvDir(engineDir: string): string {
  return path.join(engineDir, '.venv');
}

/**
 * Try to run a command and return its stdout, or null on failure.
 */
function tryExec(cmd: string, options?: ExecSyncOptions): string | null {
  try {
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...options });
    return String(result).trim();
  } catch {
    return null;
  }
}

/**
 * Find a working Python 3 binary name.
 */
export function findPythonBinary(): string | null {
  for (const bin of ['python3', 'python']) {
    const version = tryExec(`${bin} --version`);
    if (version && version.startsWith('Python 3')) {
      return bin;
    }
  }
  return null;
}

/**
 * Parse a Python version string like "Python 3.12.1" into { major, minor, patch }.
 */
function parsePythonVersion(versionStr: string): { major: number; minor: number; patch: number } | null {
  const match = versionStr.match(/Python (\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Check if Python meets the minimum version requirement.
 */
export function checkPython(): PrereqCheck {
  const pythonBin = findPythonBinary();
  if (!pythonBin) {
    return {
      name: 'Python',
      status: 'fail',
      message: 'Python 3 not found in PATH',
      fixHint: 'Install Python 3.10+: https://www.python.org/downloads/',
    };
  }

  const versionStr = tryExec(`${pythonBin} --version`);
  if (!versionStr) {
    return {
      name: 'Python',
      status: 'fail',
      message: 'Could not determine Python version',
      fixHint: 'Ensure python3 is in your PATH',
    };
  }

  const version = parsePythonVersion(versionStr);
  if (!version) {
    return {
      name: 'Python',
      status: 'fail',
      message: `Unexpected version format: ${versionStr}`,
    };
  }

  if (version.major < MIN_PYTHON_VERSION.major ||
      (version.major === MIN_PYTHON_VERSION.major && version.minor < MIN_PYTHON_VERSION.minor)) {
    return {
      name: 'Python',
      status: 'fail',
      message: `Python ${version.major}.${version.minor}.${version.patch} found, need ${MIN_PYTHON_VERSION.major}.${MIN_PYTHON_VERSION.minor}+`,
      fixHint: 'Upgrade Python: https://www.python.org/downloads/',
    };
  }

  return {
    name: 'Python',
    status: 'pass',
    message: `${versionStr} (${pythonBin})`,
  };
}

/**
 * Check if pip is available.
 */
export function checkPip(): PrereqCheck {
  const pythonBin = findPythonBinary();
  if (!pythonBin) {
    return {
      name: 'pip',
      status: 'fail',
      message: 'Python not available (pip check skipped)',
    };
  }

  const pipVersion = tryExec(`${pythonBin} -m pip --version`);
  if (!pipVersion) {
    return {
      name: 'pip',
      status: 'fail',
      message: 'pip not available',
      fixHint: `Install pip: ${pythonBin} -m ensurepip --upgrade`,
    };
  }

  return {
    name: 'pip',
    status: 'pass',
    message: pipVersion.split('(')[0].trim(),
  };
}

/**
 * Check if the engine source directory exists.
 */
export function checkEngineSource(engineDir: string): PrereqCheck {
  const pyprojectPath = path.join(engineDir, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) {
    return {
      name: 'Engine source',
      status: 'fail',
      message: `pyproject.toml not found at ${engineDir}`,
      fixHint: 'Ensure the AgentForge repository is cloned completely',
    };
  }

  return {
    name: 'Engine source',
    status: 'pass',
    message: engineDir,
  };
}

/**
 * Check if the virtual environment and dependencies are installed.
 */
export function checkVenv(venvDir: string): PrereqCheck {
  const venvPython = path.join(venvDir, 'bin', 'python');
  if (!fs.existsSync(venvPython)) {
    return {
      name: 'Virtual environment',
      status: 'fail',
      message: 'Not created yet',
      fixHint: 'Run "agentforge setup" to create it',
    };
  }

  // Check if uvicorn is installed in venv
  const uvicornCheck = tryExec(`${venvPython} -c "import uvicorn; print(uvicorn.__version__)"`);
  if (!uvicornCheck) {
    return {
      name: 'Virtual environment',
      status: 'fail',
      message: 'venv exists but engine dependencies not installed',
      fixHint: 'Run "agentforge setup" to install dependencies',
    };
  }

  return {
    name: 'Virtual environment',
    status: 'pass',
    message: `Dependencies installed (uvicorn ${uvicornCheck})`,
  };
}

/**
 * Check all prerequisites and return the overall status.
 */
export function checkPrerequisites(projectRoot: string): SetupStatus {
  const engineDir = resolveEngineDir(projectRoot);
  const venvDir = resolveVenvDir(engineDir);

  const checks = [
    checkPython(),
    checkPip(),
    checkEngineSource(engineDir),
    checkVenv(venvDir),
  ];

  return {
    ready: checks.every((c) => c.status === 'pass'),
    checks,
    engineDir,
    venvDir,
  };
}

/**
 * Check if the setup marker indicates dependencies are already installed.
 */
export function isSetupComplete(projectRoot: string): boolean {
  const engineDir = resolveEngineDir(projectRoot);
  const venvDir = resolveVenvDir(engineDir);
  const markerPath = path.join(projectRoot, SETUP_MARKER);

  if (!fs.existsSync(markerPath)) return false;

  // Verify venv still exists
  const venvPython = path.join(venvDir, 'bin', 'python');
  return fs.existsSync(venvPython);
}

/**
 * Create a virtual environment and install engine dependencies.
 * Returns progress messages via the onProgress callback.
 */
export async function setupEngine(
  projectRoot: string,
  onProgress: (message: string) => void,
): Promise<Result<{ engineDir: string; venvDir: string }>> {
  const engineDir = resolveEngineDir(projectRoot);
  const venvDir = resolveVenvDir(engineDir);

  // Step 1: Verify Python
  const pythonBin = findPythonBinary();
  if (!pythonBin) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: 'Python 3.10+ is required but not found. Install from https://www.python.org/downloads/',
      recoverable: false,
    });
  }

  // Step 2: Verify engine source
  const pyprojectPath = path.join(engineDir, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Engine source not found at ${engineDir}. Ensure the repository is complete.`,
      recoverable: false,
    });
  }

  // Step 3: Create venv if needed
  const venvPython = path.join(venvDir, 'bin', 'python');
  if (!fs.existsSync(venvPython)) {
    onProgress('Creating Python virtual environment...');
    const venvResult = tryExec(`${pythonBin} -m venv "${venvDir}"`);
    if (venvResult === null && !fs.existsSync(venvPython)) {
      return Err({
        code: 'INVALID_STATE' as const,
        message: `Failed to create virtual environment at ${venvDir}`,
        recoverable: false,
      });
    }
  }

  // Step 4: Install dependencies
  onProgress('Installing engine dependencies...');
  const pipInstall = path.join(venvDir, 'bin', 'pip');
  const installResult = tryExec(
    `"${pipInstall}" install -e "${engineDir}"`,
    { cwd: engineDir, timeout: 300_000 },
  );

  if (installResult === null) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: 'Failed to install engine dependencies. Check your network connection and try again.',
      recoverable: true,
    });
  }

  // Step 5: Verify installation
  onProgress('Verifying installation...');
  const verifyResult = tryExec(`"${venvPython}" -c "import agentforge_engine; import uvicorn; print('ok')"`);
  if (verifyResult !== 'ok') {
    return Err({
      code: 'INVALID_STATE' as const,
      message: 'Dependencies installed but verification failed. Run "agentforge setup" to retry.',
      recoverable: true,
    });
  }

  // Step 6: Write marker file
  const markerPath = path.join(projectRoot, SETUP_MARKER);
  const markerDir = path.dirname(markerPath);
  if (!fs.existsSync(markerDir)) {
    fs.mkdirSync(markerDir, { recursive: true });
  }
  fs.writeFileSync(markerPath, new Date().toISOString());

  return Ok({ engineDir, venvDir });
}

/**
 * Get the path to uvicorn inside the venv, or fall back to system uvicorn.
 */
export function getUvicornPath(projectRoot: string): string {
  const engineDir = resolveEngineDir(projectRoot);
  const venvDir = resolveVenvDir(engineDir);
  const venvUvicorn = path.join(venvDir, 'bin', 'uvicorn');

  if (fs.existsSync(venvUvicorn)) {
    return venvUvicorn;
  }

  // Fallback to system uvicorn (for users who installed manually)
  return 'uvicorn';
}

/**
 * Get the PYTHONPATH needed for the engine to find its modules.
 */
export function getEnginePythonPath(projectRoot: string): string {
  const engineDir = resolveEngineDir(projectRoot);
  return path.join(engineDir, 'src');
}
