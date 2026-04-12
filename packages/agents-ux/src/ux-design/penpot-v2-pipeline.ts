/**
 * @module @agentforge/agents-ux/ux-design/penpot-v2-pipeline
 *
 * V2 DesignSpec pipeline for Penpot design generation. Extracted from
 * ux-penpot-design.ts for modularity.
 *
 * Contains:
 * - reconcileStructure — structural diff between DesignSpec and Penpot shapes
 * - runV2CorrectionLoop — screenshot → evaluate → re-generate correction loop
 * - penpotDesignWorkV2 — main V2 orchestrator (browser-first or legacy)
 * - penpotDesignWorkV2Legacy — legacy Penpot-based correction path
 * - exportDesignSpecToPenpot — export a DesignSpec to Penpot via renderer
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Result,
  MCPClient,
  PromptTrace,
} from '@agentforge/core';
import {
  Ok,
  Err,
  recordPromptTrace,
  recordPromptTraceResponse,
  PREVIEW_DIR_REL,
} from '@agentforge/core';
import { evaluateDesign } from './design-evaluator.js';
import type { LLMProvider as EvalLLMProvider } from '@agentforge/providers';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';
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
import { runBrowserCorrectionPipeline } from './browser-correction-pipeline.js';
import { buildPromptFromTokens } from '../prompts/prompt-template-builder.js';
import type { PenpotDesignInput, PenpotDesignOutput } from './ux-penpot-design.js';
import { PENPOT_DESIGN_CONTRACT } from './ux-penpot-design.js';
import {
  executeRenderedScript,
  executeChunkedScript,
  deleteRootShape,
  extractDesignSpecFromToolCall,
  exportShapeWithRetry,
} from './penpot-script-executor.js';

// ============================================================================
// LLM interface (matches the one in ux-penpot-design.ts)
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
// V2 system prompt loader
// ============================================================================

let systemPromptV2Cache: string | undefined;

const loadPenpotV2SystemPrompt = (): string => {
  if (systemPromptV2Cache) return systemPromptV2Cache;
  // Compute the prompt path relative to this file's location
  // This file is at: packages/agents-ux/src/ux-design/penpot-v2-pipeline.ts
  // Prompt is at:   packages/agents-ux/src/prompts/ux-penpot-designspec-v2.md
  // At runtime (from dist/), the relative path is the same: ../prompts/
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-penpot-designspec-v2.md');
  systemPromptV2Cache = readFileSync(promptPath, 'utf-8');
  return systemPromptV2Cache;
};

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

// ============================================================================
// V2 correction loop
// ============================================================================

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

// ============================================================================
// Export DesignSpec to Penpot
// ============================================================================

/**
 * Export a DesignSpec to Penpot via renderToScriptChunks + execute_code.
 * This is the optional Penpot export step — called after user approves the browser-corrected design.
 */
export async function exportDesignSpecToPenpot(
  spec: DesignSpecV2,
  rendererTokens: RendererTokens,
  catalogMap: CatalogMap,
  mcpClient: MCPClient,
): Promise<Result<{ rootId: string; nodeIds: Record<string, string> }>> {
  const chunkedResult = renderToScriptChunks(spec, rendererTokens, catalogMap);
  if (chunkedResult.warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`        [penpot export] Render warnings: ${chunkedResult.warnings.join('; ')}`);
  }

  // eslint-disable-next-line no-console
  console.log(`        [penpot export] Rendered: ${chunkedResult.totalChars} chars, ${chunkedResult.nodeIds.length} shapes, ${chunkedResult.chunks.length} chunk(s)`);

  let execResult: Result<{ rootId: string; nodeIds: Record<string, string> }>;

  if (chunkedResult.chunks.length === 1) {
    // eslint-disable-next-line no-console
    console.log('        [penpot export] Executing script...');
    execResult = await executeRenderedScript(chunkedResult.chunks[0], mcpClient);
  } else {
    // eslint-disable-next-line no-console
    console.log(`        [penpot export] Executing ${chunkedResult.chunks.length} chunks...`);
    execResult = await executeChunkedScript(chunkedResult, mcpClient);
  }

  if (execResult.ok) {
    // eslint-disable-next-line no-console
    console.log(`        [penpot export] Complete: ${Object.keys(execResult.value.nodeIds).length} shapes created`);
  }

  return execResult;
}

// ============================================================================
// V2 pipeline orchestrators
// ============================================================================

/**
 * V2 DesignSpec pipeline: LLM produces JSON spec → renderer generates Penpot script.
 *
 * This path replaces the v1 LLM-generates-JS-directly approach.
 * The LLM outputs ~177 lines of JSON (via submit_design tool call) instead of
 * ~660 lines of Penpot JavaScript. A deterministic renderer converts the spec
 * to correct Penpot API calls, eliminating API bugs.
 */
export async function penpotDesignWorkV2(
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

  // ── Phase B: Correction pipeline (browser-first or legacy Penpot) ──

  if (input.legacyPenpotCorrection) {
    // ── Legacy path: Penpot-based correction ──
    return penpotDesignWorkV2Legacy(
      designSpec, rendererTokens, catalogMap, moduleId, planningOutput,
      effectiveModel, systemPrompt, llm, mcpClient, evalProvider, traceCollector,
    );
  }

  // ── Default: Browser-based correction pipeline ──
  // eslint-disable-next-line no-console
  console.log('        [penpot v2] Running browser-based correction pipeline...');

  const browserCorrectionResult = await runBrowserCorrectionPipeline(
    designSpec,
    rendererTokens,
    catalogMap,
    evalProvider,
    {
      maxCorrections: input.browserCorrectionOptions?.maxCorrections ?? 3,
      qualityThreshold: input.browserCorrectionOptions?.qualityThreshold ?? 80,
      interactive: input.browserCorrectionOptions?.interactive,
      mechanicalFixes: input.browserCorrectionOptions?.mechanicalFixes,
      width: input.browserCorrectionOptions?.width ?? viewportWidth,
      outputDir: input.browserCorrectionOptions?.outputDir,
    },
  );

  const finalSpec = browserCorrectionResult.spec;

  // ── Save corrected spec + screenshot as artifacts ──

  const scriptDir = join(process.cwd(), PREVIEW_DIR_REL, moduleId, 'scripts');
  if (!existsSync(scriptDir)) {
    mkdirSync(scriptDir, { recursive: true });
  }

  const specPath = join(scriptDir, 'designspec-v2.json');
  writeFileSync(specPath, JSON.stringify(finalSpec, null, 2));
  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] Corrected DesignSpec saved: ${specPath}`);

  const screenshotPath = join(scriptDir, 'browser-screenshot.png');
  writeFileSync(screenshotPath, browserCorrectionResult.screenshot);
  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] Browser screenshot saved: ${screenshotPath}`);

  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] Browser correction: score=${browserCorrectionResult.finalScore}, iterations=${browserCorrectionResult.iterations}, threshold=${browserCorrectionResult.thresholdMet ? 'met' : 'not met'}`);

  return Ok({
    moduleId,
    breakpoints: [String(designSpec.width)],
    designSpec: finalSpec,
    browserCorrectionResult,
    screenshotPath,
  });
}

/**
 * Legacy V2 pipeline: renders to Penpot script + executes + runs Penpot-based correction loop.
 * Used when `--legacy-correction` flag is set.
 */
export async function penpotDesignWorkV2Legacy(
  designSpec: DesignSpecV2,
  rendererTokens: RendererTokens,
  catalogMap: CatalogMap,
  moduleId: string,
  planningOutput: UXPlanningOutput,
  effectiveModel: string,
  systemPrompt: string,
  llm: LLMProvider,
  mcpClient: MCPClient,
  evalProvider: EvalLLMProvider,
  traceCollector?: { promptTraces?: PromptTrace[] },
): Promise<Result<PenpotDesignOutput>> {
  const chunkedResult = renderToScriptChunks(designSpec, rendererTokens, catalogMap);
  if (chunkedResult.warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`        [penpot v2] Render warnings: ${chunkedResult.warnings.join('; ')}`);
  }

  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] Rendered: ${chunkedResult.totalChars} chars, ${chunkedResult.nodeIds.length} shapes, ${chunkedResult.chunks.length} chunk(s)`);
  for (let ci = 0; ci < chunkedResult.chunks.length; ci++) {
    // eslint-disable-next-line no-console
    console.log(`        [penpot v2]   chunk ${ci + 1}: ${chunkedResult.chunks[ci].length} chars`);
  }

  const scriptT0 = Date.now();
  let execResult: Result<{ rootId: string; nodeIds: Record<string, string> }>;

  if (chunkedResult.chunks.length === 1) {
    // eslint-disable-next-line no-console
    console.log('        [penpot v2] Executing script...');
    execResult = await executeRenderedScript(chunkedResult.chunks[0], mcpClient);
  } else {
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

  let finalSpec = designSpec;
  const fixScripts: string[] = [];
  let activeNodeIds = penpotNodeIds;

  if (rootShapeId) {
    const correctionResult = await runV2CorrectionLoop(
      designSpec, rootShapeId, llm, mcpClient, evalProvider,
      rendererTokens, catalogMap, planningOutput, effectiveModel,
      systemPrompt, traceCollector,
    );
    finalSpec = correctionResult.finalSpec;
    fixScripts.push(...correctionResult.fixScripts);
    if (correctionResult.updatedNodeIds) {
      activeNodeIds = correctionResult.updatedNodeIds;
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('\n        [Phase C v2] Skipped — no root shape found for screenshot');
  }

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

  const scriptDir = join(process.cwd(), PREVIEW_DIR_REL, moduleId, 'scripts');
  if (!existsSync(scriptDir)) {
    mkdirSync(scriptDir, { recursive: true });
  }

  const specPath = join(scriptDir, 'designspec-v2.json');
  writeFileSync(specPath, JSON.stringify(finalSpec, null, 2));
  // eslint-disable-next-line no-console
  console.log(`        [penpot v2] DesignSpec saved: ${specPath}`);

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
