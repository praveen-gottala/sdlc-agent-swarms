/**
 * @module @agentforge/cli/utils/pipeline-context
 *
 * Shared utilities for design pipeline CLI commands. Extracted to eliminate
 * duplication across design-page.ts, design-page-browser.ts, and design-page-all.ts.
 */

import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { MCPClient, PromptTrace, AgentContext } from '@agentforge/core';
import {
  Ok,
  Err,
  createEventBus,
  createRealFs,
  PREVIEW_DIR_REL,
  debugLog,
} from '@agentforge/core';

// ============================================================================
// Agent context factory
// ============================================================================

/**
 * Create a minimal AgentContext for pipeline stages.
 *
 * Research and planning agents don't use MCP, so `mcpClient` is optional.
 * Governance is bypassed (CLI handles approval via interactive prompts).
 */
export function createPipelineContext(
  taskId: string,
  mcpClient?: MCPClient,
  promptTraces?: PromptTrace[],
  baseDir?: string,
): AgentContext {
  if (!baseDir) {
    debugLog('createPipelineContext: baseDir not provided → default: process.cwd()');
  }
  return {
    taskId,
    projectRoot: baseDir ?? process.cwd(),
    eventBus: createEventBus(),
    fs: createRealFs(),
    mcpClient,
    runGovernance: async () => Ok({ status: 'proceed' as const }),
    resolveProvider: () => Err({ code: 'MCP_UNAVAILABLE' as const, message: 'not used', recoverable: false }),
    recordAudit: () => {},
    promptTraces,
  };
}

// ============================================================================
// Output directory helpers
// ============================================================================

/** Ensure the output directory for a module's pipeline artifacts exists. */
export function ensureOutputDir(moduleId: string, baseDir?: string): string {
  const dir = resolve(baseDir ?? process.cwd(), PREVIEW_DIR_REL, moduleId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ============================================================================
// Artifact I/O
// ============================================================================

/** Save a JSON artifact and return the file path. */
export function saveArtifact(dir: string, filename: string, data: unknown): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

/** Load a JSON artifact, or return null if it doesn't exist. */
export function loadArtifact<T>(dir: string, filename: string): T | null {
  const filePath = join(dir, filename);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

/** Save a text artifact (e.g. markdown prompt traces). */
export function saveTextArtifact(dir: string, filename: string, text: string): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, text);
  return filePath;
}

/** Format a prompt trace as a markdown document. */
export function formatPromptTrace(trace: PromptTrace): string {
  const lines = [
    `# Prompt: ${trace.stage}`,
    ``,
    `**Timestamp**: ${trace.timestamp}  `,
    `**Model**: ${trace.model}  `,
    `**Max Tokens**: ${trace.maxTokens}`,
  ];

  if (trace.latencyMs !== undefined) {
    lines.push(`**Latency**: ${(trace.latencyMs / 1000).toFixed(1)}s`);
  }
  if (trace.finishReason) {
    lines.push(`**Finish Reason**: ${trace.finishReason}`);
  }
  if (trace.usage) {
    lines.push(`**Input Tokens**: ${trace.usage.inputTokens}  `);
    lines.push(`**Output Tokens**: ${trace.usage.outputTokens}`);
    if (trace.usage.cacheReadTokens) {
      lines.push(`**Cache Read Tokens**: ${trace.usage.cacheReadTokens}`);
    }
    if (trace.usage.cacheWriteTokens) {
      lines.push(`**Cache Write Tokens**: ${trace.usage.cacheWriteTokens}`);
    }
  }
  if (trace.cost) {
    lines.push(`**Cost**: $${trace.cost.totalCostUsd.toFixed(4)} (input: $${trace.cost.inputCostUsd.toFixed(4)}, output: $${trace.cost.outputCostUsd.toFixed(4)})`);
  }
  if (trace.hasVisionInput) {
    lines.push(`**Vision Input**: yes`);
  }

  lines.push(``, `---`, ``, `## System Prompt`, ``, trace.system, ``, `---`, ``, `## User Message`, ``, trace.userMessage);

  if (trace.responseContent) {
    lines.push(``, `---`, ``, `## LLM Response`, ``, trace.responseContent);
  }
  if (trace.responseToolCalls && trace.responseToolCalls.length > 0) {
    lines.push(``, `---`, ``, `## Tool Calls`, ``);
    for (const tc of trace.responseToolCalls) {
      lines.push(`### ${tc.name}`, ``, '```json', JSON.stringify(tc.args, null, 2), '```', ``);
    }
  }

  return lines.join('\n');
}

/** Derive a kebab-case module ID from a description string. */
export function deriveModuleId(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '');
}
