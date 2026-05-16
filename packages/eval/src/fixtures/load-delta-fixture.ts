/**
 * @module load-delta-fixture
 * Loads delta fixture YAML files from packages/eval/src/fixtures/deltas/.
 * Used by the Design Studio (via API route) and the M3.6 render script.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';

const FIXTURES_DIR = path.resolve(__dirname, 'deltas');

export interface DeltaHighlightNode {
  readonly nodeId: string;
  readonly op: 'added' | 'modified' | 'removed' | 'reordered';
  readonly description: string;
}

export interface DeltaFixtureMetadata {
  readonly description: string;
  readonly targetPage: string;
  readonly taskId: string;
}

export interface DeltaFixtureData {
  readonly metadata: DeltaFixtureMetadata;
  readonly delta: {
    readonly screenId: string;
    readonly baseWidth: number;
    readonly added: Record<string, Record<string, unknown>>;
    readonly modified: Record<string, Record<string, unknown>>;
    readonly removed: string[];
    readonly reordered: Array<{ nodeId: string; newParent?: string; newOrder?: number }>;
  };
  readonly highlightNodes: DeltaHighlightNode[];
}

/**
 * Load a delta fixture by name.
 * @param name — fixture name without extension (e.g., 'cashpulse-add-recurring')
 * @returns parsed fixture data or null if not found
 */
export function loadDeltaFixture(name: string): DeltaFixtureData | null {
  const filePath = path.join(FIXTURES_DIR, `${name}.yaml`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parse(raw) as DeltaFixtureData;
  return parsed;
}

/** List all available delta fixture names. */
export function listDeltaFixtures(): string[] {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  return fs.readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace('.yaml', ''));
}
