/**
 * @module @agentforge/agents-implementer/tools
 *
 * v1 Implementer tool set. Each tool is a ToolDefinition (LLM-facing JSON Schema)
 * paired with an executor function. The LLM calls tools via the tool-use loop
 * in generateCode; executeImplementerTool dispatches by name.
 *
 * Deferred to follow-up: retrieval (Layer 6), research subagent.
 */

import type { ToolDefinition } from '@agentforge/providers';
import { readFileDefinition, executeReadFile } from './read-file.js';
import { writeFileDefinition, executeWriteFile } from './write-file.js';
import { applyPatchDefinition, executeApplyPatch } from './apply-patch.js';
import { runTypecheckDefinition, executeRunTypecheck } from './run-typecheck.js';
import { runTestsDefinition, executeRunTests } from './run-tests.js';
import { runLintDefinition, executeRunLint } from './run-lint.js';
import {
  reportAssumptionViolationDefinition,
  executeReportAssumptionViolation,
} from './report-assumption-violation.js';

/** All tool definitions exposed to the LLM during code generation. */
export const IMPLEMENTER_TOOLS: readonly ToolDefinition[] = [
  readFileDefinition,
  writeFileDefinition,
  applyPatchDefinition,
  runTypecheckDefinition,
  runTestsDefinition,
  runLintDefinition,
  reportAssumptionViolationDefinition,
];

/** Dispatch a tool call by name. Returns the tool output as a string. */
export async function executeImplementerTool(
  name: string,
  args: Record<string, unknown>,
  projectRoot: string,
): Promise<string> {
  switch (name) {
    case 'read_file':
      return executeReadFile(args, projectRoot);
    case 'write_file':
      return executeWriteFile(args, projectRoot);
    case 'apply_patch':
      return executeApplyPatch(args, projectRoot);
    case 'run_typecheck':
      return executeRunTypecheck(args, projectRoot);
    case 'run_tests':
      return executeRunTests(args, projectRoot);
    case 'run_lint':
      return executeRunLint(args, projectRoot);
    case 'report_assumption_violation':
      return executeReportAssumptionViolation(args);
    default:
      return `Error: unknown tool "${name}"`;
  }
}
