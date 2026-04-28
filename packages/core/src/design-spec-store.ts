/**
 * @module @agentforge/core/design-spec-store
 *
 * Shared storage layer for design spec files.
 * Both CLI pipeline and dashboard API routes use this to ensure
 * a single canonical read/write path: agentforge/designs/{pageId}.json
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DESIGNS_DIR = 'agentforge/designs';

function specPath(projectRoot: string, pageId: string): string {
  return join(projectRoot, DESIGNS_DIR, `${pageId}.json`);
}

function backupPath(projectRoot: string, pageId: string): string {
  return join(projectRoot, DESIGNS_DIR, `${pageId}.backup.json`);
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function normalizeShape(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (record.nodes && typeof record.nodes === 'object') return record;
  if (record.spec && typeof record.spec === 'object') {
    const nested = record.spec as Record<string, unknown>;
    if (nested.nodes && typeof nested.nodes === 'object') return nested;
  }
  return null;
}

/** Read a design spec from the canonical path. Returns null if missing or invalid. */
export function readDesignSpec(projectRoot: string, pageId: string): Record<string, unknown> | null {
  const p = specPath(projectRoot, pageId);
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'));
    return normalizeShape(raw);
  } catch {
    return null;
  }
}

/** Read raw design spec text from the canonical path. Returns null if missing. */
export function readDesignSpecText(projectRoot: string, pageId: string): string | null {
  const p = specPath(projectRoot, pageId);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

/** Write a design spec to the canonical path. */
export function writeDesignSpec(projectRoot: string, pageId: string, spec: unknown): void {
  const p = specPath(projectRoot, pageId);
  ensureDir(p);
  writeFileSync(p, JSON.stringify(spec, null, 2), 'utf-8');
}

/** Check whether a design spec exists at the canonical path. */
export function designSpecExists(projectRoot: string, pageId: string): boolean {
  return existsSync(specPath(projectRoot, pageId));
}

/** Create a backup of the current spec before modifications. */
export function backupDesignSpec(projectRoot: string, pageId: string): boolean {
  const src = specPath(projectRoot, pageId);
  if (!existsSync(src)) return false;
  copyFileSync(src, backupPath(projectRoot, pageId));
  return true;
}

/** Revert a spec to its backup. Returns false if no backup exists. */
export function revertDesignSpec(projectRoot: string, pageId: string): boolean {
  const bak = backupPath(projectRoot, pageId);
  if (!existsSync(bak)) return false;
  const dest = specPath(projectRoot, pageId);
  copyFileSync(bak, dest);
  return true;
}
