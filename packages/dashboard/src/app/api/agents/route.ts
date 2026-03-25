import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';

interface RawAgent {
  role: string;
  phase: string;
  provider: string;
  execution?: { mode?: string; progress_events?: boolean };
  tools?: string[];
  permissions?: string[];
  denied?: string[];
  hitl_policy?: string;
  budget?: { max_tokens_per_task?: number; max_cost_per_task_usd?: number };
  on_complete?: string;
  on_error?: string;
}

interface AgentsFile {
  version: string;
  agents: RawAgent[];
}

interface TrustState {
  version: string;
  trust: Record<string, { score?: number; trend?: string }>;
}

interface ActiveThread {
  threadId: string;
  phase: string;
  startedAt: string;
}

const PHASE_DISPLAY_NAMES: Record<string, string> = {
  design: 'Design',
  spec: 'Spec',
  code: 'Code Gen',
  cicd: 'CI/CD',
  observe: 'Observe',
};

/**
 * GET /api/agents
 * Returns the list of configured agents from agentforge/agents.yaml,
 * merged with trust data from .agentforge/trust-state.yaml.
 */
export async function GET() {
  const agentsFile = readYamlFile<AgentsFile>('agentforge/agents.yaml');
  const trustState = readYamlFile<TrustState>('.agentforge/trust-state.yaml');
  const activeThread = readYamlFile<ActiveThread>('.agentforge/active-thread.yaml');

  const rawAgents = agentsFile?.agents ?? [];
  const trustMap = trustState?.trust ?? {};
  const currentPhase = activeThread?.phase ?? '';

  const agents = rawAgents.map((a) => {
    const trust = trustMap[a.role];
    const isActivePhase = a.phase === currentPhase;

    return {
      id: a.role,
      name: a.role
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      role: a.role,
      phase: PHASE_DISPLAY_NAMES[a.phase] ?? a.phase,
      status: isActivePhase ? ('active' as const) : ('idle' as const),
      model: a.provider,
      provider: a.provider.includes('claude')
        ? 'anthropic'
        : a.provider.includes('gpt')
          ? 'openai'
          : 'unknown',
      trustLevel: trust?.score ?? 0.5,
      isCustom: false,
      createdAt: new Date().toISOString(),
      tools: a.tools ?? [],
      permissions: a.permissions ?? [],
      denied: a.denied ?? [],
      hitlPolicy: a.hitl_policy ?? '',
      budget: a.budget ?? {},
      onComplete: a.on_complete ?? '',
      onError: a.on_error ?? '',
    };
  });

  return NextResponse.json({ agents, total: agents.length });
}

/**
 * POST /api/agents
 * Creates a new custom agent configuration.
 * Accepts body with agent fields. Returns created agent.
 * TODO: Persist to YAML.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name || !body.role) {
    return NextResponse.json(
      { error: 'Missing required fields: name, role' },
      { status: 400 },
    );
  }

  const newAgent = {
    id: `custom-${Date.now()}`,
    name: body.name as string,
    role: body.role as string,
    phase: (body.phase as string) ?? 'Code Gen',
    status: 'idle' as const,
    model: (body.model as string) ?? 'claude-sonnet-4-6',
    provider: (body.provider as string) ?? 'anthropic',
    trustLevel: 0.5,
    isCustom: true,
    createdAt: new Date().toISOString(),
  };

  return NextResponse.json({ agent: newAgent }, { status: 201 });
}
