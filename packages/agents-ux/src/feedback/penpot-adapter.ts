/**
 * @module feedback/penpot-adapter
 *
 * PenpotFeedbackAdapter — wraps existing DesignCollaborationSession.
 * Delegates feedback to Penpot's MCP-based collaboration session.
 */

import type { Result } from '@agentforge/core';
import { Ok } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { DesignCollaborationSession } from '../ux-design/design-system-context.js';
import type { FeedbackAdapter, DesignSpecPatch } from './types.js';

/** PenpotFeedbackAdapter: wraps DesignCollaborationSession for Penpot feedback. */
export class PenpotFeedbackAdapter implements FeedbackAdapter {
  constructor(
    private readonly session: DesignCollaborationSession,
  ) {}

  async reviewDesign(_spec: DesignSpecV2, userMessage?: string): Promise<Result<DesignSpecPatch>> {
    if (!userMessage) {
      return Ok({ patches: {}, reasoning: 'No message provided' });
    }

    const result = await this.session.applyFeedback(userMessage);
    if (!result.ok) return result as Result<never>;

    const changes = this.session.getChangeHistory();
    const patches: Record<string, Record<string, unknown>> = {};
    for (const change of changes) {
      if (!patches[change.nodeId]) patches[change.nodeId] = {};
      patches[change.nodeId][change.field] = change.newValue;
    }

    return Ok({ patches, reasoning: `Applied ${changes.length} change(s) via Penpot` });
  }

  applyPatch(_spec: DesignSpecV2, _patch: DesignSpecPatch): DesignSpecV2 {
    // Penpot already applied changes in reviewDesign via MCP execute_code
    return _spec;
  }

  async showPreview(_spec: DesignSpecV2): Promise<void> {
    // Penpot renders live in the browser — no-op
  }
}
