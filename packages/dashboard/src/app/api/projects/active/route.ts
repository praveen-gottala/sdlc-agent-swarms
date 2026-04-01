import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { getActiveProjectRoot, writePrefs } from '../../_lib/project-reader';

/** GET /api/projects/active — return the currently active project */
export async function GET() {
  try {
    const projectRoot = getActiveProjectRoot();
    const yamlPath = join(projectRoot, 'agentforge.yaml');
    let name = projectRoot.split('/').pop() ?? 'unknown';
    let description = '';
    let stack: { frontend?: string; backend?: string } = {};
    let repo: string | undefined;

    if (existsSync(yamlPath)) {
      const content = readFileSync(yamlPath, 'utf-8');
      const config = parse(content) as {
        project?: { name?: string; description?: string; repo?: string };
        stack?: { frontend?: string; backend?: string };
      };
      name = config?.project?.name ?? name;
      description = config?.project?.description ?? '';
      repo = config?.project?.repo;
      stack = config?.stack ?? {};
    }

    return NextResponse.json({ path: projectRoot, name, description, repo, stack });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('No AgentForge project found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/projects/active — set the active project */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: projectPath } = body as { path: string };

    if (!projectPath || typeof projectPath !== 'string') {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    if (!existsSync(join(projectPath, 'agentforge.yaml'))) {
      return NextResponse.json(
        { error: `No agentforge.yaml found at ${projectPath}` },
        { status: 400 }
      );
    }

    writePrefs({ activeProject: projectPath });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST alias for PUT — prevents 405 from stale Next.js cache or proxy issues. */
export { PUT as POST };
