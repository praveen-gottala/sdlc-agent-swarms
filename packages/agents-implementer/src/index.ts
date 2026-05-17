/**
 * @module @agentforge/agents-implementer
 *
 * Implementer pipeline — third spine stage (vision Layer 8).
 * Single-threaded tool-loop consuming TaskPlan + sliced ContractBundle.
 * Invokes design specialist for UI tasks. Emits code artifacts.
 */

// Context assembly (ADR-057 routing)
export { buildImplementerPrompt } from './context/build-implementer-prompt.js';
export type {
  ImplementerPromptInput,
  ImplementerPromptResult,
} from './context/build-implementer-prompt.js';
