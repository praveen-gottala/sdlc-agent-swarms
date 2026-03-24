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
} from '@agentforge/core';
import {
  Ok,
  Err,
} from '@agentforge/core';
import { evaluateDesign } from './design-evaluator.js';
import type { LLMProvider as EvalLLMProvider } from '@agentforge/providers';
import type { UXDashboardPlanningOutput } from '../ux-planning/ux-dashboard-planning.js';
import type { DesignSnapshotData } from '../types.js';
import { captureDesignSnapshot } from './capture-design-snapshot.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the Penpot design agent. */
export interface PenpotDesignInput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly planningOutput: UXDashboardPlanningOutput;
  readonly designSystemPrompt?: string;
  readonly description?: string;
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
}

// ============================================================================
// Contract
// ============================================================================

export const PENPOT_DESIGN_CONTRACT: AgentContract = {
  role: 'penpot_design',
  description: 'Creates Penpot designs from component specs using execute_code tool',
  category: 'design',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: true, max_context_tokens: 40000 },
  tools: ['penpot:execute_code', 'penpot:high_level_overview', 'penpot:penpot_api_info', 'penpot:export_shape'],
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

const loadPenpotSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-penpot-design-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// LLM interface
// ============================================================================

interface LLMProvider {
  complete: (prompt: { system: string; messages: { role: 'user'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<Result<{ content: string }>>;
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
    const script = String(parsed.script ?? '');
    const breakpoints = (parsed.breakpoints as string[]) ?? [];

    if (!script.trim()) {
      return Err({
        code: 'LLM_MALFORMED_OUTPUT',
        message: 'Empty script in Penpot design output',
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
// Fix step parser
// ============================================================================

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
): Promise<Result<PenpotDesignOutput>> {
  const { moduleId, planningOutput, designSystemPrompt, description } = input;
  const llm = provider as unknown as LLMProvider;

  // ── Dynamic API discovery ──

  const apiDocs = await discoverPenpotAPI(mcpClient);
  // eslint-disable-next-line no-console
  console.log(`        [penpot] Discovered ${apiDocs.length} chars of API docs from MCP server`);

  // ── Phase A: Generate design script via LLM ──

  const rawPrompt = loadPenpotSystemPrompt();
  const baseSystemPrompt = rawPrompt.replace('{{PENPOT_API_DOCS}}', apiDocs || '(API docs unavailable — use the rules above)');
  const systemPrompt = designSystemPrompt
    ? baseSystemPrompt + '\n\n# PROJECT DESIGN SYSTEM (use these colors, typography, and spacing — NOT the defaults above)\n\n' + designSystemPrompt
    : baseSystemPrompt;

  const userMessageParts = [
    `Module ID: ${moduleId}`,
  ];

  if (description) {
    userMessageParts.push(`\nApp Description: ${description}`);
    userMessageParts.push(`\nIMPORTANT: Design this screen for the app described above. Use the componentTree below to determine which components to create. Populate all text with realistic, domain-appropriate content that matches this app.`);
  }

  userMessageParts.push(`\nPlanning Output:\n${JSON.stringify(planningOutput, null, 2)}`);

  const userMessage = userMessageParts.join('\n');

  const completionResult = await llm.complete(
    {
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: userMessage }],
    },
    {
      model: PENPOT_DESIGN_CONTRACT.provider,
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
      // 1. Capture screenshot via export_shape
      const exportResult = await mcpClient.callTool('penpot', 'export_shape', {
        shapeId: rootShapeId,
        format: 'png',
      });

      if (!exportResult.ok) {
        // eslint-disable-next-line no-console
        console.warn(`        [correction ${correction + 1}] Screenshot failed: ${exportResult.error.message}`);
        break;
      }

      const exportContent = exportResult.value as { content?: Array<{ type?: string; data?: string; mimeType?: string }> };
      const imageBlock = Array.isArray(exportContent.content)
        ? exportContent.content.find(c => c.type === 'image')
        : undefined;

      if (!imageBlock?.data) {
        // eslint-disable-next-line no-console
        const blockTypes = Array.isArray(exportContent.content) ? exportContent.content.map(c => `${c.type}(${c.data ? 'has-data' : 'no-data'})`).join(', ') : 'not-array';
        // eslint-disable-next-line no-console
        console.warn(`        [correction ${correction + 1}] No image data in export response. Blocks: ${blockTypes}. Raw keys: ${Object.keys(exportResult.value as Record<string, unknown>).join(',')}`);
        break;
      }

      const screenshotBase64 = imageBlock.data;

      // 2. Evaluate design quality
      const evalProvider = provider as unknown as EvalLLMProvider;
      const evalResult = await evaluateDesign(
        screenshotBase64,
        JSON.stringify(planningOutput, null, 2),
        evalProvider,
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
- Use penpot.createText("content") — text content MUST be in constructor
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
        model: PENPOT_DESIGN_CONTRACT.provider,
        maxTokens: 8000,
        temperature: 0,
      });

      if (!fixResult.ok) {
        // eslint-disable-next-line no-console
        console.warn(`        [correction ${correction + 1}] Fix generation failed`);
        break;
      }

      // Parse fix steps
      const fixOutput = (fixResult.value as { content: string }).content;
      const parseFixResult = parsePenpotFixSteps(fixOutput);
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
      // Penpot uses export_shape tool for screenshots
      const result = await client.callTool('penpot', 'export_shape', {
        shapeId: nodeId,
        format: 'png',
        scale: 2,
      });
      if (!result.ok) return result;
      const data = result.value as { content?: Array<{ type?: string; data?: string }> };
      const imageBlock = Array.isArray(data.content)
        ? data.content.find(c => c.type === 'image')
        : undefined;
      if (!imageBlock?.data) {
        return { ok: false as const, error: { code: 'MCP_UNAVAILABLE' as const, message: 'No image data in export_shape response', recoverable: true } };
      }
      return { ok: true as const, value: { imageUrl: 'penpot://export', base64: imageBlock.data } };
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
  const scriptDir = join(process.cwd(), '.agentforge', 'previews', moduleId, 'scripts');
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
