/** Default max age for cached sessions (30 minutes). */
export const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

/** Relative path for pipeline artifact storage (design specs, research, planning, screenshots). */
export const PREVIEW_DIR_REL = 'agentforge/designs';

/** Default LLM model used when no override is configured. */
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** Model for vision-based design evaluation (quality gatekeeper). */
export const EVALUATOR_MODEL = 'claude-opus-4-7';

/** Environment variable name for global model override. */
export const ENV_MODEL_OVERRIDE = 'AGENTFORGE_DEFAULT_MODEL';

/** Environment variable name for enabling/disabling vision LLM calls (evaluation + correction). */
export const ENV_VISION_LLM = 'AGENTFORGE_ENABLE_VISION_LLM';

/** Environment variable for a dedicated Anthropic API key for vision evaluation.
 *  When set, vision calls use direct Anthropic API instead of the default provider (e.g. Vertex AI).
 *  Useful when Vertex AI has low TPM quota for opus vision calls. */
export const ENV_VISION_API_KEY = 'AGENTFORGE_VISION_API_KEY';

/** Whether vision LLM calls are enabled. Reads ENV_VISION_LLM at call time; defaults to true. */
export function isVisionLLMEnabled(): boolean {
  const val = process.env[ENV_VISION_LLM];
  if (val === undefined || val === '') return true;
  return val !== 'false' && val !== '0';
}

/**
 * Default service URLs used as fallbacks when no env var or explicit
 * config overrides the value. Production deploys should always override.
 */
export const DEFAULT_SERVICE_URLS = {
  /** Penpot MCP server (Streamable HTTP). Env: AGENTFORGE_MCP_PENPOT_URL */
  penpotMcp: 'http://localhost:4401/mcp',
  /** Penpot UI. Env: PENPOT_URL */
  penpotUi: 'http://localhost:9001',
  /** Penpot plugin UI manifest host. */
  penpotPluginUi: 'http://localhost:4400',
  /** Figma WebSocket bridge. */
  figmaWsBridge: 'ws://localhost:3055',
  /** Dashboard WebSocket endpoint. */
  dashboardWs: 'ws://localhost:3001/ws',
} as const;
