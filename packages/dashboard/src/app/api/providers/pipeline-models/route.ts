import { NextRequest, NextResponse } from 'next/server';
import { readYamlFile, writeYamlFile } from '../../_lib/project-reader';
import { PIPELINE_PRESETS, PIPELINE_ROLE_KEYS, AVAILABLE_MODELS } from '@agentforge/agents-ux';

export const dynamic = 'force-dynamic';

interface AgentForgeYaml {
  agents?: {
    providers?: {
      default?: string;
      overrides?: Record<string, string>;
    };
  };
  [key: string]: unknown;
}

/**
 * GET /api/providers/pipeline-models
 *
 * Returns the current per-phase model configuration, available presets,
 * and available model list. Reads from agentforge.yaml overrides.
 */
export async function GET() {
  const config = readYamlFile<AgentForgeYaml>('agentforge.yaml');
  const overrides = config?.agents?.providers?.overrides ?? {};
  const defaultModel = config?.agents?.providers?.default ?? 'claude-sonnet-4-6';

  const phaseModels: Record<string, string> = {};
  for (const key of PIPELINE_ROLE_KEYS) {
    phaseModels[key] = overrides[key] ?? defaultModel;
  }

  return NextResponse.json({
    phaseModels,
    presets: PIPELINE_PRESETS,
    availableModels: AVAILABLE_MODELS,
    defaultModel,
  });
}

/**
 * PUT /api/providers/pipeline-models
 *
 * Writes per-phase model overrides into agentforge.yaml.
 * Body: { overrides: Record<string, string> }
 */
export async function PUT(request: NextRequest) {
  let body: { overrides?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.overrides || typeof body.overrides !== 'object') {
    return NextResponse.json({ error: 'Missing overrides object' }, { status: 400 });
  }

  const validKeys = new Set<string>(PIPELINE_ROLE_KEYS);
  const validModelIds = new Set<string>(AVAILABLE_MODELS.map(m => m.id));

  for (const [key, value] of Object.entries(body.overrides)) {
    if (!validKeys.has(key)) {
      return NextResponse.json({ error: `Invalid role key: ${key}` }, { status: 400 });
    }
    if (!validModelIds.has(value)) {
      return NextResponse.json({ error: `Invalid model ID: ${value}` }, { status: 400 });
    }
  }

  const config = readYamlFile<AgentForgeYaml>('agentforge.yaml') ?? {};
  const agents = (config.agents ?? {}) as AgentForgeYaml['agents'] & Record<string, unknown>;
  const providers = (agents?.providers ?? {}) as NonNullable<NonNullable<AgentForgeYaml['agents']>['providers']> & Record<string, unknown>;
  const existingOverrides = { ...(providers.overrides ?? {}) };

  for (const [key, value] of Object.entries(body.overrides)) {
    existingOverrides[key] = value;
  }

  writeYamlFile('agentforge.yaml', {
    ...config,
    agents: {
      ...agents,
      providers: {
        ...providers,
        overrides: existingOverrides,
      },
    },
  });

  return NextResponse.json({ ok: true, overrides: existingOverrides });
}
