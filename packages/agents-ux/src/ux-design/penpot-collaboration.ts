/**
 * @module @agentforge/agents-ux/ux-design/penpot-collaboration
 *
 * Penpot collaboration session — adapter that implements
 * DesignCollaborationSession for Penpot, enabling reuse of the
 * shared `runDesignFeedbackLoop()` interactive loop.
 *
 * Maps Penpot-specific fields (penpotProjectId, penpotNodeIds, etc.)
 * to Figma field names internally so the feedback loop types remain unchanged.
 */

import type { Result, MCPClient } from '@agentforge/core';
import { Ok, Err, DEFAULT_MODEL } from '@agentforge/core';
import type { DesignCollaborationSession, DesignChangeRecord, DesignSystemContext } from './design-collaboration.js';
import type { UXDesignOutput } from './ux-design.js';
import type { PenpotDesignOutput } from './ux-penpot-design.js';
import type { DesignEvaluation } from './design-evaluator.js';
import { evaluateDesign } from './design-evaluator.js';
import type { ReviewCallback } from './design-feedback-loop.js';

// ============================================================================
// Types
// ============================================================================

/** LLM provider interface for generating fix code. */
interface LLMProvider {
  complete: (prompt: { system: string; messages: { role: 'user' | 'assistant'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<Result<{ content: string }>>;
}

// ============================================================================
// Penpot → Figma mapping
// ============================================================================

/**
 * Map a PenpotDesignOutput to UXDesignOutput shape.
 * The feedback loop operates on `figmaNodeIds`/`figmaFileId`/`figmaPageId`;
 * this adapter maps Penpot fields to those names.
 */
export function mapPenpotToDesignOutput(penpot: PenpotDesignOutput): UXDesignOutput {
  return {
    figmaFileId: penpot.penpotProjectId,
    figmaPageId: penpot.penpotPageId,
    figmaNodeIds: penpot.penpotNodeIds as Record<string, string>,
    moduleId: penpot.moduleId,
    breakpoints: penpot.breakpoints,
    screenshotPath: penpot.screenshotPath,
    componentSnapshots: penpot.componentSnapshots,
  };
}

// ============================================================================
// Session factory
// ============================================================================

/**
 * Create a DesignCollaborationSession backed by Penpot.
 *
 * Feedback is applied by generating a JS fix script via LLM and
 * executing it through the Penpot MCP `execute_code` tool.
 */
export function createPenpotCollaborationSession(
  mcpClient: MCPClient,
  provider: LLMProvider,
  penpotDesign: PenpotDesignOutput,
  designSystemCtx: DesignSystemContext,
  apiDocs: string,
): DesignCollaborationSession {
  let currentDesign = mapPenpotToDesignOutput(penpotDesign);
  const changeHistory: DesignChangeRecord[] = [];

  return {
    startWatching(): void {
      // No-op for Penpot — no polling mechanism
    },

    stopWatching(): void {
      // No-op for Penpot
    },

    async applyFeedback(feedback: string): Promise<Result<UXDesignOutput>> {
      // Build system prompt for generating fix code
      const systemPrompt = `You are a Penpot design modification assistant. Given feedback, generate JavaScript code to modify the design using the Penpot Plugin API.

PENPOT PLUGIN API REFERENCE:
${apiDocs || '(unavailable)'}

DESIGN SYSTEM CONTEXT:
${designSystemCtx.designSystemPrompt}

CRITICAL RULES:
- Use penpot.createBoard() for containers — NOT createFrame (does not exist)
- Use penpot.createText("content") — text content MUST be in constructor. NEVER pass empty string "" (returns undefined). Use a space " " for empty/placeholder text.
- Use shape.resize(w, h) — width/height are READ-ONLY
- Fills/strokes replace entire array: shape.fills = [{ fillColor: '#HEX', fillOpacity: 1 }]
- NEVER use: createFrame, shape.width=, shape.height=, shape.text=

FINDING SHAPES (findByName is auto-injected — just call it):
- \`const shape = findByName(penpot.currentPage.root, 'ShapeName');\`
- \`if (!shape) return { skipped: true, reason: 'shape not found' };\`

Return ONLY a JSON object: { "code": "..." }`;

      const nodeIdsDesc = Object.entries(currentDesign.figmaNodeIds)
        .map(([name, id]) => `  ${name}: ${id}`)
        .join('\n');

      const completionResult = await provider.complete(
        {
          system: systemPrompt,
          messages: [{
            role: 'user' as const,
            content: `Current node IDs:\n${nodeIdsDesc}\n\nFeedback:\n${feedback}\n\nGenerate Penpot Plugin API JavaScript code to apply this feedback.`,
          }],
        },
        { model: DEFAULT_MODEL, maxTokens: 8000, temperature: 0 },
      );

      if (!completionResult.ok) {
        return Err({
          code: 'LLM_API_ERROR' as const,
          message: 'Failed to generate Penpot feedback modifications',
          recoverable: true,
        });
      }

      // Parse the fix code from LLM output
      const llmOutput = (completionResult.value as { content: string }).content;
      let fixCode: string;
      try {
        const fenceMatch = /```json\s*\n?([\s\S]*?)```/.exec(llmOutput);
        const jsonStr = fenceMatch ? fenceMatch[1].trim() : llmOutput.trim();
        const parsed = JSON.parse(jsonStr) as { code?: string };
        fixCode = parsed.code ?? '';
      } catch {
        // Try extracting code directly from a JS fence
        const jsFence = /```(?:javascript|js)\s*\n?([\s\S]*?)```/.exec(llmOutput);
        if (jsFence) {
          fixCode = jsFence[1].trim();
        } else {
          return Err({
            code: 'LLM_MALFORMED_OUTPUT' as const,
            message: 'Could not parse fix code from LLM output',
            recoverable: true,
          });
        }
      }

      if (!fixCode.trim()) {
        return Err({
          code: 'LLM_MALFORMED_OUTPUT' as const,
          message: 'Empty fix code generated',
          recoverable: true,
        });
      }

      // Execute the fix via Penpot MCP
      const wrappedFix = `
function findByName(parent, name) {
  for (const c of parent.children || []) {
    if (c.name === name) return c;
    const found = findByName(c, name);
    if (found) return found;
  }
  return null;
}
try {
${fixCode}
} catch (e) {
  return { __error: true, message: e.message || String(e) };
}
`;

      const toolResult = await mcpClient.callTool('penpot', 'execute_code', { code: wrappedFix });

      if (!toolResult.ok) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Penpot fix execution failed: ${toolResult.error.message}`,
          recoverable: true,
        });
      }

      // Check for script-level errors
      const content = toolResult.value as { content?: Array<{ text?: string }> };
      const text = Array.isArray(content.content)
        ? content.content.map(c => c.text ?? '').join('')
        : '';

      try {
        const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
        if (parsed.result?.__error) {
          return Err({
            code: 'LLM_MALFORMED_OUTPUT' as const,
            message: `Penpot fix script error: ${String(parsed.result.message ?? 'unknown')}`,
            recoverable: true,
          });
        }

        // Extract any new node IDs
        const nodeIds = parsed.result?.nodeIds as Record<string, string> | undefined;
        if (nodeIds) {
          const updatedNodeIds = { ...currentDesign.figmaNodeIds, ...nodeIds };
          for (const [key, val] of Object.entries(nodeIds)) {
            changeHistory.push({
              nodeId: val,
              field: 'penpotNodeId',
              previousValue: currentDesign.figmaNodeIds[key] ?? null,
              newValue: val,
              changedAt: Date.now(),
            });
          }
          currentDesign = { ...currentDesign, figmaNodeIds: updatedNodeIds };
        }
      } catch {
        // Non-JSON response is OK — the fix code may not return structured data
      }

      // Record the feedback as a change
      changeHistory.push({
        nodeId: 'feedback',
        field: 'feedback',
        previousValue: null,
        newValue: feedback,
        changedAt: Date.now(),
      });

      return Ok(currentDesign);
    },

    getChangeHistory(): readonly DesignChangeRecord[] {
      return [...changeHistory];
    },
  };
}

// ============================================================================
// Review callback factory
// ============================================================================

/**
 * Create a ReviewCallback for Penpot that captures a screenshot via
 * `export_shape` and evaluates it against the planning spec.
 */
export function createPenpotReviewCallback(
  provider: LLMProvider,
  planningSpec: string,
  mcpClient: MCPClient,
  rootShapeId: string,
): ReviewCallback {
  return async (design: UXDesignOutput): Promise<Result<DesignEvaluation>> => {
    // Use provided rootShapeId, or fall back to first node ID
    const shapeId = rootShapeId || Object.values(design.figmaNodeIds)[0];
    if (!shapeId) {
      return Err({
        code: 'INVALID_STATE' as const,
        message: 'No Penpot shapes to review',
        recoverable: false,
      });
    }

    // Capture screenshot via export_shape
    const exportResult = await mcpClient.callTool('penpot', 'export_shape', {
      shapeId,
      format: 'png',
    });

    if (!exportResult.ok) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Screenshot failed: ${exportResult.error.message}`,
        recoverable: true,
      });
    }

    const exportContent = exportResult.value as { content?: Array<{ type?: string; data?: string }> };
    const imageBlock = Array.isArray(exportContent.content)
      ? exportContent.content.find(c => c.type === 'image')
      : undefined;

    if (!imageBlock?.data) {
      return Err({
        code: 'INVALID_STATE' as const,
        message: 'No image data in export_shape response',
        recoverable: true,
      });
    }

    return evaluateDesign(
      imageBlock.data,
      planningSpec,
      provider as Parameters<typeof evaluateDesign>[2],
    );
  };
}
