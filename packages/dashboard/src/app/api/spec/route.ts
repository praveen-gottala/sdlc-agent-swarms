import { NextResponse } from 'next/server';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getActiveProjectRoot } from '../_lib/project-reader';

export const dynamic = 'force-dynamic';

interface SpecFileEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: SpecFileEntry[];
}

/**
 * Recursively scans a directory for YAML spec files.
 */
function scanDir(absolutePath: string, relativePath: string): SpecFileEntry[] {
  if (!existsSync(absolutePath)) return [];
  const entries = readdirSync(absolutePath, { withFileTypes: true });
  const result: SpecFileEntry[] = [];

  for (const entry of entries) {
    const entryRelPath = `${relativePath}/${entry.name}`;
    const entryAbsPath = join(absolutePath, entry.name);

    if (entry.isDirectory()) {
      result.push({
        name: entry.name,
        path: entryRelPath,
        type: 'folder',
        children: scanDir(entryAbsPath, entryRelPath),
      });
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      result.push({
        name: entry.name,
        path: entryRelPath,
        type: 'file',
      });
    }
  }

  return result;
}

/**
 * GET /api/spec
 * Returns the tree structure of spec files from agentforge/spec/ directory.
 */
export async function GET() {
  try {
    const projectRoot = getActiveProjectRoot();
    const specDir = join(projectRoot, 'agentforge', 'spec');

    if (!existsSync(specDir) || !statSync(specDir).isDirectory()) {
      return NextResponse.json({ files: [], error: 'No spec directory found' });
    }

    const files = scanDir(specDir, 'agentforge/spec');

    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
