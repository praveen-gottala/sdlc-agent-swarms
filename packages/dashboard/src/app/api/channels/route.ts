import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';

interface ChannelConfig {
  type: string;
  name?: string;
  capabilities: string;
  priority: number;
  connected?: boolean;
  routing?: string[];
  last_ping?: string | null;
  message_count?: number;
  workspace?: string;
  channel_id?: string;
  chat_id?: string;
  server_id?: string;
}

interface ProjectConfig {
  channels?: ChannelConfig[];
  escalation?: {
    approval_timeout_minutes?: number;
    on_timeout?: string;
    secondary_timeout_minutes?: number;
  };
}

/**
 * GET /api/channels
 * Returns configured messaging channels from agentforge.yaml channels section.
 */
export async function GET() {
  const projectConfig = readYamlFile<ProjectConfig>('agentforge.yaml');
  const rawChannels = projectConfig?.channels ?? [];
  const escalation = projectConfig?.escalation ?? {};

  const channels = rawChannels.map((ch, idx) => ({
    id: `ch-${ch.type}-${idx}`,
    type: ch.type,
    name: ch.name ?? ch.type.charAt(0).toUpperCase() + ch.type.slice(1),
    status: ch.connected !== false ? 'connected' : 'disconnected',
    capabilities: ch.capabilities,
    priority: ch.priority,
    routing: ch.routing ?? [],
    lastPing: ch.last_ping ?? null,
    messageCount: ch.message_count ?? 0,
    config: {
      ...(ch.workspace ? { workspace: ch.workspace } : {}),
      ...(ch.channel_id ? { channelId: ch.channel_id } : {}),
      ...(ch.chat_id ? { chatId: ch.chat_id } : {}),
      ...(ch.server_id ? { serverId: ch.server_id } : {}),
    },
  }));

  return NextResponse.json({
    channels,
    total: channels.length,
    escalation: {
      approvalTimeout: escalation.approval_timeout_minutes ?? 60,
      onTimeout: escalation.on_timeout ?? 'pause_and_notify_secondary',
      secondaryTimeout: escalation.secondary_timeout_minutes ?? 120,
    },
  });
}
