import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  readYamlFile,
  writeYamlFile,
  readTextFile,
  getActiveProjectRoot,
} from '../../../../_lib/project-reader';
import { getClaudeProvider, NO_CLAUDE_AUTH_ERROR } from '../../../../_lib/llm-provider';
import { BrowserFeedbackAdapter } from '@agentforge/agents-ux';
import type { LLMProviderRef } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';

interface PageEntry {
  id: string;
  name: string;
  description: string;
  route: string;
  status: string;
  designStatus?: string;
  correctionIteration?: number;
  components?: string[];
}

interface PagesFile {
  pages: PageEntry[];
}

interface FeedbackTag {
  nodeId: string;
  feedback: string;
}

const MAX_CORRECTION_ITERATIONS = 3;

/**
 * POST /api/pages/[pageId]/design/correct
 *
 * Accepts user feedback tags and applies LLM-driven corrections via
 * BrowserFeedbackAdapter. Tags are converted to a feedback message,
 * the adapter produces a structured patch, and the patch is applied
 * to the existing design spec.
 *
 * Body: { tags: [{ nodeId: string, feedback: string }] }
 * Returns: { iteration, patchesApplied, reasoning }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;

  let body: { tags?: FeedbackTag[] };
  try {
    body = (await request.json()) as { tags?: FeedbackTag[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tags = body.tags;
  if (!Array.isArray(tags) || tags.length === 0) {
    return NextResponse.json(
      { error: 'Body must include a non-empty "tags" array with { nodeId, feedback } objects' },
      { status: 400 },
    );
  }

  for (const tag of tags) {
    if (typeof tag.nodeId !== 'string' || typeof tag.feedback !== 'string') {
      return NextResponse.json(
        { error: 'Each tag must have "nodeId" (string) and "feedback" (string)' },
        { status: 400 },
      );
    }
  }

  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];
  const idx = pages.findIndex((p) => p.id === pageId);

  if (idx === -1) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  const page = pages[idx];

  const currentIteration = page.correctionIteration ?? 0;
  if (currentIteration >= MAX_CORRECTION_ITERATIONS) {
    return NextResponse.json(
      {
        error: `Maximum correction iterations reached (${MAX_CORRECTION_ITERATIONS}). Approve the design or regenerate.`,
        iteration: currentIteration,
      },
      { status: 409 },
    );
  }

  const specContent = readTextFile(`agentforge/designs/${pageId}.json`);
  if (specContent === null) {
    return NextResponse.json(
      { error: 'Design spec not found. Generate a design first.' },
      { status: 404 },
    );
  }

  let spec: DesignSpecV2;
  try {
    spec = JSON.parse(specContent) as DesignSpecV2;
  } catch {
    return NextResponse.json(
      { error: 'Design spec is not valid JSON' },
      { status: 500 },
    );
  }

  const claude = getClaudeProvider();
  if (!claude) {
    return NextResponse.json({ error: NO_CLAUDE_AUTH_ERROR }, { status: 503 });
  }

  pages[idx].designStatus = 'correction';
  writeYamlFile('agentforge/spec/pages.yaml', { pages });

  const feedbackMessage = tags
    .map((t) => `[${t.nodeId}]: ${t.feedback}`)
    .join('\n');

  try {
    const adapter = new BrowserFeedbackAdapter(claude.provider as unknown as LLMProviderRef);
    const reviewResult = await adapter.reviewDesign(spec, `Fix these issues:\n${feedbackMessage}`);

    let patchesApplied = 0;
    let reasoning = '';

    if (reviewResult.ok) {
      const updatedSpec = adapter.applyPatch(spec, reviewResult.value);
      patchesApplied = Object.keys(reviewResult.value.patches).length;
      reasoning = reviewResult.value.reasoning;

      const nodes = updatedSpec.nodes as unknown as Record<string, Record<string, unknown>>;
      for (const tag of tags) {
        const node = nodes[tag.nodeId];
        if (node) {
          if (!node._userFeedback) {
            node._userFeedback = [];
          }
          (node._userFeedback as Array<{ feedback: string; iteration: number }>).push({
            feedback: tag.feedback,
            iteration: currentIteration + 1,
          });
        }
      }

      const projectRoot = getActiveProjectRoot();
      const designsDir = join(projectRoot, 'agentforge', 'designs');
      if (!existsSync(designsDir)) {
        mkdirSync(designsDir, { recursive: true });
      }
      writeFileSync(
        join(designsDir, `${pageId}.json`),
        JSON.stringify(updatedSpec, null, 2),
        'utf-8',
      );
    } else {
      const errMsg = 'message' in reviewResult.error ? reviewResult.error.message : String(reviewResult.error);
      const newIteration = currentIteration + 1;
      pages[idx].correctionIteration = newIteration;
      pages[idx].designStatus = 'rendered';
      writeYamlFile('agentforge/spec/pages.yaml', { pages });

      return NextResponse.json({
        iteration: newIteration,
        maxIterations: MAX_CORRECTION_ITERATIONS,
        patchesApplied: 0,
        tagsReceived: tags.length,
        error: errMsg,
      }, { status: 502 });
    }

    const newIteration = currentIteration + 1;
    pages[idx].correctionIteration = newIteration;
    pages[idx].designStatus = 'rendered';
    writeYamlFile('agentforge/spec/pages.yaml', { pages });

    return NextResponse.json({
      iteration: newIteration,
      maxIterations: MAX_CORRECTION_ITERATIONS,
      patchesApplied,
      tagsReceived: tags.length,
      reasoning,
    });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    pages[idx].designStatus = 'rendered';
    pages[idx].correctionIteration = (page.correctionIteration ?? 0) + 1;
    writeYamlFile('agentforge/spec/pages.yaml', { pages });

    return NextResponse.json(
      { error: `Correction pipeline failed: ${errMessage}` },
      { status: 500 },
    );
  }
}
