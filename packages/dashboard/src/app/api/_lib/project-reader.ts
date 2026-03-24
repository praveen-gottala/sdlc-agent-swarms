import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

/** Resolve the bookshelf project root (relative to the monorepo) */
const MONOREPO_ROOT = join(process.cwd(), '..', '..');
const PROJECT_ROOT = join(MONOREPO_ROOT, 'bookshelf');

/** Returns the absolute path to the bookshelf project root. */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}

/** Reads and parses a YAML file relative to the project root. Returns null if missing. */
export function readYamlFile<T>(relativePath: string): T | null {
  const fullPath = join(PROJECT_ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  const content = readFileSync(fullPath, 'utf-8');
  return parse(content) as T;
}

/** Reads a text file relative to the project root. Returns null if missing. */
export function readTextFile(relativePath: string): string | null {
  const fullPath = join(PROJECT_ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf-8');
}

/** Returns true if the given relative path exists within the project root. */
export function fileExists(relativePath: string): boolean {
  return existsSync(join(PROJECT_ROOT, relativePath));
}

/** Lists directory entries relative to the project root. Returns empty array if missing. */
export function listDir(relativePath: string): string[] {
  const fullPath = join(PROJECT_ROOT, relativePath);
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
