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

  /**
   * Get design tokens. Attempts get_variables (Figma Variables API) first,
   * falls back to extracting tokens from get_code + get_metadata when the
   * Variables API is unavailable (requires Enterprise plan — see ADR-024).
   */
  async getTokens(): Promise<Result<DesignTokens>> {
    // Primary path: Figma Variables API (Enterprise only)
    const result = await this.mcpClient.callTool('figma', 'get_variables', {
      fileId: this.fileId,
    });
    if (result.ok) {
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

    // ADR-024: Fallback — extract tokens from get_code node styles
    return this.extractTokensFromCode();
  }

  /**
   * ADR-024 fallback: extract design tokens from get_code response.
   * The Figma node tree includes inline style data (fills, strokes,
   * effects, text styles) even when the Variables API is inaccessible.
   */
  private async extractTokensFromCode(): Promise<Result<DesignTokens>> {
    const codeResult = await this.mcpClient.callTool('figma', 'get_code', {
      fileId: this.fileId,
    });
    if (!codeResult.ok) {
      return Err(mcpUnavailable('getTokens fallback (get_code) failed'));
    }

    const metaResult = await this.mcpClient.callTool('figma', 'get_metadata', {
      fileId: this.fileId,
    });
    if (!metaResult.ok) {
      return Err(mcpUnavailable('getTokens fallback (get_metadata) failed'));
    }

    const colors: Record<string, string> = {};
    const typography: Record<string, unknown> = {};
    const spacing: Record<string, string> = {};

    // Extract colors and styles from node tree
    const meta = metaResult.value as { document?: { children?: readonly Record<string, unknown>[] } };
    const nodes = meta.document?.children ?? [];
    this.extractStylesFromNodes(nodes, colors, typography, spacing);

    return Ok({ colors, typography, spacing });
  }

  /** Recursively extract inline style data from Figma nodes. */
  private extractStylesFromNodes(
    nodes: readonly Record<string, unknown>[],
    colors: Record<string, string>,
    typography: Record<string, unknown>,
    spacing: Record<string, string>,
  ): void {
    for (const node of nodes) {
      // Extract fill colors
      const fills = node.fills as ReadonlyArray<{ type?: string; color?: { r?: number; g?: number; b?: number; a?: number } }> | undefined;
      if (fills) {
        for (const fill of fills) {
          if (fill.type === 'SOLID' && fill.color) {
            const { r = 0, g = 0, b = 0 } = fill.color;
            const hex = `#${Math.round(r * 255).toString(16).padStart(2, '0')}${Math.round(g * 255).toString(16).padStart(2, '0')}${Math.round(b * 255).toString(16).padStart(2, '0')}`;
            const name = (node.name as string) ?? 'unnamed';
            colors[name] = hex;
          }
        }
      }

      // Extract text styles
      const style = node.style as Record<string, unknown> | undefined;
      if (style && node.type === 'TEXT') {
        const name = (node.name as string) ?? 'unnamed';
        typography[name] = {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeightPx,
          letterSpacing: style.letterSpacing,
        };
      }

      // Extract spacing from auto-layout
      const itemSpacing = node.itemSpacing as number | undefined;
      if (itemSpacing !== undefined) {
        const name = (node.name as string) ?? 'unnamed';
        spacing[`${name}.gap`] = `${itemSpacing}px`;
      }
      const padding = node.paddingLeft as number | undefined;
      if (padding !== undefined) {
        const name = (node.name as string) ?? 'unnamed';
        spacing[`${name}.padding`] = `${padding}px`;
      }

      // Recurse into children
      const children = node.children as readonly Record<string, unknown>[] | undefined;
      if (children) {
        this.extractStylesFromNodes(children, colors, typography, spacing);
      }
    }
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
