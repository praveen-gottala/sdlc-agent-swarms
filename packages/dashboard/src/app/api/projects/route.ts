import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { discoverProjects } from '../_lib/project-reader';
import {
  createProject,
  CreateProjectSchema,
  ProjectCreationError,
} from '../_lib/project-creation';

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  description: string;
}

/** GET /api/projects — list all discovered AgentForge projects */
export async function GET() {
  try {
    const projects = discoverProjects();
    const result: ProjectInfo[] = [];

    for (const proj of projects) {
      const yamlPath = join(proj.path, 'agentforge.yaml');
      try {
        const content = readFileSync(yamlPath, 'utf-8');
        const config = parse(content) as { project?: { name?: string; description?: string } };
        result.push({
          id: proj.dirName,
          name: config?.project?.name ?? proj.dirName,
          path: proj.path,
          description: config?.project?.description ?? '',
        });
      } catch {
        result.push({
          id: proj.dirName,
          name: proj.dirName,
          path: proj.path,
          description: '',
        });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to list projects:', err);
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

/** POST /api/projects — create a new project with full design system setup */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateProjectSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: firstError?.message ?? 'Invalid input' },
        { status: 400 },
      );
    }

    const result = await createProject(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectCreationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Project creation failed:', err);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
