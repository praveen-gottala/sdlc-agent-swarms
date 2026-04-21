/**
 * Design shared chrome once (Chrome Pass) — thin wrapper over penpotDesignWork with a filtered plan.
 */

import type { PageEntry, LLMProviderRef } from '@agentforge/core';
import type { RendererTokens, CatalogMap } from '@agentforge/designspec-renderer';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import { Ok, Err, type Result } from '@agentforge/core';
import { penpotDesignWork } from '../ux-design/ux-penpot-design.js';
import type { PenpotDesignInput } from '../ux-design/ux-penpot-design.js';

type PenpotDesignOptionalFields = Pick<
  PenpotDesignInput,
  'designTokens' | 'browserCorrectionOptions' | 'legacyPenpotCorrection' | 'componentCatalogRaw'
>;
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';
import { extractScreenSubtree } from '../ux-design/screen-partitioner.js';
import type { ScreenDefinition } from '../types.js';
import type { SharedChrome } from './resolve-shared-components.js';

export const SHARED_CHROME_MODULE_ID = '__shared-chrome__';

export interface DesignChromeInput {
  readonly refPage: PageEntry;
  readonly refPlanning: UXPlanningOutput;
  readonly sharedChrome: SharedChrome;
  readonly rendererTokens: RendererTokens;
  readonly catalogMap: CatalogMap;
  readonly designSystemPrompt?: string;
  readonly componentCatalogPrompt?: string;
  readonly viewportWidth: number;
  readonly designTokens?: PenpotDesignOptionalFields['designTokens'];
  readonly browserCorrectionOptions?: PenpotDesignOptionalFields['browserCorrectionOptions'];
  readonly legacyPenpotCorrection?: PenpotDesignOptionalFields['legacyPenpotCorrection'];
  readonly componentCatalogRaw?: PenpotDesignOptionalFields['componentCatalogRaw'];
}

/**
 * Run a single V2 design pass for shared chrome only; planning tree is filtered to `sharedChrome.components`.
 */
export async function designChromeComponents(
  input: DesignChromeInput,
  provider: LLMProviderRef,
): Promise<Result<DesignSpecV2>> {
  const screen: ScreenDefinition = {
    screenId: 'shared-chrome',
    name: 'Shared Chrome',
    componentNames: [...input.sharedChrome.components],
  };
  const planningSlice = extractScreenSubtree(input.refPlanning, screen);
  if (planningSlice.componentTree.length === 0) {
    return Err({
      code: 'INVALID_STATE',
      message: 'Chrome pass: no matching components in planning tree for shared intersection.',
      recoverable: false,
    });
  }

  const desc =
    `Shared app chrome only (${input.sharedChrome.components.join(', ')}). ` +
    'Do not design page body content, cards, or forms.';

  const penpotInput: PenpotDesignInput = {
    specRef: input.refPlanning.specRef,
    moduleId: SHARED_CHROME_MODULE_ID,
    taskId: `task_chrome_${input.refPage.id}_${Date.now()}`,
    planningOutput: planningSlice,
    description: desc,
    viewportWidth: input.viewportWidth,
    useDesignSpecV2: true,
    rendererTokens: input.rendererTokens,
    catalogMap: input.catalogMap,
    ...(input.designSystemPrompt ? { designSystemPrompt: input.designSystemPrompt } : {}),
    ...(input.componentCatalogPrompt ? { componentCatalogPrompt: input.componentCatalogPrompt } : {}),
    ...(input.designTokens ? { designTokens: input.designTokens } : {}),
    ...(input.browserCorrectionOptions ? { browserCorrectionOptions: input.browserCorrectionOptions } : {}),
    ...(input.legacyPenpotCorrection !== undefined ? { legacyPenpotCorrection: input.legacyPenpotCorrection } : {}),
    ...(input.componentCatalogRaw ? { componentCatalogRaw: input.componentCatalogRaw } : {}),
    chromeOnly: true,
  };

  const result = await penpotDesignWork(penpotInput, provider);
  if (!result.ok) {
    return result;
  }
  if (!result.value.designSpec) {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT',
      message: 'Chrome pass: missing designSpec on PenpotDesignOutput',
      recoverable: true,
    });
  }
  return Ok(result.value.designSpec);
}
