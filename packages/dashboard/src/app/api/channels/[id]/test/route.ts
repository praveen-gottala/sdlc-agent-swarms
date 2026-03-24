import { NextResponse } from 'next/server';
import { readYamlFile, getEnvVar } from '../../../_lib/project-reader';

interface ChannelConfig {
  type: string;
  name?: string;
  capabilities: string;
  priority: number;
  connected?: boolean;
  routing?: string[];
  last_ping?: string | null;
  workspace?: string;
  channel_id?: string;
  chat_id?: string;
  server_id?: string;
}

interface ProjectConfig {
  channels?: ChannelConfig[];
}

/** Channel types that have real implementations. */
const SUPPORTED_TYPES = new Set(['slack', 'telegram', 'cli']);

/**
 * POST /api/channels/[id]/test
 * Sends a real test message to a channel and reports round-trip latency.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Look up channel config from project manifest
  const projectConfig = readYamlFile<ProjectConfig>('agentforge.yaml');
  const rawChannels = projectConfig?.channels ?? [];
  const channelIdx = rawChannels.findIndex(
    (ch, idx) => `ch-${ch.type}-${idx}` === id,
  );

  if (channelIdx === -1) {
    return NextResponse.json(
      { success: false, error: `Channel '${id}' not found` },
      { status: 404 },
    );
  }

  const channel = rawChannels[channelIdx];

  if (!SUPPORTED_TYPES.has(channel.type)) {
    return NextResponse.json(
      {
        success: false,
        channelId: id,
        error: `Channel type '${channel.type}' does not have a messaging implementation yet`,
      },
      { status: 501 },
    );
  }

  const start = Date.now();

  try {
    switch (channel.type) {
      case 'slack':
        return await testSlack(id, channel, start);
      case 'telegram':
        return await testTelegram(id, channel, start);
      case 'cli':
        return testCli(id, start);
      default:
        return NextResponse.json(
          { success: false, error: `Unsupported channel type: ${channel.type}` },
          { status: 501 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        channelId: id,
        error: err instanceof Error ? err.message : 'Unknown error during channel test',
        roundTripMs: Date.now() - start,
      },
      { status: 502 },
    );
  }
}

/**
 * Test a Slack channel by sending a real message via the Slack Web API.
 */
async function testSlack(
  channelId: string,
  config: ChannelConfig,
  start: number,
): Promise<NextResponse> {
  const botToken = getEnvVar('AGENTFORGE_SLACK_BOT_TOKEN');
  if (!botToken) {
    return NextResponse.json(
      {
        success: false,
        channelId,
        error: 'AGENTFORGE_SLACK_BOT_TOKEN is not configured',
      },
      { status: 503 },
    );
  }

  const slackChannel = config.channel_id;
  if (!slackChannel) {
    return NextResponse.json(
      {
        success: false,
        channelId,
        error: 'No channel_id configured for this Slack channel in agentforge.yaml',
      },
      { status: 422 },
    );
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: slackChannel,
      text: `🔔 AgentForge test ping — ${new Date().toISOString()}`,
    }),
  });

  const data = await res.json();
  const roundTripMs = Date.now() - start;

  if (!data.ok) {
    return NextResponse.json(
      {
        success: false,
        channelId,
        error: `Slack API error: ${data.error ?? 'unknown'}`,
        roundTripMs,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    channelId,
    roundTripMs,
    message: `Test message delivered to ${config.name ?? slackChannel}`,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Test a Telegram channel by sending a real message via the Telegram Bot API.
 */
async function testTelegram(
  channelId: string,
  config: ChannelConfig,
  start: number,
): Promise<NextResponse> {
  const botToken = getEnvVar('AGENTFORGE_TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    return NextResponse.json(
      {
        success: false,
        channelId,
        error: 'AGENTFORGE_TELEGRAM_BOT_TOKEN is not configured',
      },
      { status: 503 },
    );
  }

  const chatId = config.chat_id;
  if (!chatId) {
    return NextResponse.json(
      {
        success: false,
        channelId,
        error: 'No chat_id configured for this Telegram channel',
      },
      { status: 422 },
    );
  }

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🔔 AgentForge test ping — ${new Date().toISOString()}`,
        parse_mode: 'Markdown',
      }),
    },
  );

  const data = await res.json();
  const roundTripMs = Date.now() - start;

  if (!data.ok) {
    return NextResponse.json(
      {
        success: false,
        channelId,
        error: `Telegram API error: ${data.description ?? 'unknown'}`,
        roundTripMs,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    channelId,
    roundTripMs,
    message: `Test message delivered to ${config.name ?? chatId}`,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Test a CLI channel — always available since it writes to local stdout.
 */
function testCli(channelId: string, start: number): NextResponse {
  const roundTripMs = Date.now() - start;
  return NextResponse.json({
    success: true,
    channelId,
    roundTripMs,
    message: 'CLI channel is always available (local terminal)',
    timestamp: new Date().toISOString(),
  });
}
