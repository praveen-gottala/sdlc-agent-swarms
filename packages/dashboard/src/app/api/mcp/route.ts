import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';

interface McpConfig {
  name: string;
  uri: string;
  transport: string;
  connected?: boolean;
  auth?: string;
  rate_limit_rpm?: number;
  tools?: string[];
  calls_24h?: number;
  errors_24h?: number;
}

interface ProjectConfig {
  mcp?: McpConfig[];
}

/**
 * GET /api/mcp
 * Returns configured MCP servers from agentforge.yaml mcp section.
 */
export async function GET() {
  const projectConfig = readYamlFile<ProjectConfig>('agentforge.yaml');
  const rawServers = projectConfig?.mcp ?? [];

  const servers = rawServers.map((s, idx) => ({
    id: `mcp-${idx}`,
    name: s.name,
    uri: s.uri,
    transport: s.transport,
    status: s.connected !== false ? 'connected' : 'disconnected',
    auth: s.auth ?? 'none',
    rateLimitRpm: s.rate_limit_rpm ?? 60,
    tools: s.tools ?? [],
    calls24h: s.calls_24h ?? 0,
    errors24h: s.errors_24h ?? 0,
    lastHeartbeat: s.connected !== false ? new Date().toISOString() : null,
  }));

  return NextResponse.json({ servers, total: servers.length });
}
