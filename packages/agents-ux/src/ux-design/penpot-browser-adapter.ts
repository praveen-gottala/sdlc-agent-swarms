/**
 * @module @agentforge/agents-ux/ux-design/penpot-browser-adapter
 *
 * Implements CorrectionAdapter using Playwright for browser-based
 * screenshots and state inspection. The key improvement over the
 * export_shape approach: before generating fixes, reads actual shape
 * properties (colors, sizes, positions) via page.evaluate() and
 * includes them in the fixer prompt. The LLM sees both the screenshot
 * AND the real data, so fixes are precise rather than guessed from pixels.
 */

import type { Result, MCPClient } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { CorrectionAdapter, CorrectionFixResult } from './correction-loop.js';
import type { DesignIssue, CorrectionHistory, FixAttemptRecord } from './design-evaluator.js';
import { takeCanvasScreenshot, readShapeState, waitForCanvasRender } from './penpot-browser-actions.js';

// Playwright Page type — kept as any to avoid hard dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

/** LLM provider interface (minimal, matches ux-penpot-design.ts). */
interface LLMProvider {
  complete: (
    prompt: { system: string; messages: { role: 'user'; content: string }[] },
    opts: { model: string; maxTokens: number; temperature: number },
  ) => Promise<Result<{ content: string }>>;
}

/**
 * Create a CorrectionAdapter that uses Playwright for screenshots
 * and state inspection, and execute_code for applying fixes.
 *
 * @param page - Playwright Page in the Penpot editor
 * @param mcpClient - MCPClient for calling execute_code
 * @param llm - LLM provider for generating fix code
 * @param apiDocs - Penpot Plugin API documentation (from discoverPenpotAPI)
 */
export function createPenpotBrowserCorrectionAdapter(
  page: Page,
  mcpClient: MCPClient,
  llm: LLMProvider,
  apiDocs: string,
): CorrectionAdapter {
  return {
    async captureScreenshot(): Promise<Result<string>> {
      // Wait for canvas to settle
      await waitForCanvasRender(page, 3000);

      const result = await takeCanvasScreenshot(page);
      if (!result.ok) {
        return result as Result<never>;
      }
      return Ok(result.value.base64);
    },

    async executeFixes(
      issues: readonly DesignIssue[],
      screenshotBase64: string,
      correctionHistory: readonly CorrectionHistory[],
    ): Promise<Result<CorrectionFixResult>> {
      // Read actual shape state before generating fixes
      const stateResult = await readShapeState(page);
      const shapeStateJson = stateResult.ok && stateResult.value.shapes.length > 0
        ? JSON.stringify(stateResult.value.shapes, null, 2)
        : '(shape state unavailable — use screenshot for reference)';

      const issuesSummary = issues
        .map(i => `- [${i.severity}] ${i.component}: ${i.description} (fix: ${i.fix})`)
        .join('\n');

      const historyContext = correctionHistory.length > 0
        ? `\nPREVIOUS ATTEMPTS (avoid repeating failed approaches):\n${correctionHistory.map(h =>
            `  Iteration ${h.iteration}: score ${h.score}, fixes: ${h.fixAttempts.map(f => `${f.issueComponent}(${f.issueDescription}):${f.stepsSucceeded}/${f.stepsAttempted}`).join(', ')}`,
          ).join('\n')}\n`
        : '';

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

ACTUAL SHAPE STATE (use this to make precise fixes):
${shapeStateJson}

Return ONLY a JSON object: { "fixes": [{ "code": "...", "description": "..." }] }`,
        messages: [{
          role: 'user' as const,
          content: `Fix these design issues:\n${issuesSummary}\n${historyContext}\nGenerate Penpot Plugin API JavaScript code to fix each issue. Use the actual shape state above to write precise, targeted fixes.`,
        }],
      };

      const fixResult = await llm.complete(fixPrompt, {
        model: 'claude-sonnet-4',
        maxTokens: 8000,
        temperature: 0,
      });

      if (!fixResult.ok) {
        return Err({
          code: 'LLM_MALFORMED_OUTPUT' as const,
          message: `Fix generation failed: ${fixResult.error.message}`,
          recoverable: true,
        });
      }

      // Parse fix steps
      const fixOutput = (fixResult.value as { content: string }).content;
      let fixes: Array<{ code: string; description: string }> = [];
      try {
        const fenceMatch = /```json\s*\n?([\s\S]*?)```/.exec(fixOutput);
        const fixJson = fenceMatch ? fenceMatch[1].trim() : fixOutput.trim();
        const parsed = JSON.parse(fixJson) as { fixes?: Array<{ code: string; description: string }> };
        fixes = parsed.fixes ?? [];
      } catch {
        return Err({
          code: 'LLM_MALFORMED_OUTPUT' as const,
          message: 'Could not parse fix steps from LLM output',
          recoverable: true,
        });
      }

      // Execute fixes
      let fixedCount = 0;
      let failedCount = 0;
      const fixAttempts: FixAttemptRecord[] = [];

      for (const fix of fixes.slice(0, 5)) {
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
        const toolResult = await mcpClient.callTool('penpot', 'execute_code', { code: wrappedFix });

        let success = false;
        if (toolResult.ok) {
          const content = toolResult.value as { content?: Array<{ text?: string }> };
          const text = Array.isArray(content.content)
            ? content.content.map(c => c.text ?? '').join('')
            : '';
          try {
            const parsed = JSON.parse(text) as { result?: Record<string, unknown> };
            if (parsed.result && (parsed.result as Record<string, unknown>).__error) {
              // eslint-disable-next-line no-console
              console.warn(`        [fix] ${fix.description} → ERR: ${(parsed.result as Record<string, unknown>).message}`);
              failedCount++;
            } else {
              success = true;
              fixedCount++;
              // eslint-disable-next-line no-console
              console.log(`        [fix] ${fix.description} → OK`);
            }
          } catch {
            success = true;
            fixedCount++;
            // eslint-disable-next-line no-console
            console.log(`        [fix] ${fix.description} → OK`);
          }
        } else {
          // eslint-disable-next-line no-console
          console.warn(`        [fix] ${fix.description} → ERR: ${toolResult.error.message}`);
          failedCount++;
        }

        fixAttempts.push({
          issueComponent: fix.description,
          issueDescription: fix.description,
          stepsAttempted: 1,
          stepsSucceeded: success ? 1 : 0,
          stepsFailed: success ? 0 : 1,
          stepsSkipped: 0,
        });
      }

      return Ok({ fixed: fixedCount, failed: failedCount, fixAttempts });
    },
  };
}
