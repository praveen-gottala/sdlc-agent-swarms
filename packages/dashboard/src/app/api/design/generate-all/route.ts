/**
 * @module design/generate-all
 *
 * Long-running: Research → Planning → Design for all pages. Dashboard's own
 * pipeline loop with DashboardSseSink and run tracking (M1 Phase 3, D6).
 *
 * Replaces the old CLI delegation approach (null sink, zero telemetry).
 */

import { NextResponse } from 'next/server';
import { join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { readYaml, createRealFs, loadProjectManifest, PREVIEW_DIR_REL, PIPELINE_ARTIFACTS } from '@agentforge/core';
import type { PageEntry, LLMProviderRef } from '@agentforge/core';
import { buildPipelineInput, runPagesWithChromePass } from '@agentforge/agents-ux';
import type { PenpotDesignOutput } from '@agentforge/agents-ux';
import { createDashboardPipelineContext } from '../../_lib/pipeline-context';
import { DashboardSseSink } from '../../_lib/dashboard-sink';
import { startRun, completeRun, failRun } from '../../_lib/run-manager';
import { NO_CLAUDE_AUTH_ERROR } from '../../_lib/llm-provider';
import { getActiveProjectRoot } from '../../_lib/project-reader';
import { resolveClaudeAuth, authResultToProviderConfig, createClaudeProvider } from '@agentforge/providers';

export const maxDuration = 800;

interface RawPagesFile {
  pages: PageEntry[];
}

export async function POST() {
  let projectRoot: string;
  try {
    projectRoot = getActiveProjectRoot();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  // Load pages.yaml
  const fs = createRealFs();
  const pagesResult = readYaml<RawPagesFile>(
    join(projectRoot, 'agentforge/spec/pages.yaml'),
    fs,
  );
  if (!pagesResult.ok) {
    return NextResponse.json({ error: 'No pages.yaml found. Run design:generate first.' }, { status: 400 });
  }
  const pages = pagesResult.value.pages ?? [];
  if (pages.length === 0) {
    return NextResponse.json({ error: 'pages.yaml has no pages' }, { status: 400 });
  }

  // Resolve auth
  const auth = resolveClaudeAuth();
  if (!auth) {
    return NextResponse.json({ error: NO_CLAUDE_AUTH_ERROR }, { status: 503 });
  }

  // Start run tracking
  const runResult = startRun('design-browser', { mode: 'all-pages', pageCount: pages.length });
  if (!runResult.ok) {
    return NextResponse.json(
      { error: runResult.error, activeRun: runResult.activeRun },
      { status: 409 },
    );
  }
  const runId = runResult.run.runId;

  // Project manifest for model resolution (ADR-033)
  const manifestResult = loadProjectManifest(projectRoot, fs);
  const manifest = manifestResult.ok ? manifestResult.value : undefined;

  const providerConfig = authResultToProviderConfig(auth);
  const providerFactory = (model: string): LLMProviderRef => {
    return createClaudeProvider(model, providerConfig) as unknown as LLMProviderRef;
  };

  try {
    const result = await runPagesWithChromePass({
      pages,
      projectRoot,
      buildInput: (pageId, chromePass) => {
        const taskId = `task_page_${pageId}_${Date.now()}`;
        const sink = new DashboardSseSink(runId, 'design-browser', taskId);
        const agentContext = createDashboardPipelineContext(taskId, projectRoot, providerFactory, manifest);

        return buildPipelineInput({
          pageId,
          taskId,
          projectRoot,
          telemetry: sink,
          agentContext,
          chromePass,
        });
      },
    });

    // Write design specs for successful pages
    for (const pageResult of result.pages) {
      if (pageResult.status === 'ok' && pageResult.state?.design?.spec) {
        const outputDir = join(projectRoot, PREVIEW_DIR_REL, pageResult.pageId, 'scripts');
        if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

        const designOutput: PenpotDesignOutput = {
          moduleId: pageResult.pageId,
          breakpoints: [],
          designSpec: pageResult.state.design.spec as unknown as import('@agentforge/designspec-renderer').DesignSpecV2,
        };
        writeFileSync(
          join(outputDir, PIPELINE_ARTIFACTS.penpotDesign),
          JSON.stringify(designOutput, null, 2),
        );
      }
    }

    const succeeded = result.pages.filter(r => r.status === 'ok').length;
    const failed = result.pages.filter(r => r.status === 'failed').length;

    completeRun(runId, { totalCostUsd: 0, tokensUsed: 0 });

    return NextResponse.json({
      ok: true,
      projectRoot,
      runId,
      summary: { total: pages.length, succeeded, failed },
      pages: result.pages.map(r => ({
        pageId: r.pageId,
        status: r.status,
        durationMs: r.durationMs,
        ...(r.error ? { error: r.error.message } : {}),
      })),
    });
  } catch (err) {
    failRun(runId, String(err));
    return NextResponse.json({ ok: false, error: String(err), runId }, { status: 500 });
  }
}
