/**
 * @module @agentforge/agents-ux/design-feedback-loop
 *
 * Interactive readline loop that keeps the design session alive after design
 * completes, allowing the user to review, provide feedback for iterative
 * changes, and explicitly approve before the connection closes.
 */

import { createInterface } from 'node:readline/promises';
import type { Result } from '@agentforge/core';
import type { DesignCollaborationSession } from './design-collaboration.js';
import type { UXDesignOutput } from '../types.js';
import type { DesignEvaluation } from './design-evaluator.js';

// ============================================================================
// Types
// ============================================================================

/** Callback for reviewing the current design via screenshot + evaluator. */
export interface ReviewCallback {
  (design: UXDesignOutput): Promise<Result<DesignEvaluation>>;
}

/** Callback for generating implementation code from the approved design. */
export interface ImplementCallback {
  (design: UXDesignOutput): Promise<Result<{ files: readonly { filePath: string; content: string }[]; writtenPaths: string[] }>>;
}

/** Options for the interactive feedback loop. */
export interface FeedbackLoopOptions {
  readonly session: DesignCollaborationSession;
  readonly initialDesign: UXDesignOutput;
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  /** If provided, enables automatic post-feedback review and the `review` command. */
  readonly reviewFn?: ReviewCallback;
  /** If provided, enables the `implement` command to generate code from the design. */
  readonly implementFn?: ImplementCallback;
  /** Name of the design tool (e.g. 'Penpot' or 'Figma'). */
  readonly designTool: string;
}

/** Result of the feedback loop. */
export interface FeedbackLoopResult {
  readonly approved: boolean;
  readonly finalDesign: UXDesignOutput;
  readonly changeCount: number;
  /** If the user ran `implement`, the paths of generated files. */
  readonly implementedFiles?: readonly string[];
}

// ============================================================================
// Constants
// ============================================================================

const HELP_TEXT = `
  Commands:
    approve, y       — Approve the design and exit
    quit, q          — Reject the design and exit
    review, r        — Capture screenshot and evaluate current design
    implement, impl  — Generate React + Tailwind code from the design
    help, h          — Show this help message
    <any text>       — Send as feedback to modify the design
`;

// ============================================================================
// Review helpers
// ============================================================================

/** Format a design evaluation for display. */
function formatEvaluation(evaluation: DesignEvaluation, output: NodeJS.WritableStream): void {
  const qualityLabel = evaluation.overallQuality === 'good' ? 'good'
    : evaluation.overallQuality === 'needs_fixes' ? 'needs fixes'
    : 'poor';

  output.write(`  [review] Score: ${evaluation.score}/100 (${qualityLabel})\n`);

  if (evaluation.issues.length === 0) {
    output.write('  [review] No issues found.\n');
    return;
  }

  for (const issue of evaluation.issues) {
    output.write(`    [${issue.severity}] ${issue.component} — ${issue.description}\n`);
  }
}

// ============================================================================
// Feedback loop
// ============================================================================

/**
 * Run an interactive feedback loop that keeps the session alive.
 *
 * - On TTY input: prompts the user for feedback or approval commands.
 * - On non-TTY input (piped/CI): auto-approves immediately.
 * - On EOF/SIGINT: treats as quit (unapproved).
 */
export async function runDesignFeedbackLoop(
  options: FeedbackLoopOptions,
): Promise<FeedbackLoopResult> {
  const { session, initialDesign, input, output, reviewFn, implementFn, designTool } = options;

  // Non-TTY (piped input / CI): auto-approve immediately
  if (!('isTTY' in input && (input as NodeJS.ReadStream).isTTY)) {
    return { approved: true, finalDesign: initialDesign, changeCount: 0, implementedFiles: undefined };
  }

  let currentDesign = initialDesign;
  let changeCount = 0;
  let implementedFiles: string[] | undefined;

  output.write('\n');
  output.write(`  Design complete. Review in ${designTool}, then:\n`);
  output.write('    approve/y  — accept    quit/q — reject    help/h — commands\n');
  output.write('    Or type feedback to modify the design.\n\n');

  const rl = createInterface({
    input: input as NodeJS.ReadableStream,
    output: output as NodeJS.WritableStream,
    terminal: true,
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();

      if (trimmed === '') continue;

      const lower = trimmed.toLowerCase();

      if (lower === 'approve' || lower === 'y') {
        output.write('  Design approved.\n');
        return { approved: true, finalDesign: currentDesign, changeCount };
      }

      if (lower === 'quit' || lower === 'q') {
        output.write('  Design rejected.\n');
        return { approved: false, finalDesign: currentDesign, changeCount };
      }

      if (lower === 'help' || lower === 'h') {
        output.write(HELP_TEXT);
        continue;
      }

      if (lower === 'review' || lower === 'r') {
        if (!reviewFn) {
          output.write('  [review] Unavailable — set AGENTFORGE_MCP_FIGMA_TOKEN and AGENTFORGE_MCP_FIGMA_FILE_ID.\n');
        } else {
          output.write('  [review] Capturing screenshot and evaluating...\n');
          const evalResult = await reviewFn(currentDesign);
          if (evalResult.ok) {
            formatEvaluation(evalResult.value, output);
          } else {
            output.write(`  [review] Failed: ${evalResult.error.message}\n`);
          }
        }
        continue;
      }

      if (lower === 'implement' || lower === 'impl') {
        if (!implementFn) {
          output.write('  [implement] Unavailable — no implementation callback configured.\n');
        } else {
          output.write('  [implement] Generating React + Tailwind code from design...\n');
          const implResult = await implementFn(currentDesign);
          if (implResult.ok) {
            implementedFiles = [...implResult.value.writtenPaths];
            output.write(`  [implement] Generated ${implResult.value.files.length} file(s):\n`);
            for (const path of implResult.value.writtenPaths) {
              output.write(`    ${path}\n`);
            }
            output.write('  Design approved (via implement).\n');
            return { approved: true, finalDesign: currentDesign, changeCount, implementedFiles };
          } else {
            output.write(`  [implement] Failed: ${implResult.error.message}\n`);
          }
        }
        continue;
      }

      // Treat as feedback
      output.write(`  Applying feedback: "${trimmed}"...\n`);
      const result = await session.applyFeedback(trimmed);

      if (result.ok) {
        currentDesign = result.value;
        changeCount++;
        output.write(`  Feedback applied (${changeCount} change(s) so far).\n`);

        // Auto-review after agent changes (read-only, never auto-fixes)
        if (reviewFn) {
          output.write('  [review] Evaluating changes...\n');
          const evalResult = await reviewFn(currentDesign);
          if (evalResult.ok) {
            formatEvaluation(evalResult.value, output);
          } else {
            output.write(`  [review] Evaluation skipped: ${evalResult.error.message}\n`);
          }
        }
      } else {
        output.write(`  Feedback failed: ${result.error.message}\n`);
      }
    }
  } finally {
    rl.close();
  }

  // EOF reached — treat as quit
  return { approved: false, finalDesign: currentDesign, changeCount };
}
