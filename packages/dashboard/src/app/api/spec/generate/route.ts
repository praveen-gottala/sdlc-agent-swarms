import { NextResponse } from 'next/server';
import {
  readYamlFile,
  readTextFile,
  getActiveProjectRoot,
} from '../../_lib/project-reader';
import { startRun, updateRunStatus, completeRun, failRun } from '../../_lib/run-manager';
import { emitStageEvent } from '../../_lib/event-writer';
import { getClaudeProvider, NO_CLAUDE_AUTH_ERROR } from '../../_lib/llm-provider';
import { debugLog } from '@agentforge/core';
import type { DesignTokensSpec, BrandSpec } from '@agentforge/core';
import { generateAppSpec } from '@agentforge/agents-ux';

export interface LogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

/**
 * POST /api/spec/generate
 * Generates pages.yaml, models.yaml, api.yaml from project context using LLM.
 */
export async function POST() {
  const logs: LogEntry[] = [];
  const log = (level: LogEntry['level'], message: string) => {
    logs.push({ ts: Date.now(), level, message });
  };

  const claude = getClaudeProvider();
  if (!claude) {
    log('error', NO_CLAUDE_AUTH_ERROR);
    return NextResponse.json(
      { error: NO_CLAUDE_AUTH_ERROR, logs },
      { status: 503 },
    );
  }
  log('info', `Claude auth resolved (method: ${claude.authMethod})`);

  // Resolve active project
  let projectRoot: string;
  try {
    projectRoot = getActiveProjectRoot();
    log('info', `Active project root: ${projectRoot}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', `Failed to resolve active project: ${message}`);
    return NextResponse.json({ error: message, logs }, { status: 500 });
  }

  // Create a run
  const runResult = startRun('design-generate');
  if (!runResult.ok) {
    log('error', `Cannot start run: ${runResult.error}`);
    return NextResponse.json(
      { error: runResult.error, activeRun: runResult.activeRun, logs },
      { status: 409 },
    );
  }

  const { run } = runResult;
  const runId = run.runId;
  log('info', `Run started: ${runId}`);

  // Start the run
  updateRunStatus(runId, {
    status: 'running',
    stage: 'Reading project context',
    progress: { current: 1, total: 3, label: 'Reading context' },
  });

  emitStageEvent(runId, 'design-generate', 'Reading context', 0, 3, 'started');

  try {
    // Read project context — log each file
    const projectConfig = readYamlFile<Record<string, unknown>>('agentforge.yaml');
    if (projectConfig) {
      const projName = (projectConfig as { project?: { name?: string } }).project?.name;
      log('info', `agentforge.yaml: loaded (project: "${projName ?? 'unknown'}")`);
    } else {
      log('warn', 'agentforge.yaml: not found — LLM will have no project context');
    }

    const prdContent = readTextFile('docs/prd.md');
    if (prdContent) {
      log('info', `docs/prd.md: loaded (${prdContent.length} chars)`);
    } else {
      log('warn', 'docs/prd.md: not found — LLM will generate without PRD');
    }

    const designTokens = readYamlFile<Record<string, unknown>>('agentforge/spec/design-tokens.yaml');
    if (designTokens) {
      log('info', 'agentforge/spec/design-tokens.yaml: loaded');
    } else {
      log('warn', 'agentforge/spec/design-tokens.yaml: not found');
    }

    const brandSpec = readYamlFile<Record<string, unknown>>('agentforge/spec/brand.yaml');
    if (brandSpec) {
      log('info', 'agentforge/spec/brand.yaml: loaded');
    } else {
      log('warn', 'agentforge/spec/brand.yaml: not found');
    }

    emitStageEvent(runId, 'design-generate', 'Reading context', 0, 3, 'completed');

    // Generate app spec via shared function
    updateRunStatus(runId, {
      stage: 'Generating spec via LLM',
      progress: { current: 2, total: 3, label: 'LLM generation' },
      agentRole: 'spec_writer',
    });

    emitStageEvent(runId, 'design-generate', 'LLM generation', 1, 3, 'started', 'spec_writer');

    const projectName = (projectConfig as { project?: { name?: string } })?.project?.name;
    log('info', `Calling generateAppSpec (model: claude-sonnet-4-6, auth: ${claude.authMethod})`);

    const specResult = await generateAppSpec({
      appName: projectName ?? 'App',
      prdContent: prdContent ?? undefined,
      designTokens: (designTokens ?? undefined) as DesignTokensSpec | undefined,
      brandSpec: (brandSpec ?? undefined) as BrandSpec | undefined,
      projectConfig: projectConfig ?? undefined,
      provider: claude.provider,
      model: 'claude-sonnet-4-6',
      maxTokens: 16384,
      maxRetries: 0,
    });

    if (!specResult.ok) {
      log('error', `Spec generation failed: ${specResult.error.message}`);
      throw new Error(specResult.error.message);
    }

    const spec = specResult.value;
    debugLog(`spec-generate: generateAppSpec succeeded (auth=${claude.authMethod})`);
    log('info', `Parsed spec: ${spec.pages.length} pages, ${spec.models.length} models, ${spec.endpoints.length} endpoints`);

    emitStageEvent(runId, 'design-generate', 'LLM generation', 1, 3, 'completed', 'spec_writer');

    // Complete the run
    updateRunStatus(runId, {
      stage: 'Complete',
      progress: { current: 3, total: 3, label: 'Done' },
    });

    emitStageEvent(runId, 'design-generate', 'Complete', 2, 3, 'completed');
    completeRun(runId);

    log('info', 'Spec generation complete');
    return NextResponse.json({ runId, spec, logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', `Generation failed: ${message}`);
    emitStageEvent(runId, 'design-generate', 'Failed', 0, 3, 'failed');
    failRun(runId, message);
    return NextResponse.json({ error: message, runId, logs }, { status: 500 });
  }
}

