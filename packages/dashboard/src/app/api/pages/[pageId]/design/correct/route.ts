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
import { normalizeSpecOverrides } from '@agentforge/designspec-renderer';

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

interface VisionIssue {
  severity: string;
  component: string;
  description: string;
  fix: string;
  issueId?: string;
}

const MAX_CORRECTION_ITERATIONS = 3;

function formatVisionIssuesAsPrompt(issues: VisionIssue[], nodeIds: string[], feedback?: string): string {
  const lines = issues.map((issue, i) =>
    `Issue ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.component}: ${issue.description}\n  Fix: ${issue.fix}`
  );
  let prompt = `Fix ALL ${issues.length} design issues below. Each issue MUST have a corresponding patch.\n\n`;
  prompt += `Available node IDs: ${nodeIds.join(', ')}\n\n`;
  prompt += lines.join('\n\n');
  if (feedback) {
    prompt += `\n\nAdditional user guidance: ${feedback}`;
  }
  return prompt;
}

/**
 * POST /api/pages/[pageId]/design/correct
 *
 * Accepts either user feedback tags OR vision audit issues, and applies
 * LLM-driven corrections via BrowserFeedbackAdapter.
 *
 * Body (option A — manual feedback): { tags: [{ nodeId, feedback }] }
 * Body (option B — vision issues):   { issues: [{ severity, component, description, fix }], feedback?: string }
 * Returns: { iteration, patchesApplied, reasoning }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;

  let body: {
    tags?: FeedbackTag[];
    issues?: VisionIssue[];
    feedback?: string;
    previousAttempt?: { scoreBefore: number; scoreAfter: number; patchesTried: Record<string, unknown> };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tags = body.tags;
  const issues = body.issues;

  if ((!Array.isArray(tags) || tags.length === 0) && (!Array.isArray(issues) || issues.length === 0)) {
    return NextResponse.json(
      { error: 'Body must include either a non-empty "tags" array or a non-empty "issues" array' },
      { status: 400 },
    );
  }

  if (tags) {
    for (const tag of tags) {
      if (typeof tag.nodeId !== 'string' || typeof tag.feedback !== 'string') {
        return NextResponse.json(
          { error: 'Each tag must have "nodeId" (string) and "feedback" (string)' },
          { status: 400 },
        );
      }
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
  const isVisionFix = Array.isArray(issues) && issues.length > 0;
  if (!isVisionFix && currentIteration >= MAX_CORRECTION_ITERATIONS) {
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

  const projectRoot = getActiveProjectRoot();
  const designsDir = join(projectRoot, 'agentforge', 'designs');
  if (!existsSync(designsDir)) {
    mkdirSync(designsDir, { recursive: true });
  }
  writeFileSync(join(designsDir, `${pageId}.backup.json`), specContent, 'utf-8');

  const specNodeIds = Object.keys(spec.nodes);
  let feedbackMessage = issues
    ? formatVisionIssuesAsPrompt(issues, specNodeIds, body.feedback)
    : `Fix these issues:\n${(tags ?? []).map((t) => `[${t.nodeId}]: ${t.feedback}`).join('\n')}`;

  if (body.previousAttempt) {
    const { scoreBefore, scoreAfter, patchesTried } = body.previousAttempt;
    feedbackMessage = `CRITICAL: The previous fix attempt FAILED — score dropped from ${scoreBefore} to ${scoreAfter}.\n` +
      `The patches below made things WORSE. Analyze why and try a DIFFERENT approach.\n` +
      `Previous patches that failed: ${JSON.stringify(patchesTried)}\n\n` +
      feedbackMessage;
  }

  try {
    const adapter = new BrowserFeedbackAdapter(claude.provider as unknown as LLMProviderRef);
    const reviewResult = await adapter.reviewDesign(spec, feedbackMessage);

    let patchesApplied = 0;
    let reasoning = '';

    if (reviewResult.ok) {
      const updatedSpec = adapter.applyPatch(spec, reviewResult.value);
      const hasRoot = Object.values(updatedSpec.nodes).some(n => n.parent === null);
      if (!hasRoot || Object.keys(updatedSpec.nodes).length === 0) {
        const newIteration = currentIteration + 1;
        pages[idx].correctionIteration = newIteration;
        pages[idx].designStatus = 'rendered';
        writeYamlFile('agentforge/spec/pages.yaml', { pages });
        return NextResponse.json({
          iteration: newIteration, maxIterations: MAX_CORRECTION_ITERATIONS,
          patchesApplied: 0, tagsReceived: tags?.length ?? 0,
          error: 'Patch would break the design (no root node). Try fixing fewer issues at once.',
        }, { status: 422 });
      }
      patchesApplied = Object.keys(reviewResult.value.patches).length;
      reasoning = reviewResult.value.reasoning;

      if (tags) {
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
      }

      const normalizedSpec = normalizeSpecOverrides(updatedSpec);
      writeFileSync(
        join(designsDir, `${pageId}.json`),
        JSON.stringify(normalizedSpec, null, 2),
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
        tagsReceived: tags?.length ?? 0,
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
      tagsReceived: tags?.length ?? 0,
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
