import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { parse, stringify } from 'yaml';

/** Resolve the monorepo root (two levels up from packages/dashboard). */
export const MONOREPO_ROOT = join(process.cwd(), '..', '..');

const PREFS_FILE = join(MONOREPO_ROOT, '.agentforge-dashboard-prefs.json');

interface DashboardPrefs {
  activeProject: string;
}

/** Reads the dashboard preferences file. Returns null if missing or invalid. */
function readPrefs(): DashboardPrefs | null {
  if (!existsSync(PREFS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PREFS_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

/** Writes the dashboard preferences file. */
export function writePrefs(prefs: DashboardPrefs): void {
  writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
}

/**
 * Discovers all AgentForge project directories in the monorepo root.
 * A directory is a project if it contains agentforge.yaml.
 */
export function discoverProjects(): { dirName: string; path: string }[] {
  const results: { dirName: string; path: string }[] = [];
  if (!existsSync(MONOREPO_ROOT)) return results;
  const entries = readdirSync(MONOREPO_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'packages') continue;
    const yamlPath = join(MONOREPO_ROOT, entry.name, 'agentforge.yaml');
    if (existsSync(yamlPath)) {
      results.push({ dirName: entry.name, path: join(MONOREPO_ROOT, entry.name) });
    }
  }
  return results;
}

/**
 * Returns the active project root directory.
 * Resolution order:
 *   1. AGENTFORGE_PROJECT_DIR env var
 *   2. .agentforge-dashboard-prefs.json activeProject
 *   3. First directory in monorepo root containing agentforge.yaml
 */
export function getActiveProjectRoot(): string {
  // 1. Env var
  const envDir = getEnvVar('AGENTFORGE_PROJECT_DIR');
  if (envDir) {
    if (existsSync(join(envDir, 'agentforge.yaml'))) return envDir;
  }

  // 2. Prefs file
  const prefs = readPrefs();
  if (prefs?.activeProject && existsSync(join(prefs.activeProject, 'agentforge.yaml'))) {
    return prefs.activeProject;
  }

  // 3. Auto-discover
  const projects = discoverProjects();
  if (projects.length > 0) return projects[0].path;

  throw new Error('No AgentForge project found. Run `agentforge init` or set AGENTFORGE_PROJECT_DIR.');
}

/** Returns the absolute path to the active project root. */
export function getProjectRoot(): string {
  return getActiveProjectRoot();
}

/** Reads and parses a YAML file relative to the project root. Returns null if missing. */
export function readYamlFile<T>(relativePath: string): T | null {
  const projectRoot = getActiveProjectRoot();
  const fullPath = join(projectRoot, relativePath);
  if (!existsSync(fullPath)) return null;
  const content = readFileSync(fullPath, 'utf-8');
  return parse(content) as T;
}

/** Writes a YAML file relative to the project root. Creates parent directories. */
export function writeYamlFile(relativePath: string, data: unknown): void {
  const projectRoot = getActiveProjectRoot();
  const fullPath = join(projectRoot, relativePath);
  const dir = join(fullPath, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, stringify(data));
}

/** Reads a text file relative to the project root. Returns null if missing. */
export function readTextFile(relativePath: string): string | null {
  const projectRoot = getActiveProjectRoot();
  const fullPath = join(projectRoot, relativePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf-8');
}

/** Returns true if the given relative path exists within the project root. */
export function fileExists(relativePath: string): boolean {
  return existsSync(join(getActiveProjectRoot(), relativePath));
}

/** Lists directory entries relative to the project root. Returns empty array if missing. */
export function listDir(relativePath: string): string[] {
  const fullPath = join(getActiveProjectRoot(), relativePath);
  if (!existsSync(fullPath)) return [];
  return readdirSync(fullPath);
}

/**
 * Reads an env var, falling back to the monorepo root .env file.
 * Next.js only auto-loads .env from its own package directory, so
 * this bridges the gap for credentials stored at the repo root.
 */
let _envCache: Record<string, string> | null = null;

function loadRootEnv(): Record<string, string> {
  if (_envCache) return _envCache;
  _envCache = {};
  const envPath = join(MONOREPO_ROOT, '.env');
  if (!existsSync(envPath)) return _envCache;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    _envCache[key] = val;
  }
  return _envCache;
}

/** Get an env var — checks process.env first, then the monorepo root .env. */
export function getEnvVar(key: string): string | undefined {
  return process.env[key] ?? loadRootEnv()[key];
}
