/**
 * @module generate-code
 *
 * Implementer Node 3: the tool-use loop. Calls the LLM with the
 * assembled prompt and tool definitions. Iterates until the LLM
 * stops calling tools (finishReason: 'stop') or max iterations hit.
 *
 * This is the first tool-loop node in the CHIP spine — Architect nodes
 * use structured output (responseSchema), not tool-use.
 */

import { debugLog } from '@agentforge/core';
import type { Message, ContentBlock, ToolCall, Prompt } from '@agentforge/providers';
import { IMPLEMENTER_TOOLS, executeImplementerTool } from '../../tools/index.js';
import type { ImplementerDeps, ImplementerNodeFn } from '../../deps.js';
import type { ImplementerStateType } from '../state.js';
import type { ImplementerArtifact } from '../../types.js';
import { createHash } from 'node:crypto';

const MAX_TOOL_ITERATIONS = 20;
const MODEL = 'claude-opus-4-6';
const MAX_TOKENS = 16384;

export function createGenerateCode(deps: ImplementerDeps): ImplementerNodeFn {
  return async (state: ImplementerStateType): Promise<Partial<ImplementerStateType>> => {
    debugLog('generateCode: ENTER');

    if (!state.implementerPrompt) {
      debugLog('generateCode: no prompt — skipping');
      return { errors: ['generateCode: no implementer prompt assembled'] };
    }

    const systemPrompt = buildSystemPrompt();
    const messages: Message[] = [buildInitialUserMessage(state)];
    const artifacts: ImplementerArtifact[] = [];
    const errors: string[] = [];
    let lastTypecheckPassed = true;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      debugLog(`generateCode: iteration ${iteration + 1}/${MAX_TOOL_ITERATIONS}`);

      const prompt: Prompt = {
        system: systemPrompt,
        messages,
        tools: [...IMPLEMENTER_TOOLS],
      };

      const result = await deps.provider.complete(prompt, {
        model: MODEL,
        maxTokens: MAX_TOKENS,
        temperature: 0,
        toolChoice: { type: 'auto' },
      });

      if (!result.ok) {
        const errMsg = `LLM error: ${result.error.code} — ${('message' in result.error ? result.error.message : '')}`;
        debugLog(`generateCode: ${errMsg}`);
        errors.push(errMsg);
        break;
      }

      const completion = result.value;
      debugLog(
        `generateCode: finish=${completion.finishReason}, ` +
        `toolCalls=${completion.toolCalls.length}, ` +
        `tokens=${completion.usage.inputTokens}+${completion.usage.outputTokens}`,
      );

      if (completion.finishReason === 'stop' && completion.toolCalls.length === 0) {
        appendAssistantMessage(messages, completion.content, []);
        debugLog('generateCode: LLM finished (stop, no tool calls)');
        break;
      }

      if (completion.toolCalls.length === 0) {
        appendAssistantMessage(messages, completion.content, []);
        debugLog('generateCode: no tool calls — breaking');
        break;
      }

      appendAssistantMessage(messages, completion.content, completion.toolCalls);

      const toolResults = await executeToolCalls(
        completion.toolCalls,
        deps.projectRoot,
        artifacts,
      );

      for (const tc of completion.toolCalls) {
        if (tc.name === 'run_typecheck') {
          const result = toolResults.find((r) => r.id === tc.id);
          lastTypecheckPassed = result ? result.content.startsWith('Typecheck passed') : false;
        }
      }

      appendToolResults(messages, toolResults);

      logInstrumentation(state, iteration, artifacts, lastTypecheckPassed);
    }

    debugLog(`generateCode: EXIT — ${artifacts.length} artifacts, ${errors.length} errors`);

    return { artifacts, errors };
  };
}

function buildSystemPrompt(): string {
  return [
    'You are an expert software engineer implementing a task from an architecture plan.',
    'Use the provided tools to read existing files, write code, and verify correctness.',
    'Work sequentially: read relevant files first, then write code, then run typecheck.',
    'When you are done implementing all required files, stop calling tools.',
  ].join('\n');
}

function buildInitialUserMessage(state: ImplementerStateType): Message {
  const parts: string[] = [state.implementerPrompt];

  if (state.designResult) {
    const nodeCount = Object.keys(state.designResult.nodes).length;
    parts.push(
      '',
      '## Generated Design Spec',
      `Width: ${state.designResult.width}px, Nodes: ${nodeCount}`,
      '',
      '```json',
      JSON.stringify(state.designResult, null, 2),
      '```',
    );
  }

  return { role: 'user', content: parts.join('\n') };
}

function appendAssistantMessage(
  messages: Message[],
  content: string,
  toolCalls: readonly ToolCall[],
): void {
  const blocks: ContentBlock[] = [];

  if (content) {
    blocks.push({ type: 'text', text: content });
  }

  for (const tc of toolCalls) {
    blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
  }

  messages.push({ role: 'assistant', content: blocks });
}

function appendToolResults(
  messages: Message[],
  results: ReadonlyArray<{ id: string; content: string }>,
): void {
  const blocks: ContentBlock[] = results.map((r) => ({
    type: 'tool_result' as const,
    tool_use_id: r.id,
    content: r.content,
  }));

  messages.push({ role: 'user', content: blocks });
}

async function executeToolCalls(
  toolCalls: readonly ToolCall[],
  projectRoot: string,
  artifacts: ImplementerArtifact[],
): Promise<ReadonlyArray<{ id: string; content: string }>> {
  const results: Array<{ id: string; content: string }> = [];

  for (const tc of toolCalls) {
    const output = await executeImplementerTool(tc.name, tc.args, projectRoot);

    if (tc.name === 'write_file' && !output.startsWith('Error')) {
      const filePath = String(tc.args.path ?? '');
      const contents = String(tc.args.contents ?? '');
      artifacts.push({
        path: filePath,
        action: 'created',
        contentHash: createHash('sha256').update(contents).digest('hex').slice(0, 16),
      });
    }

    if (tc.name === 'apply_patch' && !output.startsWith('Error')) {
      const filePath = String(tc.args.path ?? '');
      artifacts.push({
        path: filePath,
        action: 'modified',
        contentHash: createHash('sha256').update(output).digest('hex').slice(0, 16),
      });
    }

    results.push({ id: tc.id, content: output });
  }

  return results;
}

function logInstrumentation(
  state: ImplementerStateType,
  iteration: number,
  artifacts: readonly ImplementerArtifact[],
  compiles: boolean,
): void {
  const qualityProxy = { compiles, schemaValid: true };
  debugLog(
    `generateCode: instrumentation — ` +
    `taskId=${state.task?.id ?? '?'}, ` +
    `taskType=${state.metadata?.taskType ?? '?'}, ` +
    `sliceStrategy=${state.metadata?.sliceStrategy ?? '?'}, ` +
    `iteration=${iteration + 1}, ` +
    `artifacts=${artifacts.length}, ` +
    `qualityProxy=${JSON.stringify(qualityProxy)}`,
  );
}
