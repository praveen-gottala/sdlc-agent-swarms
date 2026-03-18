/**
 * @module @agentforge/agents-design/figma-adapter
 *
 * Figma adapter implementing the DesignSurface interface via MCP.
 * Communicates with the Figma MCP server for all design operations.
 */

import type { MCPClient, Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { DesignSurface, DesignContext, DesignSpec, DesignTokens, DesignChange } from '../design-surface.js';

/** Create an MCP_UNAVAILABLE error. */
const mcpUnavailable = (detail: string) => ({
  code: 'MCP_UNAVAILABLE' as const,
  message: `Figma MCP unavailable: ${detail}`,
  recoverable: true,
});

/**
 * Figma implementation of DesignSurface.
 * Uses MCP client to communicate with Figma's MCP server.
 *
 * DEVIATION: ADR-015
 * PRD v2.0 Section 20.2 (F7) specifies: Storybook fallback when Figma unavailable
 * Implementation: Phase 1 only has FigmaAdapter. Figma unavailable → halt + notify human.
 * Rationale: see ADR-015
 *
 * DEVIATION: ADR-016
 * PRD v2.0 Section 11.1.2 specifies: Code Connect maps Figma IDs to codebase paths automatically
 * Implementation: componentMappings are output-only metadata, no automated resolution
 * Rationale: see ADR-016
 */
export class FigmaAdapter implements DesignSurface {
  private lockedBy: string | null = null;
  private lastModified: string | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly mcpClient: MCPClient,
    private readonly fileId: string,
  ) {}

  async createWorkspace(projectName: string): Promise<Result<string>> {
    const result = await this.mcpClient.callTool('figma', 'generate_figma_design', {
      projectName,
      fileId: this.fileId,
    });
    if (!result.ok) {
      return Err(mcpUnavailable('createWorkspace failed'));
    }
    const data = result.value as { fileId?: string };
    return Ok(data.fileId ?? this.fileId);
  }

  async readDesign(pageId: string): Promise<Result<DesignContext>> {
    const codeResult = await this.mcpClient.callTool('figma', 'get_code', {
      fileId: this.fileId,
      nodeId: pageId,
    });
    if (!codeResult.ok) {
      return Err(mcpUnavailable('readDesign get_code failed'));
    }

    const metaResult = await this.mcpClient.callTool('figma', 'get_metadata', {
      fileId: this.fileId,
      nodeId: pageId,
    });
    if (!metaResult.ok) {
      return Err(mcpUnavailable('readDesign get_metadata failed'));
    }

    const code = codeResult.value as { html?: string };
    const meta = metaResult.value as Record<string, unknown>;
    const lastModified = (meta.last_modified as string) ?? new Date().toISOString();

    return Ok({
      pageId,
      html: code.html ?? '',
      metadata: meta,
      lastModified,
    });
  }

  async writeDesign(spec: DesignSpec): Promise<Result<void>> {
    const result = await this.mcpClient.callTool('figma', 'generate_figma_design', {
      fileId: this.fileId,
      nodeId: spec.pageId,
      name: spec.name,
      html: spec.html,
      tokens: spec.tokens,
    });
    if (!result.ok) {
      return Err(mcpUnavailable('writeDesign failed'));
    }
    return Ok(undefined);
  }

  async getTokens(): Promise<Result<DesignTokens>> {
    const result = await this.mcpClient.callTool('figma', 'get_variables', {
      fileId: this.fileId,
    });
    if (!result.ok) {
      return Err(mcpUnavailable('getTokens failed'));
    }

    const data = result.value as {
      colors?: Record<string, string>;
      typography?: Record<string, unknown>;
      spacing?: Record<string, string>;
    };

    return Ok({
      colors: data.colors ?? {},
      typography: data.typography ?? {},
      spacing: data.spacing ?? {},
    });
  }

  onUserEdit(callback: (change: DesignChange) => void): void {
    this.pollingInterval = setInterval(async () => {
      const metaResult = await this.mcpClient.callTool('figma', 'get_metadata', {
        fileId: this.fileId,
      });
      if (!metaResult.ok) return;

      const meta = metaResult.value as { last_modified?: string };
      const currentModified = meta.last_modified ?? null;

      if (this.lastModified && currentModified && currentModified !== this.lastModified) {
        callback({
          pageId: this.fileId,
          field: 'last_modified',
          previousValue: this.lastModified,
          newValue: currentModified,
          changedAt: currentModified,
        });
      }

      this.lastModified = currentModified;
    }, 30000);
  }

  lockForAgent(agentId: string): Result<void> {
    if (this.lockedBy !== null && this.lockedBy !== agentId) {
      return Err({
        code: 'SPEC_LOCK_FAILED' as const,
        message: `Design surface locked by ${this.lockedBy}`,
        recoverable: true,
      });
    }
    this.lockedBy = agentId;
    return Ok(undefined);
  }

  unlockForAgent(agentId: string): Result<void> {
    if (this.lockedBy !== null && this.lockedBy !== agentId) {
      return Err({
        code: 'SPEC_LOCK_FAILED' as const,
        message: `Cannot unlock: locked by ${this.lockedBy}, not ${agentId}`,
        recoverable: false,
      });
    }
    this.lockedBy = null;
    return Ok(undefined);
  }

  /** Clean up polling interval. */
  dispose(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
