/**
 * @module feedback/browser-collaboration-session
 *
 * Bridges BrowserFeedbackAdapter → DesignCollaborationSession so the
 * existing runDesignFeedbackLoop can use the browser adapter.
 */

import type { Result } from '@agentforge/core';
import { Ok } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { DesignCollaborationSession, DesignChangeRecord } from '../ux-design/design-system-context.js';
import type { UXDesignOutput } from '../types.js';
import type { BrowserFeedbackAdapter } from './browser-adapter.js';

/** Map a DesignSpecV2 to a minimal UXDesignOutput for loop compatibility. */
export function mapBrowserSpecToDesignOutput(spec: DesignSpecV2): UXDesignOutput {
  return {
    screenshotPath: undefined,
    componentSnapshots: undefined,
    nodePositions: {},
    designSpec: spec,
  } as unknown as UXDesignOutput;
}

/**
 * Wraps BrowserFeedbackAdapter to implement DesignCollaborationSession,
 * allowing the existing runDesignFeedbackLoop to use the browser adapter.
 */
export class BrowserCollaborationSession implements DesignCollaborationSession {
  private spec: DesignSpecV2;
  private readonly changes: DesignChangeRecord[] = [];

  constructor(
    private readonly adapter: BrowserFeedbackAdapter,
    initialSpec: DesignSpecV2,
  ) {
    this.spec = initialSpec;
  }

  startWatching(): void { /* no-op for browser */ }
  stopWatching(): void { /* no-op for browser */ }

  async applyFeedback(feedback: string): Promise<Result<UXDesignOutput>> {
    const patchResult = await this.adapter.reviewDesign(this.spec, feedback);
    if (!patchResult.ok) {
      return patchResult as Result<never>;
    }

    const patch = patchResult.value;
    this.spec = this.adapter.applyPatch(this.spec, patch);

    for (const [nodeId, fields] of Object.entries(patch.patches)) {
      for (const [field, newValue] of Object.entries(fields)) {
        this.changes.push({ nodeId, field, previousValue: undefined, newValue, changedAt: Date.now() });
      }
    }

    return Ok(mapBrowserSpecToDesignOutput(this.spec));
  }

  getChangeHistory(): readonly DesignChangeRecord[] {
    return this.changes;
  }

  /** Access the current spec after feedback iterations. */
  getCurrentSpec(): DesignSpecV2 {
    return this.spec;
  }
}
