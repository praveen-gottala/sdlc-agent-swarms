/**
 * @module @agentforge/channels/telegram
 *
 * Telegram channel implementation for the AgentForge HITL system.
 */

export type {
  TelegramInlineKeyboardButton,
  TelegramInlineKeyboard,
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramSendOptions,
  TelegramEditOptions,
  TelegramClient,
} from './telegram-client.js';

export type { TelegramChannelConfig, TelegramChannel } from './telegram-channel.js';

export { createTelegramChannel } from './telegram-channel.js';

export {
  formatNotification,
  formatApprovalRequest,
  formatTaskBoard,
  buildApprovalKeyboard,
  statusEmoji,
} from './formatting.js';
