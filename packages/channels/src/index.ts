/**
 * @module @agentforge/channels
 *
 * Messaging channel implementations for the AgentForge HITL system.
 * Provides Slack, Telegram, and CLI channels plus a routing layer.
 */

// Slack channel (RichHITLChannel)
export { createSlackChannel } from './slack/index.js';
export type {
  SlackApp,
  SlackChannel,
  SlackChannelConfig,
  SlackClient,
} from './slack/index.js';

// Telegram channel (HITLChannel + partial rich)
export { createTelegramChannel } from './telegram/index.js';
export type {
  TelegramClient,
  TelegramChannel,
  TelegramChannelConfig,
} from './telegram/index.js';

// CLI channel (HITLChannel)
export { createCliChannel } from './cli/index.js';
export type { CliChannelConfig, CliChannel } from './cli/index.js';

// Channel router
export { createChannelRouter, DEFAULT_ROUTING } from './router.js';
export type { RoutingConfig, RouteResult, ChannelRouter } from './router.js';
