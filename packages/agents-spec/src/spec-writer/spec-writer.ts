/**
 * @module @agentforge/agents-spec/spec-writer
 *
 * Spec Writer agent: translates design artifacts into structured
 * technical specifications (YAML) using an LLM.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentContract,
  AgentContext,
  AgentWorkFn,
  Result,
  EventBus,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readSpecs,
  acquireLock,
  releaseLock,
  writeYaml,
  SPEC_SCHEMA_HEADERS,
} from '@agentforge/core';

// ============================================================================
// Types
// ============================================================================

/** Input for the spec writer agent. */
export interface SpecWriterInput {
  readonly designRef: string;
  readonly specRef: string;
  readonly figmaFileId?: string;
  readonly figmaNodeId?: string;
}

/** Output produced by the spec writer agent. */
export interface SpecWriterOutput {
  readonly filesWritten: readonly string[];
  readonly adrsProposed: readonly string[];
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the spec writer. */
export const SPEC_WRITER_CONTRACT: AgentContract = {
  role: 'spec_writer',
  description: 'Translates design artifacts into structured technical specifications',
  category: 'spec',
  provider: 'claude-opus-4',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 200000 },
  tools: ['figma.get_code'],
  permissions: ['read_spec', 'write_spec', 'read_design'],
  denied: [],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 100000, max_cost_per_task_usd: 5.0 },
  on_complete: 'SpecComplete',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'spec-writer-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Work function
// ============================================================================

/** Parse YAML sections from LLM output delimited by ```yaml blocks. */
const parseYamlSections = (
  output: string,
): { sections: Record<string, string>; adrs: string[] } => {
  const sections: Record<string, string> = {};
  const adrs: string[] = [];

  // Match ```yaml blocks with optional section headers
  const blockPattern = /###\s*(\w+)\s*\n```yaml\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(output)) !== null) {
    const sectionName = match[1].toLowerCase();
    const content = match[2].trim();
    if (sectionName === 'adrs' || sectionName === 'adr') {
      adrs.push(content);
    } else {
      sections[sectionName] = content;
    }
  }

  return { sections, adrs };
};

/**
 * The spec writer's work function.
 * Called by runAgent after governance clears.
 */
export const specWriterWork: AgentWorkFn<SpecWriterInput, SpecWriterOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { designRef, specRef, figmaFileId, figmaNodeId } = input;
  const filesWritten: string[] = [];
  const adrsProposed: string[] = [];

  // 1. Get design context via MCP (if Figma IDs present)
  let designContext = '';
  if (figmaFileId && figmaNodeId) {
    const mcpResult = await context.mcpClient.callTool('figma', 'get_code', {
      fileId: figmaFileId,
      nodeId: figmaNodeId,
    });
    if (mcpResult.ok) {
      designContext = JSON.stringify(mcpResult.value);
    }
  }

  // 2. Read existing specs
  const specDir = join(context.projectRoot, specRef);
  const existingSpecs = readSpecs(specDir, context.fs);
  const specsContent = existingSpecs.ok ? JSON.stringify(existingSpecs.value) : '{}';

  // 3. Build prompt
  const systemPrompt = loadSystemPrompt();
  const userMessage = [
    `Design reference: ${designRef}`,
    designContext ? `\nDesign context:\n${designContext}` : '',
    `\nExisting specs:\n${specsContent}`,
    learnings.length > 0 ? `\nLearnings from previous runs:\n${JSON.stringify(learnings)}` : '',
  ].join('\n');

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessage }],
  };

  // 4. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: SPEC_WRITER_CONTRACT.provider,
    maxTokens: 8000,
    temperature: 0,
  });
  if (!completionResult.ok) {
    return completionResult as Result<never>;
  }

  const llmOutput = (completionResult.value as { content: string }).content;

  // 5. Parse LLM output into structured sections
  const { sections, adrs } = parseYamlSections(llmOutput);

  // 6. Write each section with lock lifecycle
  const lockDir = join(context.projectRoot, '.agentforge/locks');
  const agentId = SPEC_WRITER_CONTRACT.role;

  for (const [name, content] of Object.entries(sections)) {
    const filePath = join(specDir, `${name}.yaml`);
    const isNewFile = !context.fs.exists(filePath);
    const header = isNewFile
      ? (SPEC_SCHEMA_HEADERS[name] ?? `# ${name}.yaml — created by spec_writer`)
      : undefined;

    const lockResult = acquireLock(filePath, agentId, lockDir, 60000, context.fs);
    if (!lockResult.ok) {
      return Err(lockResult.error);
    }

    context.eventBus.publish({
      type: 'SpecLockAcquired',
      filePath,
      agentId,
      source: `agent:${agentId}`,
      timestamp: Date.now(),
    });

    const writeResult = writeYaml(filePath, content, context.fs, header);
    if (!writeResult.ok) {
      releaseLock(filePath, agentId, lockDir, context.fs);
      return Err(writeResult.error);
    }

    releaseLock(filePath, agentId, lockDir, context.fs);
    context.eventBus.publish({
      type: 'SpecLockReleased',
      filePath,
      agentId,
      source: `agent:${agentId}`,
      timestamp: Date.now(),
    });

    filesWritten.push(filePath);
  }

  // 7. Write ADRs to project.yaml
  if (adrs.length > 0) {
    const projectYamlPath = join(specDir, 'project.yaml');
    const lockResult = acquireLock(projectYamlPath, agentId, lockDir, 60000, context.fs);
    if (!lockResult.ok) {
      return Err(lockResult.error);
    }

    for (const adrContent of adrs) {
      const adrTitle = adrContent.split('\n')[0] || 'Untitled ADR';
      adrsProposed.push(adrTitle);
    }

    const adrData = {
      adrs: adrs.map((content) => ({
        content,
        status: 'proposed' as const,
        decided_by: 'agent:spec_writer',
      })),
    };
    writeYaml(projectYamlPath, adrData, context.fs);
    releaseLock(projectYamlPath, agentId, lockDir, context.fs);
  }

  return Ok({ filesWritten, adrsProposed });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the spec writer agent through the full governance pipeline.
 */
export const executeSpecWriter = async (
  contract: AgentContract,
  context: AgentContext,
  input: SpecWriterInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'write_spec',
    input.specRef,
    `Generate specs from design ${input.designRef}`,
    specWriterWork,
  );
};

/**
 * Register the spec writer to respond to DesignPhaseComplete events.
 */
export const registerSpecWriter = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = SPEC_WRITER_CONTRACT,
): void => {
  eventBus.subscribe('DesignPhaseComplete', (event) => {
    const input: SpecWriterInput = {
      designRef: event.designRef,
      specRef: event.specRef,
    };
    void executeSpecWriter(contract, context, input);
  });
};
