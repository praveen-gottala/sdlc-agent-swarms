/**
 * @module @agentforge/channels/telegram/telegram-client
 *
 * Telegram Bot API abstraction layer.
 * Defines types and interface for interacting with the Telegram Bot API
 * without introducing any external dependencies.
 */

/**
 * A button in a Telegram inline keyboard.
 */
export interface TelegramInlineKeyboardButton {
  readonly text: string;
  readonly callback_data?: string;
  readonly url?: string;
}

/**
 * Inline keyboard markup for Telegram messages.
 */
export interface TelegramInlineKeyboard {
  readonly inline_keyboard: readonly (readonly TelegramInlineKeyboardButton[])[];
}

/**
 * Represents a message received from or sent to Telegram.
 */
export interface TelegramMessage {
  readonly message_id: number;
  readonly chat: { readonly id: number };
  readonly text?: string;
  readonly date: number;
}

/**
 * Represents a callback query triggered by an inline keyboard button press.
 */
export interface TelegramCallbackQuery {
  readonly id: string;
  readonly data?: string;
  readonly message?: TelegramMessage;
  readonly from: { readonly id: number };
}

/**
 * Options for sending a message via the Telegram Bot API.
 */
export interface TelegramSendOptions {
  readonly parse_mode?: 'Markdown' | 'HTML';
  readonly reply_markup?: TelegramInlineKeyboard;
  readonly reply_to_message_id?: number;
}

/**
 * Options for editing a message via the Telegram Bot API.
 */
export interface TelegramEditOptions {
  readonly parse_mode?: 'Markdown' | 'HTML';
  readonly reply_markup?: TelegramInlineKeyboard;
}

/**
 * Abstraction over the Telegram Bot API.
 * Implementations wrap the actual HTTP calls to the Bot API.
 * This interface has no external dependencies.
 */
export interface TelegramClient {
  /** Send a text message to a chat. */
  sendMessage(
    chatId: string,
    text: string,
    options?: TelegramSendOptions,
  ): Promise<TelegramMessage>;

  /** Edit the text of an existing message. */
  editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    options?: TelegramEditOptions,
  ): Promise<TelegramMessage>;

  /** Pin a message in a chat. */
  pinChatMessage(chatId: string, messageId: number): Promise<void>;

  /** Acknowledge a callback query (dismisses the loading indicator). */
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;

  /** Register a handler for inline keyboard callback queries. */
  onCallbackQuery(handler: (query: TelegramCallbackQuery) => void): void;

  /** Register a handler for incoming text messages. */
  onMessage(handler: (message: TelegramMessage) => void): void;

  /** Start polling or webhook listener. */
  start(): Promise<void>;

  /** Stop the client and clean up resources. */
  stop(): Promise<void>;
}
