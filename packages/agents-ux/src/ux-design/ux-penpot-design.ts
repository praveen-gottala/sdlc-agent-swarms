/**
 * @module @agentforge/agents-ux/ux-design/ux-penpot-design
 *
 * Penpot Design agent: creates Penpot designs from component specs
 * using the Penpot MCP server's `execute_code` tool.
 *
 * Key design decision: generates ONE JavaScript script executed in a
 * single `execute_code` call, rather than many individual tool calls.
 * This reduces latency and avoids cross-step state issues.
 *
 * Pipeline: ComponentSpecReady → Design Agent → PenpotDesignReady
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentContract,
  Result,
  MCPClient,
  PromptTrace,
  PageContext,
  DesignTokensSpec,
} from '@agentforge/core';
import {
  Ok,
  Err,
  recordPromptTrace,
  recordPromptTraceResponse,
  PREVIEW_DIR_REL,
  debugLog,
  logDefaults,
} from '@agentforge/core';
import { evaluateDesign } from './design-evaluator.js';
import type { LLMProvider as EvalLLMProvider } from '@agentforge/providers';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';
import type { DesignSnapshotData } from '../types.js';
import { captureDesignSnapshot } from './capture-design-snapshot.js';
import type { DesignSpecV2, RendererTokens, CatalogMap } from '@agentforge/designspec-renderer';
import { formatPageContextPrompt } from '../page-context-prompt.js';
import {
  validateDesignSpec,
  renderToScript,
  renderToScriptChunks,
  SUBMIT_DESIGN_TOOL,
  registerCatalogRenderer,
  generateRenderer,
  generateCatalogEntry,
} from '@agentforge/designspec-renderer';
import type { ChunkedRenderResult } from '@agentforge/designspec-renderer';
import type { DynamicCatalogSource } from '@agentforge/designspec-renderer';
import { buildPromptFromTokens } from '../prompts/prompt-template-builder.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the Penpot design agent. */
export interface PenpotDesignInput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly planningOutput: UXPlanningOutput;
  readonly designSystemPrompt?: string;
  /** Component catalog prompt for shared anatomy definitions. */
  readonly componentCatalogPrompt?: string;
  readonly description?: string;
  /** Target viewport width in pixels (default: 1440). */
  readonly viewportWidth?: number;
  /** Override model resolved from provider registry. Falls back to contract default. */
  readonly resolvedModel?: string;
  /** Use DesignSpec v2 renderer path (structured JSON → deterministic Penpot script). */
  readonly useDesignSpecV2?: boolean;
  /** Design tokens for the v2 renderer. Required when useDesignSpecV2 is true. */
  readonly rendererTokens?: RendererTokens;
  /** Catalog map for the v2 renderer. Required when useDesignSpecV2 is true. */
  readonly catalogMap?: CatalogMap;
  /** Raw component catalog spec (with anatomy) for dynamic renderer generation. */
  readonly componentCatalogRaw?: Readonly<Record<string, DynamicCatalogSource>>;
  /** Structured page context from pages.yaml for spec-driven design. */
  readonly pageContext?: PageContext;
  /** Design tokens for prompt template rendering. When provided, token values replace template placeholders. */
  readonly designTokens?: DesignTokensSpec;
}

/** Output produced by the Penpot design agent. */
export interface PenpotDesignOutput extends DesignSnapshotData {
  readonly penpotProjectId: string;
  readonly penpotPageId: string;
  readonly penpotNodeIds: Readonly<Record<string, string>>;
  readonly moduleId: string;
  readonly breakpoints: readonly string[];
  /** The raw JS design script (for replay support). */
  readonly script?: string;
  /** Fix scripts applied during Phase C self-correction. */
  readonly fixScripts?: readonly string[];
  /** The DesignSpec v2 JSON (when useDesignSpecV2 is true). */
  readonly designSpec?: DesignSpecV2;
}

// ============================================================================
// Contract
// ============================================================================

export const PENPOT_DESIGN_CONTRACT: AgentContract = {
  role: 'penpot_design',
  description: 'Creates Penpot designs from component specs using execute_code tool',
  category: 'design',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'complete', progress_events: true, max_context_tokens: 40000 },
  tools: ['penpot:execute_code', 'penpot:high_level_overview', 'penpot:penpot_api_info'],
  permissions: ['read_spec', 'read_design', 'write_design', 'read_design_system'],
  denied: ['write_code', 'create_branch', 'merge_pr'],
  hitl_policy: 'full_approval',
  budget: { max_tokens_per_task: 40000, max_cost_per_task_usd: 1.5 },
  on_complete: 'PenpotDesignReady',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;
let systemPromptV2Cache: string | undefined;

const loadPenpotSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-penpot-design-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

const loadPenpotV2SystemPrompt = (): string => {
  if (systemPromptV2Cache) return systemPromptV2Cache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-penpot-designspec-v2.md');
  systemPromptV2Cache = readFileSync(promptPath, 'utf-8');
  return systemPromptV2Cache;
};

/**
 * Export a shape as base64 PNG via `execute_code` + `shape.export()`.
 *
 * Bypasses the broken `export_shape` MCP tool (which fails with
 * `Cannot read properties of null (reading 'export')` due to a bug
 * in the Penpot MCP plugin's internal shape lookup).
 *
 * `execute_code` has access to the live shape tree via
 * `penpot.currentPage.getShapeById()`, so we call `shape.export()`
 * directly from within the code execution context.
 */
async function exportShapeViaExecuteCode(
  mcpClient: MCPClient,
  shapeId: string,
  options: { format?: string; scale?: number } = {},
): Promise<Result<string>> {
  const { format = 'png', scale = 2 } = options;

  const code = `
    const shape = penpot.currentPage?.getShapeById("${shapeId}");
    if (!shape) return { error: "Shape not found: ${shapeId}" };
    try {
      const data = await shape.export({ type: "${format}", scale: ${scale} });
      const bytes = new Uint8Array(data);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return { base64: btoa(binary) };
    } catch (e) {
      return { error: e.message || String(e) };
    }
  `;

  const result = await mcpClient.callTool('penpot', 'execute_code', { code });
  if (!result.ok) {
    return result as Result<never>;
  }

  // Parse the response to extract base64
  const value = result.value as { content?: Array<{ type?: string; text?: string; data?: string }> };
  if (!Array.isArray(value.content)) {
    return Err({ code: 'INVALID_STATE' as const, message: 'No content in execute_code export response', recoverable: true });
  }

  const text = value.content.map(c => c.text ?? '').join('');

  try {
    const parsed = JSON.parse(text) as { result?: { base64?: string; error?: string } };
    if (parsed.result?.error) {
      return Err({ code: 'MCP_UNAVAILABLE' as const, message: `Shape export error: ${parsed.result.error}`, recoverable: true });
    }
    if (parsed.result?.base64) {
      return Ok(parsed.result.base64);
    }
  } catch {
    // Check if the text itself contains base64 image data (fallback)
    if (text.startsWith('iVBOR') || text.startsWith('/9j/')) {
      return Ok(text);
    }
  }

  // Fallback: check for image block in response (in case execute_code returns image type)
  const imageBlock = value.content.find(c => c.type === 'image');
  if (imageBlock?.data) {
    return Ok(imageBlock.data);
  }

  return Err({ code: 'INVALID_STATE' as const, message: `No base64 data in export response: ${text.slice(0, 200)}`, recoverable: true });
}

/**
 * Export a shape with retry logic via `execute_code` + `shape.export()`.
 * Retries up to `maxAttempts` times with a delay between attempts.
 */
async function exportShapeWithRetry(
  mcpClient: MCPClient,
  shapeId: string,
  options: { format?: string; scale?: number; maxAttempts?: number; delayMs?: number } = {},
): Promise<Result<string>> {
  const { format = 'png', scale = 2, maxAttempts = 3, delayMs = 3000 } = options;

  logDefaults('exportShapeWithRetry', {
    format: [options.format, "'png'"],
    scale: [options.scale, '2'],
    maxAttempts: [options.maxAttempts, '3'],
    delayMs: [options.delayMs, '3000'],
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const exportResult = await exportShapeViaExecuteCode(mcpClient, shapeId, { format, scale });

    if (exportResult.ok) {
      return exportResult;
    }

    // eslint-disable-next-line no-console
    console.warn(`        [export attempt ${attempt + 1}/${maxAttempts}] ${exportResult.error.message}`);

    // "Shape not found" is definitive — retrying won't help
    if (exportResult.error.message.includes('Shape not found')) {
      break;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return Err({ code: 'MCP_UNAVAILABLE' as const, message: 'Shape export failed after retries', recoverable: true });
}

// ============================================================================
// LLM interface
// ============================================================================

interface LLMProvider {
  complete: (prompt: {
    system: string;
    messages: { role: 'user'; content: string }[];
    tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  }, opts: {
    model: string;
    maxTokens: number;
    temperature: number;
    toolChoice?: { type: 'auto' | 'any' | 'tool'; name?: string };
    responseSchema?: { schema: Record<string, unknown> };
  }) => Promise<Result<{
    content: string;
    structured?: Record<string, unknown>;
    toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
    finishReason?: string;
  }>>;
}

// ============================================================================
// Dynamic API Discovery
// ============================================================================

/**
 * Fetch live Penpot API documentation from the MCP server.
 * Falls back to empty string if server is unavailable.
 */
export async function discoverPenpotAPI(mcpClient: MCPClient): Promise<string> {
  const parts: string[] = [];

  // Get high-level overview
  const overviewResult = await mcpClient.callTool('penpot', 'high_level_overview', {});
  if (overviewResult.ok) {
    const content = overviewResult.value as { content?: Array<{ text?: string }> };
    if (Array.isArray(content.content)) {
      parts.push(content.content.map(c => c.text ?? '').join(''));
    }
  }

  // Get key type docs
  for (const type of ['Board', 'FlexLayout', 'Fill', 'Stroke']) {
    const typeResult = await mcpClient.callTool('penpot', 'penpot_api_info', { type });
    if (typeResult.ok) {
      const content = typeResult.value as { content?: Array<{ text?: string }> };
      if (Array.isArray(content.content)) {
        parts.push(content.content.map(c => c.text ?? '').join(''));
      }
    }
  }

  return parts.join('\n\n');
}

// ============================================================================
// Script parser
// ============================================================================

/**
 * Parse LLM output into a single Penpot design script.
 * Expects JSON: { "script": "...", "breakpoints": [...] }
 */
export function parsePenpotDesignScript(output: string): Result<{ script: string; breakpoints: string[] }> {
  const closedFence = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const openFence = /```json\s*\n?([\s\S]+)/.exec(output);
  let jsonStr = closedFence ? closedFence[1].trim()
    : openFence ? openFence[1].trim()
      : output.trim();
  jsonStr = jsonStr.replace(/```\s*$/, '').trim();

  // Truncation heuristic: valid JSON for our schema must end with }
  const trimmed = jsonStr.trimEnd();
  if (trimmed.length > 0 && !trimmed.endsWith('}')) {
    return Err({
      code: 'LLM_TRUNCATED',
      message: `Penpot design script appears truncated (does not end with closing brace): ...${trimmed.slice(-80)}`,
      recoverable: true,
    });
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    logDefaults('parsePenpotDesignScript', {
      script: [parsed.script, "''"],
      breakpoints: [parsed.breakpoints, '[]'],
    });
    const script = String(parsed.script ?? '');
    const breakpoints = (parsed.breakpoints as string[]) ?? [];

    if (!script.trim()) {
      return Err({
        code: 'LLM_MALFORMED_OUTPUT',
        message: 'Empty script in Penpot design output',
        recoverable: true,
      });
    }

    // Penpot exposes layoutChild as getter-only; assigning layoutChild itself throws at runtime.
    if (/\blayoutChild\s*=(?!=)/.test(script)) {
      return Err({
        code: 'LLM_MALFORMED_OUTPUT',
        message: 'Invalid Penpot script: do not assign to layoutChild directly (use layoutChild.horizontalSizing / verticalSizing / margins after appendChild).',
        recoverable: true,
      });
    }

    return Ok({ script, breakpoints });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT',
      message: `Failed to parse Penpot design script: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
}

// ============================================================================
// Fix step schema + parser
// ============================================================================

/** JSON Schema for structured output of Penpot fix steps. */
const PENPOT_FIX_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      fixes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['code', 'description'],
          additionalProperties: false,
        },
      },
    },
    required: ['fixes'],
    additionalProperties: false,
  },
};

type FixParseResult =
  | { ok: true; fixes: Array<{ code: string; description: string }> }
  | { ok: false; reason: string };

/**
 * Parse LLM fix output with multiple fallback strategies.
 *
 * Fallback chain:
 * 1. JSON in markdown fence → `{ "fixes": [...] }`
 * 2. Raw JSON containing `{ "fixes":` pattern
 * 3. Individual `{ "code": "...", "description": "..." }` objects
 * 4. JavaScript code blocks → wrap each as a fix
 */
export function parsePenpotFixSteps(raw: string): FixParseResult {
  // Strategy 1: Markdown JSON fence
  const fenceMatch = /```json\s*\n?([\s\S]*?)```/.exec(raw);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim()) as { fixes?: Array<{ code: string; description: string }> };
      if (parsed.fixes && parsed.fixes.length > 0) {
        return { ok: true, fixes: parsed.fixes };
      }
    } catch { /* fall through */ }
  }

  // Strategy 2: Find `{ "fixes":` pattern in raw text
  const fixesIdx = raw.indexOf('"fixes"');
  if (fixesIdx >= 0) {
    // Walk backward to find the opening brace
    const braceIdx = raw.lastIndexOf('{', fixesIdx);
    if (braceIdx >= 0) {
      // Find matching closing brace
      let depth = 0;
      let endIdx = -1;
      for (let i = braceIdx; i < raw.length; i++) {
        if (raw[i] === '{') depth++;
        else if (raw[i] === '}') {
          depth--;
          if (depth === 0) { endIdx = i; break; }
        }
      }
      if (endIdx > 0) {
        try {
          const parsed = JSON.parse(raw.slice(braceIdx, endIdx + 1)) as { fixes?: Array<{ code: string; description: string }> };
          if (parsed.fixes && parsed.fixes.length > 0) {
            return { ok: true, fixes: parsed.fixes };
          }
        } catch { /* fall through */ }
      }
    }
  }

  // Strategy 3: Extract individual fix objects `{ "code": "...", "description": "..." }`
  const individualFixes: Array<{ code: string; description: string }> = [];
  const objPattern = /\{\s*"code"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"description"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  let objMatch: RegExpExecArray | null;
  while ((objMatch = objPattern.exec(raw)) !== null) {
    try {
      const obj = JSON.parse(objMatch[0]) as { code: string; description: string };
      individualFixes.push(obj);
    } catch { /* skip malformed */ }
  }
  if (individualFixes.length > 0) {
    return { ok: true, fixes: individualFixes };
  }

  // Strategy 4: Extract raw JavaScript code blocks
  const jsBlocks: Array<{ code: string; description: string }> = [];
  const jsPattern = /```(?:javascript|js)\s*\n([\s\S]*?)```/g;
  let jsMatch: RegExpExecArray | null;
  while ((jsMatch = jsPattern.exec(raw)) !== null) {
    const code = jsMatch[1].trim();
    if (code.length > 0) {
      jsBlocks.push({ code, description: `Fix block ${jsBlocks.length + 1}` });
    }
  }
  if (jsBlocks.length > 0) {
    return { ok: true, fixes: jsBlocks };
  }

  return { ok: false, reason: `Could not parse fix steps (no JSON fence, no { "fixes": }, no code blocks found)` };
}

// ============================================================================
// Work function
// ============================================================================

/**
 * Execute the Penpot design pipeline.
 *
 * Phase A: LLM generates a single JavaScript design script
 * Phase B: Execute the script via a single Penpot MCP execute_code call
 * Phase C: Visual self-correction loop (screenshot → evaluate → fix)
 */
export async function penpotDesignWork(
  input: PenpotDesignInput,
  provider: unknown,
  mcpClient: MCPClient,
  traceCollector?: { promptTraces?: PromptTrace[] },
): Promise<Result<PenpotDesignOutput>> {
  const { moduleId, planningOutput, designSystemPrompt, componentCatalogPrompt, description, viewportWidth, resolvedModel } = input;
  const llm = provider as unknown as LLMProvider;
  const effectiveModel = resolvedModel ?? PENPOT_DESIGN_CONTRACT.provider;

  if (!resolvedModel) {
    debugLog(`[penpot-design] resolvedModel not set, falling back to contract default: ${PENPOT_DESIGN_CONTRACT.provider}`);
  }

  // ── V2 DesignSpec path ──
  if (input.useDesignSpecV2) {
    return penpotDesignWorkV2(input, llm, mcpClient, provider as unknown as EvalLLMProvider, traceCollector);
  }

  // ── Dynamic API discovery ──

  const apiDocs = await discoverPenpotAPI(mcpClient);
  // eslint-disable-next-line no-console
  console.log(`        [penpot] Discovered ${apiDocs.length} chars of API docs from MCP server`);

  // ── Phase A: Generate design script via LLM ──

  let rawPrompt = loadPenpotSystemPrompt();

  // Render token-based template placeholders if design tokens are available
  if (input.designTokens) {
    rawPrompt = buildPromptFromTokens(rawPrompt, input.designTokens);
  }

  logDefaults('penpotDesignWork:promptSubstitution', {
    designSystemPrompt: [designSystemPrompt, "'(No project design system provided...)'"],
    apiDocs: [apiDocs, "'(API docs unavailable...)'"],
    componentCatalogPrompt: [componentCatalogPrompt, "'(No component catalog available)'"],
  });

  const systemPrompt = rawPrompt
    .replace('{{DESIGN_SYSTEM}}', designSystemPrompt || '(No project design system provided — use the token names from the rules below as guidance)')
    .replace('{{PENPOT_API_DOCS}}', apiDocs || '(API docs unavailable — use the rules above)')
    .replace('{{COMPONENT_CATALOG}}', componentCatalogPrompt || '(No component catalog available)');

  const userMessageParts = [
    `Module ID: ${moduleId}`,
  ];

  if (viewportWidth) {
    userMessageParts.push(`\nViewport Width: ${viewportWidth}px`);
    userMessageParts.push(`IMPORTANT: The root board MUST use resize(${viewportWidth}, estimatedHeight). All child layouts must fit within ${viewportWidth}px width.`);
  }

  if (description) {
    userMessageParts.push(`\nApp Description: ${description}`);
    userMessageParts.push(`\nIMPORTANT: Design this screen for the app described above. Use the componentTree below to determine which components to create. Populate all text with realistic, domain-appropriate content that matches this app.`);
  }

  userMessageParts.push(`\nPlanning Output:\n${JSON.stringify(planningOutput, null, 2)}`);

  // Inject structured page context if available
  if (input.pageContext) {
    userMessageParts.push(formatPageContextPrompt(input.pageContext));
  }

  const userMessage = userMessageParts.join('\n');

  if (traceCollector) {
    recordPromptTrace(traceCollector, 'design-penpot',
      { system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
      { model: PENPOT_DESIGN_CONTRACT.provider, maxTokens: 32000 });
  }

  const completionResult = await llm.complete(
    {
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: userMessage }],
    },
    {
      model: effectiveModel,
      maxTokens: 32000,
      temperature: 0,
    },
  );

  if (!completionResult.ok) {
    const err = completionResult.error as unknown as Record<string, unknown>;
    const detail = typeof err.message === 'string'
      ? err.message
      : typeof err.raw === 'string'
        ? err.raw
        : undefined;
    const message = detail
      ? `LLM completion failed (${String(err.code ?? 'unknown')}): ${detail}`
      : `LLM completion failed (${String(err.code ?? 'unknown')})`;
    return Err({
      code: 'LLM_API_ERROR' as const,
      message,
      recoverable: true,
    });
  }

  const completion = completionResult.value as { content: string; finishReason?: string };

  // Record V1 design response trace
  if (traceCollector) {
    const v1Completion = completionResult.value as { content: string; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }; cost?: { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number }; latencyMs?: number; finishReason?: string };
    recordPromptTraceResponse(traceCollector, 'design-penpot', {
      content: v1Completion.content,
      usage: v1Completion.usage,
      cost: v1Completion.cost,
      latencyMs: v1Completion.latencyMs,
      finishReason: v1Completion.finishReason,
    });
  }

  if (completion.finishReason === 'max_tokens') {
    // eslint-disable-next-line no-console
    console.error('        [penpot] LLM output truncated (hit maxTokens limit)');
    return Err({
      code: 'LLM_TRUNCATED',
      message: 'Penpot design script was truncated — LLM hit maxTokens limit. Try reducing component count or increasing maxTokens.',
      recoverable: true,
    });
  }
  const llmOutput = completion.content;

  const parseResult = parsePenpotDesignScript(llmOutput);
  if (!parseResult.ok) {
    return parseResult as Result<never>;
  }

  const { script, breakpoints } = parseResult.value;

  // ── Phase B: Execute design script in a single execute_code call ──

  const penpotNodeIds: Record<string, string> = {};
  let rootShapeId = '';

  // eslint-disable-next-line no-console
  console.log('        [penpot] Executing design script...');

  const wrappedScript = `
try {
  ${script}
} catch (e) {
  return { __error: true, message: e.message || String(e), stack: e.stack };
}
`;

  const scriptT0 = Date.now();
  const toolResult = await mcpClient.callTool('penpot', 'execute_code', {
    code: wrappedScript,
  });
  const scriptMs = Date.now() - scriptT0;

  if (toolResult.ok) {
    const result = toolResult.value as Record<string, unknown>;
    const content = result.content as Array<{ text?: string }> | undefined;
    if (Array.isArray(content)) {
      const text = content.map(c => c.text ?? '').join('');

      // Check for known error patterns
      if (text.includes('No Penpot plugin instances')) {
        // eslint-disable-next-line no-console
        console.error('\n        FATAL: Penpot plugin disconnected.');
        return Err({ code: 'MCP_UNAVAILABLE', message: 'Penpot plugin disconnected', recoverable: true });
      }

      try {
        const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
        const resultVal = parsed.result;

        if (resultVal?.__error) {
          const errMsg = String(resultVal.message ?? 'unknown script error');
          // eslint-disable-next-line no-console
          console.error(`        [penpot] Script error: ${errMsg} (${scriptMs}ms)`);
          if (resultVal.stack) {
            // eslint-disable-next-line no-console
            console.error(`        Stack: ${String(resultVal.stack).slice(0, 300)}`);
          }
          return Err({
            code: 'LLM_MALFORMED_OUTPUT',
            message: `Penpot script execution error: ${errMsg}`,
            recoverable: true,
          });
        } else {
          // Extract node IDs from result
          rootShapeId = String(resultVal?.rootId ?? '');
          const nodeIds = resultVal?.nodeIds as Record<string, string> | undefined;
          if (nodeIds) {
            Object.assign(penpotNodeIds, nodeIds);
          }
          const shapeCount = Object.keys(nodeIds ?? {}).length;
          // eslint-disable-next-line no-console
          console.log(`        [penpot] Script complete: ${shapeCount} components created (${scriptMs}ms)`);
        }

        // Log console output if any
        const logOutput = (parsed as Record<string, unknown>).log as string | undefined;
        if (logOutput?.trim()) {
          // eslint-disable-next-line no-console
          console.log(`        [penpot] Log: ${logOutput.trim().slice(0, 300)}`);
        }
      } catch {
        // Non-JSON response typically means a SyntaxError or other parse-time
        // failure in the LLM-generated script that the try/catch wrapper could
        // not catch. Treat it as a hard error rather than silently continuing.
        const snippet = text.slice(0, 300);
        // eslint-disable-next-line no-console
        console.error(`        [penpot] Non-JSON response (script likely has syntax error): ${snippet}`);
        return Err({
          code: 'LLM_MALFORMED_OUTPUT',
          message: `Penpot script failed with non-JSON response: ${snippet}`,
          recoverable: true,
        });
      }
    }
  } else {
    // eslint-disable-next-line no-console
    console.error(`        [penpot] Script execution failed: ${toolResult.error.message}`);
    return Err({
      code: 'MCP_UNAVAILABLE',
      message: `Penpot script execution failed: ${toolResult.error.message}`,
      recoverable: true,
    });
  }

  // ── Phase C: Visual self-correction loop ──
  const fixScripts: string[] = [];

  if (rootShapeId) {
    const MAX_CORRECTIONS = 3;
    const QUALITY_THRESHOLD = 80;

    // eslint-disable-next-line no-console
    console.log('\n        [Phase C] Visual self-correction loop');

    // Pause for Penpot to finish rendering before screenshot
    await new Promise((resolve) => setTimeout(resolve, 4000));

    let previousScore = -1;

    for (let correction = 0; correction < MAX_CORRECTIONS; correction++) {
      // 1. Capture screenshot via export_shape (with retry)
      const screenshotResult = await exportShapeWithRetry(mcpClient, rootShapeId);

      if (!screenshotResult.ok) {
        // eslint-disable-next-line no-console
        console.warn(`        [correction ${correction + 1}] Screenshot failed: ${screenshotResult.error.message}`);
        break;
      }

      const screenshotBase64 = screenshotResult.value;

      // 2. Evaluate design quality
      const evalProvider = provider as unknown as EvalLLMProvider;
      const evalResult = await evaluateDesign(
        screenshotBase64,
        JSON.stringify(planningOutput, null, 2),
        evalProvider,
        undefined,
        undefined,
        traceCollector,
        `evaluation-v1-${correction + 1}`,
      );

      if (!evalResult.ok) {
        // eslint-disable-next-line no-console
        console.warn(`        [correction ${correction + 1}] Evaluation failed: ${evalResult.error.message}`);
        break;
      }

      const evaluation = evalResult.value;
      // eslint-disable-next-line no-console
      console.log(`        [correction ${correction + 1}] Score: ${evaluation.score}/100 (${evaluation.overallQuality}), issues: ${evaluation.issues.length}`);

      if (evaluation.score >= QUALITY_THRESHOLD) {
        // eslint-disable-next-line no-console
        console.log(`        [correction] Quality threshold met (${evaluation.score} >= ${QUALITY_THRESHOLD})`);
        break;
      }

      // Stop if score isn't improving
      if (previousScore >= 0 && evaluation.score <= previousScore) {
        // eslint-disable-next-line no-console
        console.log(`        [correction] Score not improving (${evaluation.score} <= ${previousScore}), stopping`);
        break;
      }
      previousScore = evaluation.score;

      if (evaluation.issues.length === 0) {
        break;
      }

      // 3. Generate fix code via LLM
      const actionableIssues = evaluation.issues.filter(
        (issue) => issue.severity === 'critical' || issue.severity === 'major',
      );

      if (actionableIssues.length === 0) {
        // eslint-disable-next-line no-console
        console.log(`        [correction ${correction + 1}] No critical/major issues to fix`);
        break;
      }

      const issuesSummary = actionableIssues
        .map(i => `- [${i.severity}] ${i.component}: ${i.description} (fix: ${i.fix})`)
        .join('\n');

      const fixPrompt = {
        system: `You are a Penpot design fixer. Given issues found in a design, generate JavaScript code to fix them using the Penpot Plugin API.
The code runs via execute_code.

PENPOT PLUGIN API REFERENCE:
${apiDocs || '(unavailable)'}

CRITICAL RULES:
- Use penpot.createBoard() for containers — NOT createFrame (does not exist)
- Use penpot.createText("content") — text content MUST be in constructor. NEVER pass empty string "" (returns undefined). Use a space " " for empty/placeholder text.
- Use shape.resize(w, h) — width/height are READ-ONLY
- Fills/strokes replace entire array: shape.fills = [{ fillColor: '#HEX', fillOpacity: 1 }]
- NEVER use: createFrame, shape.width=, shape.height=, shape.text=
- All numeric values (width, height, x, y, fontSize) MUST be positive numbers. Never use null or undefined.
- NEVER add children to Ellipse, Rectangle, Line, or Path shapes. Only Board (frame) shapes can contain children.
- Only emit code that modifies shapes. Do NOT emit code that only reads/logs shape properties — it won't fix anything.
- Always guard resize/position with positive numbers: if (w > 0 && h > 0) shape.resize(w, h);

FINDING SHAPES (findByName is auto-injected — just call it):
- \`const shape = findByName(penpot.currentPage.root, 'ShapeName');\` — recursive search by name
- \`if (!shape) return { skipped: true, reason: 'shape not found' };\` — guard against missing shapes

Return ONLY a JSON object: { "fixes": [{ "code": "...", "description": "..." }] }`,
        messages: [{
          role: 'user' as const,
          content: `Fix these design issues:\n${issuesSummary}\n\nGenerate Penpot Plugin API JavaScript code to fix each issue.`,
        }],
      };

      const fixResult = await llm.complete(fixPrompt, {
        model: effectiveModel,
        maxTokens: 8000,
        temperature: 0,
        responseSchema: PENPOT_FIX_SCHEMA,
      });

      if (!fixResult.ok) {
        // eslint-disable-next-line no-console
        console.warn(`        [correction ${correction + 1}] Fix generation failed`);
        break;
      }

      // Record V1 correction response trace
      if (traceCollector) {
        const fixStageName = `fix-v1-${correction + 1}`;
        recordPromptTrace(traceCollector, fixStageName, fixPrompt, { model: effectiveModel, maxTokens: 8000 });
        const fixVal = fixResult.value as { content: string; structured?: Record<string, unknown>; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }; cost?: { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number }; latencyMs?: number; finishReason?: string };
        recordPromptTraceResponse(traceCollector, fixStageName, {
          content: fixVal.content,
          structured: fixVal.structured,
          usage: fixVal.usage,
          cost: fixVal.cost,
          latencyMs: fixVal.latencyMs,
          finishReason: fixVal.finishReason,
        });
      }

      // Parse fix steps — prefer structured output, fall back to text parsing
      const structured = (fixResult.value as { structured?: Record<string, unknown> }).structured;
      let parseFixResult: FixParseResult;
      if (structured && Array.isArray(structured.fixes) && structured.fixes.length > 0) {
        parseFixResult = { ok: true, fixes: structured.fixes as Array<{ code: string; description: string }> };
      } else {
        const fixOutput = (fixResult.value as { content: string }).content;
        parseFixResult = parsePenpotFixSteps(fixOutput);
      }
      if (!parseFixResult.ok) {
        // eslint-disable-next-line no-console
        console.warn(`        [correction ${correction + 1}] ${parseFixResult.reason}`);
        continue; // Retry with a fresh screenshot instead of breaking
      }
      const fixes = parseFixResult.fixes;

      // 4. Execute fixes
      let fixedCount = 0;
      for (const fix of fixes.slice(0, 5)) {
        // Inject findByName helper so fix code can find shapes by name
        const wrappedFix = `
function findByName(parent, name) {
  for (const c of parent.children || []) {
    if (c.name === name) return c;
    const found = findByName(c, name);
    if (found) return found;
  }
  return null;
}
function guardNumeric(v, name) {
  if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) {
    throw new Error(name + ' must be a finite number, got ' + String(v));
  }
  return v;
}
try {
${fix.code}
} catch (e) {
  return { __error: true, message: e.message || String(e) };
}
`;
        const fixToolResult = await mcpClient.callTool('penpot', 'execute_code', { code: wrappedFix });
        if (fixToolResult.ok) {
          const fixContent = fixToolResult.value as { content?: Array<{ text?: string }> };
          const fixText = Array.isArray(fixContent.content)
            ? fixContent.content.map(c => c.text ?? '').join('') : '';
          try {
            const fixParsed = JSON.parse(fixText) as { result?: Record<string, unknown> };
            if (fixParsed.result && (fixParsed.result as Record<string, unknown>).__error) {
              // eslint-disable-next-line no-console
              console.warn(`        [fix] ${fix.description} → ERR: ${(fixParsed.result as Record<string, unknown>).message}`);
            } else {
              fixedCount++;
              fixScripts.push(fix.code);
              // eslint-disable-next-line no-console
              console.log(`        [fix] ${fix.description} → OK`);
            }
          } catch {
            fixedCount++;
            fixScripts.push(fix.code);
            // eslint-disable-next-line no-console
            console.log(`        [fix] ${fix.description} → OK`);
          }
        } else {
          // eslint-disable-next-line no-console
          console.warn(`        [fix] ${fix.description} → ERR: ${fixToolResult.error.message}`);
        }
      }

      // eslint-disable-next-line no-console
      console.log(`        [correction ${correction + 1}] Applied ${fixedCount}/${fixes.length} fixes`);

      // Wait for Penpot to render changes
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('\n        [Phase C] Skipped — no root shape found for screenshot');
  }

  // ── Phase D: Capture design snapshot (shared with Figma) ──
  const snapshotData = await captureDesignSnapshot({
    tool: 'penpot',
    moduleId,
    projectRoot: process.cwd(),
    nodeIds: penpotNodeIds,
    mcpClient,
    captureScreenshot: async (client, nodeId) => {
      const result = await exportShapeWithRetry(client, nodeId, { scale: 2 });
      if (!result.ok) return result;
      return { ok: true as const, value: { imageUrl: 'penpot://export', base64: result.value } };
    },
    extractProperties: async (client, nodeId) => {
      // Penpot uses execute_code to inspect shape properties
      const result = await client.callTool('penpot', 'execute_code', {
        code: `const shape = penpot.currentPage?.getShapeById("${nodeId}"); return shape ? { name: shape.name, type: shape.type, x: shape.x, y: shape.y, width: shape.width, height: shape.height, fills: shape.fills, strokes: shape.strokes, opacity: shape.opacity } : null;`,
      });
      if (!result.ok) return result;
      const content = result.value as { content?: Array<{ text?: string }> };
      const text = Array.isArray(content.content) ? content.content.map(c => c.text ?? '').join('') : '';
      try {
        const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
        if (parsed.result) {
          return { ok: true as const, value: parsed.result };
        }
        return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Shape not found', recoverable: true } };
      } catch {
        return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Failed to parse shape properties', recoverable: true } };
      }
    },
  });

  // ── Save scripts as .js files alongside screenshots ──
  const scriptDir = join(process.cwd(), PREVIEW_DIR_REL, moduleId, 'scripts');
  if (!existsSync(scriptDir)) {
    mkdirSync(scriptDir, { recursive: true });
  }
  // Main design script
  const mainScriptPath = join(scriptDir, 'design.js');
  writeFileSync(mainScriptPath, `// Penpot design script for module: ${moduleId}\n// Generated at: ${new Date().toISOString()}\n\n${script}\n`);
  // eslint-disable-next-line no-console
  console.log(`        [penpot] Script saved: ${mainScriptPath}`);

  // Fix scripts from Phase C
  if (fixScripts.length > 0) {
    const fixesContent = fixScripts
      .map((code, i) => `// --- Fix ${i + 1} ---\n${code}`)
      .join('\n\n');
    const fixScriptPath = join(scriptDir, 'fixes.js');
    writeFileSync(fixScriptPath, `// Penpot fix scripts for module: ${moduleId}\n// ${fixScripts.length} fix(es) applied\n\n${fixesContent}\n`);
    // eslint-disable-next-line no-console
    console.log(`        [penpot] Fix scripts saved: ${fixScriptPath}`);
  }

  return Ok({
    penpotProjectId: `penpot-${moduleId}`,
    penpotPageId: `page-${moduleId}`,
    penpotNodeIds,
    moduleId,
    breakpoints,
    script,
    ...(fixScripts.length > 0 ? { fixScripts } : {}),
    ...snapshotData,
  });
}

// ============================================================================
// V2 DesignSpec pipeline
// ============================================================================

/**
 * Execute a Penpot script via MCP and parse the result.
 * Returns rootId and nodeIds on success.
 */
async function executeRenderedScript(
  script: string,
  mcpClient: MCPClient,
): Promise<Result<{ rootId: string; nodeIds: Record<string, string> }>> {
  const wrappedScript = `
try {
  ${script}
} catch (e) {
  return { __error: true, message: e.message || String(e), stack: e.stack };
}
`;

  const toolResult = await mcpClient.callTool('penpot', 'execute_code', { code: wrappedScript });

  if (!toolResult.ok) {
    return Err({
      code: 'MCP_UNAVAILABLE',
      message: `Penpot script execution failed: ${toolResult.error.message}`,
      recoverable: true,
    });
  }

  const result = toolResult.value as Record<string, unknown>;
  const content = result.content as Array<{ text?: string }> | undefined;
  if (!Array.isArray(content)) {
    return Err({ code: 'LLM_MALFORMED_OUTPUT', message: 'No content in execute_code response', recoverable: true });
  }

  const text = content.map(c => c.text ?? '').join('');

  if (text.includes('No Penpot plugin instances')) {
    return Err({ code: 'MCP_UNAVAILABLE', message: 'Penpot plugin disconnected', recoverable: true });
  }

  try {
    const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
    const resultVal = parsed.result;

    if (resultVal?.__error) {
      return Err({
        code: 'LLM_MALFORMED_OUTPUT',
        message: `Penpot script execution error: ${String(resultVal.message ?? 'unknown')}`,
        recoverable: true,
      });
    }

    const rootId = String(resultVal?.rootId ?? '');
    const nodeIds = (resultVal?.nodeIds as Record<string, string>) ?? {};

    return Ok({ rootId, nodeIds });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT',
      message: `Penpot script returned non-JSON: ${text.slice(0, 300)}`,
      recoverable: true,
    });
  }
}

/**
 * Execute a chunked render result: chunk 0 creates the root board,
 * subsequent chunks recover the root by ID and append subtrees.
 */
async function executeChunkedScript(
  chunkedResult: ChunkedRenderResult,
  mcpClient: MCPClient,
): Promise<Result<{ rootId: string; nodeIds: Record<string, string> }>> {
  const allNodeIds: Record<string, string> = {};
  let rootId = '';

  for (let i = 0; i < chunkedResult.chunks.length; i++) {
    const chunk = chunkedResult.chunks[i];
    const isFirst = i === 0;

    // eslint-disable-next-line no-console
    console.log(`        [penpot v2] Executing chunk ${i + 1}/${chunkedResult.chunks.length}...`);

    // Continuation chunks need rootId passed as argument
    const code = isFirst
      ? `try {\n${chunk}\n} catch (e) { return { __error: true, message: e.message || String(e), stack: e.stack }; }`
      : `const __run = (function() {\n${chunk}\n});\nreturn __run("${rootId}");`;

    // For chunk 0, just execute directly; for continuation, wrap to pass rootId
    const scriptToRun = isFirst ? chunk : code;

    const toolResult = await mcpClient.callTool('penpot', 'execute_code', { code: scriptToRun });

    if (!toolResult.ok) {
      return Err({
        code: 'MCP_UNAVAILABLE',
        message: `Penpot chunk ${i + 1}/${chunkedResult.chunks.length} execution failed: ${toolResult.error.message}`,
        recoverable: true,
      });
    }

    const result = toolResult.value as Record<string, unknown>;
    const content = result.content as Array<{ text?: string }> | undefined;
    if (!Array.isArray(content)) {
      return Err({ code: 'LLM_MALFORMED_OUTPUT', message: `No content in chunk ${i + 1} response`, recoverable: true });
    }

    const text = content.map(c => c.text ?? '').join('');

    if (text.includes('No Penpot plugin instances')) {
      return Err({ code: 'MCP_UNAVAILABLE', message: 'Penpot plugin disconnected', recoverable: true });
    }

    try {
      const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
      const resultVal = parsed.result;

      if (resultVal?.__error) {
        return Err({
          code: 'LLM_MALFORMED_OUTPUT',
          message: `Penpot chunk ${i + 1} error: ${String(resultVal.message ?? 'unknown')}`,
          recoverable: true,
        });
      }

      // Chunk 0 returns rootId
      if (isFirst && resultVal?.rootId) {
        rootId = String(resultVal.rootId);
      }

      // All chunks return nodeIds
      const chunkNodeIds = (resultVal?.nodeIds as Record<string, string>) ?? {};
      Object.assign(allNodeIds, chunkNodeIds);
    } catch {
      return Err({
        code: 'LLM_MALFORMED_OUTPUT',
        message: `Penpot chunk ${i + 1} returned non-JSON: ${text.slice(0, 300)}`,
        recoverable: true,
      });
    }

    // Brief pause between chunks to let Penpot process
    if (i < chunkedResult.chunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return Ok({ rootId, nodeIds: allNodeIds });
}

/**
 * Delete an existing root shape from the Penpot canvas.
 * Used in the v2 correction loop before re-rendering.
 */
async function deleteRootShape(mcpClient: MCPClient, rootShapeId: string): Promise<void> {
  const cleanupScript = `
const page = penpot.currentPage;
const root = page.getShapeById('${rootShapeId}');
if (root) { root.remove(); }
return { deleted: !!root };
`;
  await mcpClient.callTool('penpot', 'execute_code', { code: cleanupScript });
}

/**
 * Extract a DesignSpecV2 from the LLM's tool call response.
 */
function extractDesignSpecFromToolCall(
  completionValue: { content: string; toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }> },
): Result<DesignSpecV2> {
  const toolCall = completionValue.toolCalls?.find(tc => tc.name === 'submit_design');
  if (!toolCall) {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT',
      message: 'LLM did not call submit_design tool. Ensure tool_choice is set correctly.',
      recoverable: true,
    });
  }

  const args = toolCall.args;
  if (!args.screen || !args.width || !args.nodes) {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT',
      message: `submit_design call missing required fields. Got: ${Object.keys(args).join(', ')}`,
      recoverable: true,
    });
  }

  return Ok({
    screen: String(args.screen),
    width: Number(args.width),
    nodes: args.nodes as Record<string, import('@agentforge/designspec-renderer').NodeSpec>,
  });
}

// ============================================================================
// Structural reconciliation — diff DesignSpec vs actual Penpot shapes
// ============================================================================

/** A structural issue found by comparing DesignSpec against actual Penpot shapes. */
interface StructuralIssue {
  readonly type: 'missing-node' | 'clipped-node' | 'collapsed-node' | 'node-count-mismatch';
  readonly nodeId?: string;
  readonly description: string;
}

/**
 * Read the actual Penpot node tree via `execute_code` and compare against the DesignSpec.
 * Returns structural issues that vision-based evaluation might miss.
 */
async function reconcileStructure(
  mcpClient: MCPClient,
  rootShapeId: string,
  spec: DesignSpecV2,
): Promise<StructuralIssue[]> {
  // Collect all shape names recursively (unlimited depth, names only to keep payload small)
  const code = `
const root = penpot.currentPage?.getShapeById("${rootShapeId}");
if (!root) return { error: "Root not found" };
const allNames = [];
const topShapes = [];
function walk(shape) {
  allNames.push(shape.name);
  if (shape.children) shape.children.forEach(walk);
}
const children = root.children || [];
children.forEach(c => {
  topShapes.push({ name: c.name, x: c.x, y: c.y, w: c.width, h: c.height });
  walk(c);
});
return {
  root: { name: root.name, w: root.width, h: root.height },
  shapes: topShapes,
  allNames: allNames,
  totalChildren: children.length
};
`;

  const result = await mcpClient.callTool('penpot', 'execute_code', { code });
  if (!result.ok) return [];

  const content = result.value as { content?: Array<{ text?: string }> };
  const text = Array.isArray(content.content) ? content.content.map(c => c.text ?? '').join('') : '';

  let parsed: {
    result?: {
      error?: string;
      root?: { name: string; w: number; h: number };
      shapes?: Array<{ name: string; x: number; y: number; w: number; h: number }>;
      allNames?: string[];
      totalChildren?: number;
    };
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  if (!parsed.result || parsed.result.error) return [];

  const { root, shapes = [], allNames = [] } = parsed.result;
  if (!root) return [];

  const issues: StructuralIssue[] = [];

  // All shape names collected recursively from the Penpot tree (unlimited depth)
  const penpotNames = new Set(allNames);

  // Compare expected spec nodes against actual Penpot shapes
  const specNodeIds = Object.keys(spec.nodes);
  const expectedCount = specNodeIds.length;
  const actualCount = penpotNames.size + 1; // +1 for root

  if (actualCount < expectedCount) {
    issues.push({
      type: 'node-count-mismatch',
      description: `Expected ${expectedCount} nodes from DesignSpec but only ${actualCount} shapes found in Penpot. ${expectedCount - actualCount} nodes may be missing.`,
    });
  }

  // Check for missing nodes (in spec but not in Penpot)
  for (const nodeId of specNodeIds) {
    // Root node matches differently (it's the root board itself)
    if (spec.nodes[nodeId].parent === null) continue;
    if (!penpotNames.has(nodeId)) {
      issues.push({
        type: 'missing-node',
        nodeId,
        description: `Node "${nodeId}" exists in DesignSpec but was not found in Penpot shapes.`,
      });
    }
  }

  // Check for clipped nodes (child extends beyond root frame height)
  const rootHeight = root.h;
  for (const shape of shapes) {
    const bottom = (shape.y || 0) + (shape.h || 0);
    if (bottom > rootHeight && shape.h > 0) {
      issues.push({
        type: 'clipped-node',
        nodeId: shape.name,
        description: `Node "${shape.name}" extends to y=${bottom}px but root frame height is only ${rootHeight}px. Content is clipped.`,
      });
    }
  }

  // Check for collapsed nodes (zero height/width)
  for (const shape of shapes) {
    if (shape.h === 0 || shape.w === 0) {
      issues.push({
        type: 'collapsed-node',
        nodeId: shape.name,
        description: `Node "${shape.name}" has zero ${shape.h === 0 ? 'height' : 'width'} (${shape.w}x${shape.h}). It may not be rendering.`,
      });
    }
  }

  return issues;
}

/**
 * Format structural issues for inclusion in the correction prompt.
 */
function formatStructuralIssues(issues: StructuralIssue[]): string {
  if (issues.length === 0) return '';
  // Cap at 10 issues to prevent overwhelming the correction prompt
  const MAX_ISSUES = 10;
  const capped = issues.slice(0, MAX_ISSUES);
  const lines = capped.map(i => `- [${i.type}] ${i.description}`);
  const overflow = issues.length > MAX_ISSUES ? `\n- ... and ${issues.length - MAX_ISSUES} more structural issues (omitted)` : '';
  return `\n\nSTRUCTURAL ISSUES (programmatic diff, not from screenshot):\nThese issues were detected by comparing the DesignSpec JSON against the actual Penpot node tree.\nThey are MORE RELIABLE than vision-based issues.\n${lines.join('\n')}${overflow}`;
}

/**
 * V2 correction loop: screenshot → evaluate → re-generate spec → delete → re-render.
 */
async function runV2CorrectionLoop(
  currentSpec: DesignSpecV2,
  rootShapeId: string,
  llm: LLMProvider,
  mcpClient: MCPClient,
  evalProvider: EvalLLMProvider,
  tokens: RendererTokens,
  catalogMap: CatalogMap,
  planningOutput: UXPlanningOutput,
  effectiveModel: string,
  systemPrompt: string,
  traceCollector?: { promptTraces?: PromptTrace[] },
): Promise<{ finalSpec: DesignSpecV2; fixScripts: string[]; updatedNodeIds?: Record<string, string> }> {
  const MAX_CORRECTIONS = 3;
  const QUALITY_THRESHOLD = 80;
  const fixScripts: string[] = [];
  let spec = currentSpec;
  let currentRootId = rootShapeId;
  let previousScore = -1;
  let latestNodeIds: Record<string, string> | undefined;

  // eslint-disable-next-line no-console
  console.log('\n        [Phase C v2] Visual self-correction loop');

  // Pause for Penpot to finish rendering before screenshot
  await new Promise((resolve) => setTimeout(resolve, 4000));

  for (let correction = 0; correction < MAX_CORRECTIONS; correction++) {
    // 1. Capture screenshot (with retry)
    const screenshotResult = await exportShapeWithRetry(mcpClient, currentRootId);

    if (!screenshotResult.ok) {
      // eslint-disable-next-line no-console
      console.warn(`        [v2 correction ${correction + 1}] Screenshot failed: ${screenshotResult.error.message}`);
      break;
    }

    // 2. Evaluate
    const evalResult = await evaluateDesign(
      screenshotResult.value,
      JSON.stringify(planningOutput, null, 2),
      evalProvider,
      undefined,
      undefined,
      traceCollector,
      `evaluation-v2-${correction + 1}`,
    );

    if (!evalResult.ok) {
      // eslint-disable-next-line no-console
      console.warn(`        [v2 correction ${correction + 1}] Evaluation failed: ${evalResult.error.message}`);
      break;
    }

    const evaluation = evalResult.value;
    // eslint-disable-next-line no-console
    console.log(`        [v2 correction ${correction + 1}] Score: ${evaluation.score}/100 (${evaluation.overallQuality}), issues: ${evaluation.issues.length}`);

    if (evaluation.score >= QUALITY_THRESHOLD) {
      // eslint-disable-next-line no-console
      console.log(`        [v2 correction] Quality threshold met (${evaluation.score} >= ${QUALITY_THRESHOLD})`);
      break;
    }

    if (previousScore >= 0 && evaluation.score <= previousScore) {
      // eslint-disable-next-line no-console
      console.log(`        [v2 correction] Score not improving (${evaluation.score} <= ${previousScore}), stopping`);
      break;
    }
    previousScore = evaluation.score;

    // 2b. Structural reconciliation — diff DesignSpec vs actual Penpot shapes
    const structuralIssues = await reconcileStructure(mcpClient, currentRootId, spec);
    if (structuralIssues.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`        [v2 correction ${correction + 1}] Structural issues: ${structuralIssues.length} (${structuralIssues.map(i => i.type).join(', ')})`);
    }

    const actionableIssues = evaluation.issues.filter(
      (issue) => issue.severity === 'critical' || issue.severity === 'major',
    );
    if (actionableIssues.length === 0 && structuralIssues.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`        [v2 correction ${correction + 1}] No critical/major issues to fix`);
      break;
    }

    // 3. Generate corrected spec via LLM
    const issuesSummary = actionableIssues
      .map(i => `- [${i.severity}] ${i.component}: ${i.description} (fix: ${i.fix})`)
      .join('\n');

    const structuralContext = formatStructuralIssues(structuralIssues);

    const correctionPrompt = {
      system: systemPrompt,
      messages: [{
        role: 'user' as const,
        content: `The current design has these issues:\n${issuesSummary}${structuralContext}\n\nCurrent DesignSpec:\n${JSON.stringify(spec, null, 2)}\n\nOutput a CORRECTED design spec that fixes ONLY the reported issues. Keep all other nodes identical. Call the submit_design tool with the corrected spec.`,
      }],
      tools: [SUBMIT_DESIGN_TOOL as { name: string; description: string; parameters: Record<string, unknown> }],
    };

    const correctionResult = await llm.complete(correctionPrompt, {
      model: effectiveModel,
      maxTokens: 8000,
      temperature: 0,
      toolChoice: { type: 'tool', name: 'submit_design' },
    });

    if (!correctionResult.ok) {
      // eslint-disable-next-line no-console
      console.warn(`        [v2 correction ${correction + 1}] LLM correction failed`);
      break;
    }

    // Record correction response trace
    if (traceCollector) {
      const stageName = `correction-v2-${correction + 1}`;
      recordPromptTrace(traceCollector, stageName, correctionPrompt, { model: effectiveModel, maxTokens: 8000 });
      const corrVal = correctionResult.value as { content: string; toolCalls?: { name: string; args: Record<string, unknown> }[]; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }; cost?: { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number }; latencyMs?: number; finishReason?: string };
      recordPromptTraceResponse(traceCollector, stageName, {
        content: corrVal.content,
        toolCalls: corrVal.toolCalls?.map(tc => ({ name: tc.name, args: tc.args })),
        usage: corrVal.usage,
        cost: corrVal.cost,
        latencyMs: corrVal.latencyMs,
        finishReason: corrVal.finishReason,
      });
    }

    const extractResult = extractDesignSpecFromToolCall(correctionResult.value);
    if (!extractResult.ok) {
      // eslint-disable-next-line no-console
      console.warn(`        [v2 correction ${correction + 1}] ${extractResult.error.message}`);
      break;
    }

    const correctedSpec = extractResult.value;

    // 4. Validate + render
    const validation = validateDesignSpec(correctedSpec, catalogMap);
    if (!validation.valid) {
      // eslint-disable-next-line no-console
      console.warn(`        [v2 correction ${correction + 1}] Validation errors: ${validation.errors.map(e => e.message).join('; ')}`);
      break;
    }

    const renderResult = renderToScript(correctedSpec, tokens, catalogMap);

    // 5. Delete old, execute new
    await deleteRootShape(mcpClient, currentRootId);

    const execResult = await executeRenderedScript(renderResult.script, mcpClient);
    if (!execResult.ok) {
      // eslint-disable-next-line no-console
      console.warn(`        [v2 correction ${correction + 1}] Re-execution failed: ${execResult.error.message}`);
      break;
    }

    spec = correctedSpec;
    currentRootId = execResult.value.rootId;
    latestNodeIds = execResult.value.nodeIds;
    fixScripts.push(renderResult.script);
    // eslint-disable-next-line no-console
    console.log(`        [v2 correction ${correction + 1}] Re-rendered with ${Object.keys(execResult.value.nodeIds).length} shapes`);

    // Wait for Penpot to render
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return { finalSpec: spec, fixScripts, updatedNodeIds: latestNodeIds };
}

/**
 * V2 DesignSpec pipeline: LLM produces JSON spec → renderer generates Penpot script.
 *
 * This path replaces the v1 LLM-generates-JS-directly approach.
 * The LLM outputs ~177 lines of JSON (via submit_design tool call) instead of
 * ~660 lines of Penpot JavaScript. A deterministic renderer converts the spec
 * to correct Penpot API calls, eliminating API bugs.
 */
async function penpotDesignWorkV2(
  input: PenpotDesignInput,
  llm: LLMProvider,
  mcpClient: MCPClient,
  evalProvider: EvalLLMProvider,
  traceCollector?: { promptTraces?: PromptTrace[] },
): Promise<Result<PenpotDesignOutput>> {
  const {
    moduleId, planningOutput, designSystemPrompt, componentCatalogPrompt,
    description, viewportWidth, resolvedModel, rendererTokens, catalogMap,
  } = input;

  const effectiveModel = resolvedModel ?? PENPOT_DESIGN_CONTRACT.provider;

  if (!rendererTokens || !catalogMap) {
    return Err({
      code: 'INVALID_STATE',
      message: 'useDesignSpecV2 requires rendererTokens and catalogMap',
      recoverable: false,
    });
  }

  // ── Phase A: Generate DesignSpec via LLM tool call (or load from cache) ──

  // Check for cached DesignSpec from a previous run (avoids LLM call on retry after 413, etc.)
  const cachedSpecDir = join(process.cwd(), PREVIEW_DIR_REL, moduleId, 'scripts');
  const cachedSpecPath = join(cachedSpecDir, 'designspec-v2.json');
  let designSpec: DesignSpecV2 | undefined;

  if (existsSync(cachedSpecPath)) {
    try {
      const raw = readFileSync(cachedSpecPath, 'utf-8');
      designSpec = JSON.parse(raw) as DesignSpecV2;
      // eslint-disable-next-line no-console
      console.log(`        [penpot v2] Loaded cached DesignSpec (${Object.keys(designSpec.nodes).length} nodes) — skipping LLM call`);
      // eslint-disable-next-line no-console
      console.log(`        [penpot v2] Delete ${cachedSpecPath} to force regeneration`);
    } catch {
      designSpec = undefined; // Corrupted cache — regenerate
    }
  }

  // Build system prompt (needed for both LLM generation and correction loop)
  let rawPromptV2 = loadPenpotV2SystemPrompt();
  if (input.designTokens) {
    rawPromptV2 = buildPromptFromTokens(rawPromptV2, input.designTokens);
  }
  const renderableIds = catalogMap ? Object.keys(catalogMap).sort().map(id => `\`${id}\``).join(', ') : '(none)';
  const systemPrompt = rawPromptV2
    .replace('{{DESIGN_SYSTEM}}', designSystemPrompt || '(No project design system provided — use generic token names)')
    .replace('{{COMPONENT_CATALOG}}', componentCatalogPrompt || '(No component catalog available)')
    .replace('{{RENDERABLE_CATALOG_IDS}}', renderableIds);

  if (!designSpec) {
  // eslint-disable-next-line no-console
  console.log('        [penpot v2] Generating DesignSpec via submit_design tool...');

  const userMessageParts = [
    `Module ID: ${moduleId}`,
  ];

  if (viewportWidth) {
    userMessageParts.push(`\nViewport Width: ${viewportWidth}px`);
    userMessageParts.push(`IMPORTANT: The root page node MUST have width: ${viewportWidth}.`);
  }

  if (description) {
    userMessageParts.push(`\nApp Description: ${description}`);
    userMessageParts.push(`\nIMPORTANT: Design this screen for the app described above. Populate all text with realistic, domain-appropriate content.`);
  }

  userMessageParts.push(`\nPlanning Output:\n${JSON.stringify(planningOutput, null, 2)}`);

  // Inject structured page context if available
  if (input.pageContext) {
    userMessageParts.push(formatPageContextPrompt(input.pageContext));
  }

  const userMessage = userMessageParts.join('\n');

  if (traceCollector) {
    recordPromptTrace(traceCollector, 'design-penpot-v2',
      { system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
      { model: effectiveModel, maxTokens: 16000 });
  }
  // Here the design tokens are lost - due to inconsistencies in how we are defining schema less in "design:generate" command until here when we load the design
  const completionResult = await llm.complete(
    {
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: userMessage }],
      tools: [SUBMIT_DESIGN_TOOL as { name: string; description: string; parameters: Record<string, unknown> }],
    },
    {
      model: effectiveModel,
      maxTokens: 32000,
      temperature: 0,
      toolChoice: { type: 'tool', name: 'submit_design' },
    },
  );

  if (!completionResult.ok) {
    const err = completionResult.error as unknown as Record<string, unknown>;
    const detail = typeof err.message === 'string' ? err.message
      : typeof err.raw === 'string' ? err.raw
        : undefined;
    return Err({
      code: 'LLM_API_ERROR',
      message: detail
        ? `LLM completion failed (${String(err.code ?? 'unknown')}): ${detail}`
        : `LLM completion failed (${String(err.code ?? 'unknown')})`,
      recoverable: true,
    });
  }

  const completion = completionResult.value;

  // Record V2 design response trace
  if (traceCollector) {
    const v2Completion = completionResult.value as { content: string; structured?: Record<string, unknown>; toolCalls?: { name: string; args: Record<string, unknown> }[]; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }; cost?: { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number }; latencyMs?: number; finishReason?: string };
    recordPromptTraceResponse(traceCollector, 'design-penpot-v2', {
      content: v2Completion.content,
      structured: v2Completion.structured,
      toolCalls: v2Completion.toolCalls?.map((tc: { name: string; args: Record<string, unknown> }) => ({ name: tc.name, args: tc.args })),
      usage: v2Completion.usage ? { inputTokens: v2Completion.usage.inputTokens, outputTokens: v2Completion.usage.outputTokens, cacheReadTokens: v2Completion.usage.cacheReadTokens, cacheWriteTokens: v2Completion.usage.cacheWriteTokens } : undefined,
      cost: v2Completion.cost ? { inputCostUsd: v2Completion.cost.inputCostUsd, outputCostUsd: v2Completion.cost.outputCostUsd, totalCostUsd: v2Completion.cost.totalCostUsd } : undefined,
      latencyMs: v2Completion.latencyMs,
      finishReason: v2Completion.finishReason,
    });
  }

  if (completion.finishReason === 'max_tokens') {
    // eslint-disable-next-line no-console
    console.error('        [penpot v2] LLM output truncated (hit maxTokens limit)');
    return Err({
      code: 'LLM_TRUNCATED',
      message: 'DesignSpec output was truncated — LLM hit maxTokens limit.',
      recoverable: true,
    });
  }

  // ── Extract DesignSpec from tool call ──

  const extractResult = extractDesignSpecFromToolCall(completion);
  if (!extractResult.ok) {
    return extractResult as Result<never>;
  }

  designSpec = extractResult.value;
  const nodeCount = Object.keys(designSpec.nodes).length;
  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] DesignSpec received: ${nodeCount} nodes for screen "${designSpec.screen}"`);

  // Save DesignSpec immediately so it can be reused if execution fails (e.g., HTTP 413)
  if (!existsSync(cachedSpecDir)) {
    mkdirSync(cachedSpecDir, { recursive: true });
  }
  writeFileSync(cachedSpecPath, JSON.stringify(designSpec, null, 2));
  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] DesignSpec cached: ${cachedSpecPath}`);

  } // end if (!designSpec) — LLM generation block

  // ── Validate (with dynamic catalog generation for missing entries) ──

  let validation = validateDesignSpec(designSpec, catalogMap);

  // Detect missing catalog entries and dynamically generate renderers
  if (!validation.valid && input.componentCatalogRaw) {
    const catalogErrors = validation.errors.filter(e => e.rule === 'valid-catalog' && e.nodeId);
    const missingIds = new Set<string>();
    for (const err of catalogErrors) {
      const nodeId = err.nodeId!;
      const catalogId = designSpec.nodes[nodeId]?.catalog;
      if (catalogId && !(catalogId in catalogMap)) {
        missingIds.add(catalogId);
      }
    }

    if (missingIds.size > 0) {
      const mutableCatalog = catalogMap as Record<string, unknown>;
      const generated: string[] = [];

      for (const missingId of missingIds) {
        // Convert kebab-case back to PascalCase to look up in raw catalog
        const pascalName = missingId
          .split('-')
          .map(s => s.charAt(0).toUpperCase() + s.slice(1))
          .join('');

        const rawEntry = input.componentCatalogRaw[pascalName];
        if (!rawEntry) continue;

        // Generate catalog entry + renderer from anatomy
        const catalogEntry = generateCatalogEntry(rawEntry);
        mutableCatalog[missingId] = catalogEntry;

        const renderer = generateRenderer(missingId, rawEntry);
        registerCatalogRenderer(missingId, renderer);

        generated.push(missingId);
      }

      if (generated.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`        [penpot v2] Dynamically generated ${generated.length} renderer(s): ${generated.join(', ')}`);
        // Re-validate with the expanded catalog
        validation = validateDesignSpec(designSpec, catalogMap);
      }
    }
  }

  if (validation.warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`        [penpot v2] Validation warnings: ${validation.warnings.map(w => w.message).join('; ')}`);
  }
  if (!validation.valid) {
    // eslint-disable-next-line no-console
    console.error(`        [penpot v2] Validation errors: ${validation.errors.map(e => e.message).join('; ')}`);
    return Err({
      code: 'LLM_MALFORMED_OUTPUT',
      message: `DesignSpec validation failed: ${validation.errors.map(e => e.message).join('; ')}`,
      recoverable: true,
    });
  }

  // ── Phase B: Render to Penpot script + execute (with automatic chunking) ──

  const chunkedResult = renderToScriptChunks(designSpec, rendererTokens, catalogMap);
  if (chunkedResult.warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`        [penpot v2] Render warnings: ${chunkedResult.warnings.join('; ')}`);
  }

  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] Rendered: ${chunkedResult.totalChars} chars, ${chunkedResult.nodeIds.length} shapes, ${chunkedResult.chunks.length} chunk(s)`);
  // Log individual chunk sizes for debugging
  for (let ci = 0; ci < chunkedResult.chunks.length; ci++) {
    // eslint-disable-next-line no-console
    console.log(`        [penpot v2]   chunk ${ci + 1}: ${chunkedResult.chunks[ci].length} chars`);
  }

  const scriptT0 = Date.now();
  let execResult: Result<{ rootId: string; nodeIds: Record<string, string> }>;

  if (chunkedResult.chunks.length === 1) {
    // Single chunk — use the existing path
    // eslint-disable-next-line no-console
    console.log('        [penpot v2] Executing script...');
    execResult = await executeRenderedScript(chunkedResult.chunks[0], mcpClient);
  } else {
    // Multiple chunks — execute sequentially
    // eslint-disable-next-line no-console
    console.log(`        [penpot v2] Executing ${chunkedResult.chunks.length} chunks...`);
    execResult = await executeChunkedScript(chunkedResult, mcpClient);
  }
  const scriptMs = Date.now() - scriptT0;

  if (!execResult.ok) {
    return execResult as Result<never>;
  }

  const { rootId: rootShapeId, nodeIds: penpotNodeIds } = execResult.value;
  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] Script complete: ${Object.keys(penpotNodeIds).length} components (${scriptMs}ms)`);

  // ── Phase C: V2 correction loop ──

  let finalSpec = designSpec;
  const fixScripts: string[] = [];
  // Track the latest node IDs — Phase C may delete+recreate all shapes
  let activeNodeIds = penpotNodeIds;

  if (rootShapeId) {
    const correctionResult = await runV2CorrectionLoop(
      designSpec,
      rootShapeId,
      llm,
      mcpClient,
      evalProvider,
      rendererTokens,
      catalogMap,
      planningOutput,
      effectiveModel,
      systemPrompt,
      traceCollector,
    );
    finalSpec = correctionResult.finalSpec;
    fixScripts.push(...correctionResult.fixScripts);
    // Use updated node IDs from the last correction iteration (if any)
    if (correctionResult.updatedNodeIds) {
      activeNodeIds = correctionResult.updatedNodeIds;
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('\n        [Phase C v2] Skipped — no root shape found for screenshot');
  }

  // ── Phase D: Capture design snapshot ──

  const snapshotData = await captureDesignSnapshot({
    tool: 'penpot',
    moduleId,
    projectRoot: process.cwd(),
    nodeIds: activeNodeIds,
    mcpClient,
    captureScreenshot: async (client, nodeId) => {
      const result = await exportShapeWithRetry(client, nodeId, { scale: 2 });
      if (!result.ok) return result;
      return { ok: true as const, value: { imageUrl: 'penpot://export', base64: result.value } };
    },
    extractProperties: async (client, nodeId) => {
      const result = await client.callTool('penpot', 'execute_code', {
        code: `const shape = penpot.currentPage?.getShapeById("${nodeId}"); return shape ? { name: shape.name, type: shape.type, x: shape.x, y: shape.y, width: shape.width, height: shape.height, fills: shape.fills, strokes: shape.strokes, opacity: shape.opacity } : null;`,
      });
      if (!result.ok) return result;
      const content = result.value as { content?: Array<{ text?: string }> };
      const text = Array.isArray(content.content) ? content.content.map(c => c.text ?? '').join('') : '';
      try {
        const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
        if (parsed.result) {
          return { ok: true as const, value: parsed.result };
        }
        return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Shape not found', recoverable: true } };
      } catch {
        return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Failed to parse shape properties', recoverable: true } };
      }
    },
  });

  // ── Save scripts + spec as artifacts ──

  const scriptDir = join(process.cwd(), PREVIEW_DIR_REL, moduleId, 'scripts');
  if (!existsSync(scriptDir)) {
    mkdirSync(scriptDir, { recursive: true });
  }

  // Save the DesignSpec JSON
  const specPath = join(scriptDir, 'designspec-v2.json');
  writeFileSync(specPath, JSON.stringify(finalSpec, null, 2));
  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] DesignSpec saved: ${specPath}`);

  // Save the rendered script
  const mainScriptPath = join(scriptDir, 'design.js');
  const allScripts = chunkedResult.chunks.join('\n\n// --- Next Chunk ---\n\n');
  writeFileSync(mainScriptPath, `// Penpot design script (v2 renderer) for module: ${moduleId}\n// Generated at: ${new Date().toISOString()}\n// Chunks: ${chunkedResult.chunks.length}\n\n${allScripts}\n`);
  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] Script saved: ${mainScriptPath}`);

  if (fixScripts.length > 0) {
    const fixesContent = fixScripts
      .map((code, i) => `// --- V2 Correction ${i + 1} ---\n${code}`)
      .join('\n\n');
    const fixScriptPath = join(scriptDir, 'fixes.js');
    writeFileSync(fixScriptPath, `// Penpot v2 correction scripts for module: ${moduleId}\n// ${fixScripts.length} correction(s)\n\n${fixesContent}\n`);
    // eslint-disable-next-line no-console
    console.log(`        [penpot v2] Correction scripts saved: ${fixScriptPath}`);
  }

  return Ok({
    penpotProjectId: `penpot-${moduleId}`,
    penpotPageId: `page-${moduleId}`,
    penpotNodeIds: activeNodeIds,
    moduleId,
    breakpoints: [String(designSpec.width)],
    script: chunkedResult.chunks.join('\n'),
    designSpec: finalSpec,
    ...(fixScripts.length > 0 ? { fixScripts } : {}),
    ...snapshotData,
  });
}
