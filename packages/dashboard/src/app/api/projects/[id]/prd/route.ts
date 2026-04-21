import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { discoverProjects } from '../../../_lib/project-reader';

function resolveProjectDir(id: string): string | null {
  const projects = discoverProjects();
  const match = projects.find((p) => p.id === id || p.dirName === id);
  return match?.path ?? null;
}

/** GET /api/projects/[id]/prd — returns current PRD content */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectDir = resolveProjectDir(id);
  if (!projectDir) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const prdPath = join(projectDir, 'docs', 'prd.md');
  if (!existsSync(prdPath)) {
    return NextResponse.json({ content: null });
  }

  const content = readFileSync(prdPath, 'utf-8');
  return NextResponse.json({ content });
}

/** POST /api/projects/[id]/prd — write PRD content */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectDir = resolveProjectDir(id);
  if (!projectDir) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await request.json();
  const { content } = body as { content: string };

  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const docsDir = join(projectDir, 'docs');
  if (!existsSync(docsDir)) {
    mkdirSync(docsDir, { recursive: true });
  }

  writeFileSync(join(docsDir, 'prd.md'), content);

  return NextResponse.json({ success: true });
}
