/**
 * @module @agentforge/agents-ux/ux-design/penpot-script-executor
 *
 * Low-level Penpot script execution utilities used by both V1 and V2
 * design pipelines. Extracted from ux-penpot-design.ts for modularity.
 *
 * Contains:
 * - executeRenderedScript — execute a single script via MCP execute_code
 * - executeChunkedScript — execute a multi-chunk render result
 * - deleteRootShape — remove a root shape from the canvas
 * - extractDesignSpecFromToolCall — parse a DesignSpecV2 from LLM tool call
 * - exportShapeViaExecuteCode — export a shape as base64 PNG
 * - exportShapeWithRetry — export with retry logic
 */

import type { Result, MCPClient } from '@agentforge/core';
import { Ok, Err, logDefaults } from '@agentforge/core';
import type { DesignSpecV2, ChunkedRenderResult } from '@agentforge/designspec-renderer';

// ============================================================================
// Shape export utilities
// ============================================================================

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
export async function exportShapeViaExecuteCode(
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
export async function exportShapeWithRetry(
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
// Script execution
// ============================================================================

/**
 * Execute a Penpot script via MCP and parse the result.
 * Returns rootId and nodeIds on success.
 */
export async function executeRenderedScript(
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
export async function executeChunkedScript(
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
export async function deleteRootShape(mcpClient: MCPClient, rootShapeId: string): Promise<void> {
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
export function extractDesignSpecFromToolCall(
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

  const screenType = typeof args.screenType === 'string'
    ? args.screenType as DesignSpecV2['screenType']
    : undefined;

  return Ok({
    screen: String(args.screen),
    width: Number(args.width),
    nodes: args.nodes as Record<string, import('@agentforge/designspec-renderer').NodeSpec>,
    ...(screenType ? { screenType } : {}),
  });
}
