/**
 * @module design-pipeline/run-pages
 *
 * Shared Chrome Pass → sequential per-page pipeline loop. Used by both
 * CLI (design-page-all) and dashboard (generate-all route). Extracted
 * as part of M1 Phase 3 (D6).
 *
 * Does NOT include: CLI formatting, Langfuse init, correction pipeline,
 * or prototype manifest building — those stay in callers.
 */

import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import type { PageEntry } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { PipelineInput, DesignPhaseState, PipelineStageError, ChromePassConfig } from './types.js';
import { runDesignPipeline } from './pipeline.js';
import { resolveSharedComponents, buildSharedChromeFilePayload } from '../prototype/index.js';

// ── Public types ──

export interface RunPagesOptions {
  readonly pages: PageEntry[];
  readonly projectRoot: string;
  readonly buildInput: (pageId: string, chromePass?: ChromePassConfig) => PipelineInput | null;
  readonly onPageStart?: (pageId: string, index: number, total: number) => void;
  readonly onPageComplete?: (pageId: string, result: DesignPhaseState, durationMs: number) => void | Promise<void>;
  readonly onPageFail?: (pageId: string, error: PipelineStageError, durationMs: number) => void;
  readonly onChromePassStart?: (referencePageId: string, components: readonly string[]) => void;
  readonly onChromePassComplete?: (spec: DesignSpecV2) => void;
  readonly onChromePassFail?: (error: string) => void;
  /** When true, skip Chrome Pass generation (used by --design-only). */
  readonly skipChromeGeneration?: boolean;
  /** Pre-loaded chrome spec (from --design-only cache). */
  readonly preloadedChromeSpec?: DesignSpecV2;
  /** Write shared-chrome.json to disk. Callers that need custom post-processing can disable and handle themselves. Default: true. */
  readonly writeChromeFile?: boolean;
}

export interface PageRunResult {
  readonly pageId: string;
  readonly status: 'ok' | 'failed';
  readonly durationMs: number;
  readonly state?: DesignPhaseState;
  readonly error?: PipelineStageError;
}

export interface RunPagesResult {
  readonly pages: PageRunResult[];
  readonly sharedChromeSpec?: DesignSpecV2;
}

// ── Implementation ──

/**
 * Run Chrome Pass (if needed) then design each page sequentially.
 *
 * Chrome Pass: resolves shared components across pages, generates a reference
 * design spec for the chrome, then each page consumes the frozen chrome.
 *
 * Sequential ordering per vision Layer 7.
 */
export async function runPagesWithChromePass(opts: RunPagesOptions): Promise<RunPagesResult> {
  const { pages, projectRoot, buildInput } = opts;
  const writeChromeFile = opts.writeChromeFile ?? true;

  let sharedChromeSpec: DesignSpecV2 | undefined = opts.preloadedChromeSpec;

  // ── Chrome Pass ──
  if (!opts.skipChromeGeneration && !sharedChromeSpec) {
    const sharedMeta = resolveSharedComponents(pages);

    if (sharedMeta) {
      const refPage = pages.find(p => p.id === sharedMeta.referencePageId);

      if (refPage) {
        opts.onChromePassStart?.(sharedMeta.referencePageId, sharedMeta.components);

        const chromeInput = buildInput(refPage.id, { mode: 'generate' });

        if (chromeInput) {
          const chromeResult = await runDesignPipeline(chromeInput);

          if (chromeResult.ok && chromeResult.value.design?.spec) {
            sharedChromeSpec = chromeResult.value.design.spec as unknown as DesignSpecV2;

            if (writeChromeFile) {
              const payload = buildSharedChromeFilePayload(sharedChromeSpec, sharedMeta);
              const designsDir = join(projectRoot, 'agentforge', 'designs');
              if (!existsSync(designsDir)) mkdirSync(designsDir, { recursive: true });
              writeFileSync(join(designsDir, 'shared-chrome.json'), JSON.stringify(payload, null, 2));
            }

            opts.onChromePassComplete?.(sharedChromeSpec);
          } else {
            const errMsg = chromeResult.ok
              ? 'no design spec returned'
              : ((chromeResult.error as { message?: string }).message ?? 'unknown');
            opts.onChromePassFail?.(errMsg);
          }
        } else {
          opts.onChromePassFail?.(`reference page ${refPage.id} not found in pages.yaml`);
        }
      }
    }
  }

  // ── Sequential per-page pipeline ──
  const results: PageRunResult[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageId = page.id;

    opts.onPageStart?.(pageId, i, pages.length);

    const chromePass: ChromePassConfig | undefined = sharedChromeSpec
      ? { mode: 'consume', spec: sharedChromeSpec, activePageId: pageId }
      : undefined;

    const pageInput = buildInput(pageId, chromePass);

    if (!pageInput) {
      results.push({ pageId, status: 'failed', durationMs: 0, error: {
        code: 'PIPELINE_STAGE_FAILED', stage: 'init', message: `Page ${pageId} not found in pages.yaml`, recoverable: false,
      }});
      continue;
    }

    const t0 = Date.now();
    const pageResult = await runDesignPipeline(pageInput);
    const durationMs = Date.now() - t0;

    if (pageResult.ok) {
      results.push({ pageId, status: 'ok', durationMs, state: pageResult.value });
      await opts.onPageComplete?.(pageId, pageResult.value, durationMs);
    } else {
      const error = pageResult.error as PipelineStageError;
      results.push({ pageId, status: 'failed', durationMs, error });
      opts.onPageFail?.(pageId, error, durationMs);
    }
  }

  return { pages: results, sharedChromeSpec };
}
