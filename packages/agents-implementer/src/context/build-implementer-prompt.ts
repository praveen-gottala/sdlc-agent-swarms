/**
 * @module @agentforge/agents-implementer/context/build-implementer-prompt
 *
 * Pure function that assembles the Implementer's system prompt from a TaskNode,
 * sliced ContractBundle, and optional design context. Applies ADR-057 routing:
 * NEW → no design spec; MODIFY → structure-only slice of existing design.
 *
 * Returns both the prompt string and metadata for observability (taskType,
 * sliceStrategy, designSpecIncluded).
 */

import type {
  ContractBundle,
  TaskNode,
  ImplementerContextMetadata,
  DesignSliceStrategy,
} from '@agentforge/core';
import { resolveDesignSliceStrategy } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';

export interface ImplementerPromptInput {
  readonly task: TaskNode;
  readonly contractBundle: Partial<ContractBundle>;
  readonly existingDesignSpecs?: Readonly<Record<string, DesignSpecV2>>;
  readonly projectRoot: string;
}

export interface ImplementerPromptResult {
  readonly prompt: string;
  readonly metadata: ImplementerContextMetadata;
}

/** Build the Implementer system prompt for a single task. */
export function buildImplementerPrompt(
  input: ImplementerPromptInput,
): ImplementerPromptResult {
  const { task, contractBundle, existingDesignSpecs } = input;

  const sliceStrategy: DesignSliceStrategy = resolveDesignSliceStrategy(task.mode);
  const designSpecIncluded = hasDesignContext(sliceStrategy, existingDesignSpecs);

  const sections: string[] = [];

  sections.push(buildTaskSection(task));
  sections.push(buildContractSection(contractBundle));

  if (designSpecIncluded && existingDesignSpecs) {
    sections.push(buildDesignContextSection(existingDesignSpecs));
  }

  sections.push(buildInstructionsSection(task));

  const prompt = sections.join('\n\n');

  const metadata: ImplementerContextMetadata = {
    taskId: task.id,
    taskType: task.mode,
    sliceStrategy,
    designSpecIncluded,
  };

  return { prompt, metadata };
}

function hasDesignContext(
  strategy: DesignSliceStrategy,
  specs?: Readonly<Record<string, DesignSpecV2>>,
): boolean {
  if (strategy === 'none') return false;
  if (!specs) return false;
  return Object.keys(specs).length > 0;
}

function buildTaskSection(task: TaskNode): string {
  const lines = [
    '## Task',
    '',
    `**ID:** ${task.id}`,
    `**Title:** ${task.title}`,
    `**Type:** ${task.type}`,
    `**Mode:** ${task.mode}`,
    '',
    task.description,
    '',
    '**Files to modify:**',
    ...task.filePaths.map((f) => `- ${f}`),
  ];

  if (task.acceptanceCriteriaIds.length > 0) {
    lines.push('', '**Acceptance criteria:**');
    lines.push(...task.acceptanceCriteriaIds.map((id) => `- ${id}`));
  }

  return lines.join('\n');
}

function buildContractSection(bundle: Partial<ContractBundle>): string {
  const lines = ['## Architecture Context'];

  if (bundle.architectureSpec) {
    const spec = bundle.architectureSpec;
    lines.push('', '### Stack');
    lines.push(`- Frontend: ${spec.stackConfig.frontend}`);
    lines.push(`- Backend: ${spec.stackConfig.backend}`);
    lines.push(`- Database: ${spec.stackConfig.database}`);
    lines.push(`- Styling: ${spec.stackConfig.styling}`);

    if (spec.implementationPatterns && spec.implementationPatterns.length > 0) {
      lines.push('', '### Implementation Patterns');
      for (const p of spec.implementationPatterns) {
        lines.push(`- **${p.title}:** ${p.rule}`);
      }
    }
  }

  if (bundle.dataModel) {
    lines.push('', '### Data Model');
    for (const entity of bundle.dataModel.entities) {
      const fieldNames = entity.fields.map((f) => f.name).join(', ');
      lines.push(`- **${entity.name}:** ${fieldNames}`);
    }
  }

  if (bundle.screenPlans && bundle.screenPlans.length > 0) {
    lines.push('', '### Screen Plans');
    for (const sp of bundle.screenPlans) {
      lines.push(`- **${sp.id}:** ${sp.route} (${sp.screenType})`);
    }
  }

  if (bundle.apiChangeSets && bundle.apiChangeSets.length > 0) {
    lines.push('', '### API Changes');
    for (const cs of bundle.apiChangeSets) {
      for (const add of cs.additions) {
        lines.push(`- ${add.method} ${add.path} — ${add.description}`);
      }
    }
  }

  return lines.join('\n');
}

function buildDesignContextSection(
  specs: Readonly<Record<string, DesignSpecV2>>,
): string {
  const lines = ['## Existing Design Context'];

  for (const [pageId, spec] of Object.entries(specs)) {
    const nodeCount = Object.keys(spec.nodes).length;
    lines.push('', `### Screen: ${pageId}`);
    lines.push(`Width: ${spec.width}px, Nodes: ${nodeCount}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(spec, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
}

function buildInstructionsSection(task: TaskNode): string {
  const lines = [
    '## Instructions',
    '',
    '- Write code sequentially, one file at a time.',
    '- Follow the implementation patterns above.',
    '- After writing each file, run typecheck to verify.',
  ];

  if (task.mode === 'MODIFY') {
    lines.push('- Preserve existing behavior — only modify what the task requires.');
    lines.push('- The design context above shows the current structure; align changes with it.');
  }

  if (task.mode === 'NEW') {
    lines.push('- Create files from scratch per the architecture spec.');
  }

  return lines.join('\n');
}
