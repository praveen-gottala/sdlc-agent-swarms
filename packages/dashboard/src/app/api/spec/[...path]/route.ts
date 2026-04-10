import { NextResponse } from 'next/server';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { readTextFile, fileExists, listDir, getActiveProjectRoot } from '../../_lib/project-reader';

/**
 * Maps a spec path to the actual file path in the bookshelf project.
 * e.g. "project" -> "agentforge/spec/project.yaml"
 *      "pages" -> "agentforge/spec/pages.yaml"
 *      "components" -> lists the components directory
 *      "components/BookCard" -> "agentforge/spec/components/BookCard.yaml"
 */
function resolveSpecPath(specPath: string): { filePath: string; isDir: boolean } {
  // Direct file mapping
  const yamlPath = `agentforge/spec/${specPath}.yaml`;
  if (fileExists(yamlPath)) {
    return { filePath: yamlPath, isDir: false };
  }

  // Check if it's a directory
  const dirPath = `agentforge/spec/${specPath}`;
  if (fileExists(dirPath)) {
    return { filePath: dirPath, isDir: true };
  }

  return { filePath: yamlPath, isDir: false };
}

/**
 * GET /api/spec/[...path]
 * Returns spec file content by path from the agentforge/spec/ directory.
 * Example: GET /api/spec/project returns agentforge/spec/project.yaml
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const specPath = path.join('/');

  const { filePath, isDir } = resolveSpecPath(specPath);

  if (isDir) {
    // List directory contents (e.g., components/)
    const entries = listDir(filePath);
    const items = entries
      .filter((entry: string) => entry.endsWith('.yaml') || entry.endsWith('.yml'))
      .map((entry: string) => entry.replace(/\.ya?ml$/, ''));

    return NextResponse.json({
      path: specPath,
      type: 'directory',
      items,
      format: 'yaml',
    });
  }

  const content = readTextFile(filePath);

  if (content === null) {
    // Build available paths from actual spec directory
    const specEntries = listDir('agentforge/spec');
    const availablePaths = specEntries.map((entry: string) => entry.replace(/\.ya?ml$/, ''));

    return NextResponse.json(
      { error: `Spec not found: ${specPath}`, availablePaths },
      { status: 404 },
    );
  }

  return NextResponse.json({ path: specPath, content, format: 'yaml' });
}

/**
 * PUT /api/spec/[...path]
 * Updates spec file content. Accepts { content: string } body.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const specPath = path.join('/');

  let body: { content?: string };
  try {
    body = (await request.json()) as { content?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.content) {
    return NextResponse.json(
      { error: 'Missing required field: content' },
      { status: 400 },
    );
  }

  try {
    const projectRoot = getActiveProjectRoot();
    const fullPath = join(projectRoot, `agentforge/spec/${specPath}.yaml`);
    const dir = dirname(fullPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, body.content, 'utf-8');

    return NextResponse.json({
      path: specPath,
      savedAt: new Date().toISOString(),
      status: 'saved',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
