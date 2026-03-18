/**
 * @module @agentforge/agents-design/design-surface
 *
 * Abstract interface for design tool integration.
 * Agents interact with the design tool exclusively through this interface,
 * allowing different adapters (Figma, Paper, etc.) to be swapped in.
 */

import type { Result } from '@agentforge/core';

/** Context read from an existing design page. */
export interface DesignContext {
  readonly pageId: string;
  readonly html: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly lastModified: string;
}

/** Specification to write a design to the tool. */
export interface DesignSpec {
  readonly pageId: string;
  readonly name: string;
  readonly html: string;
  readonly tokens?: DesignTokens;
}

/** Design tokens (colors, typography, spacing). */
export interface DesignTokens {
  readonly colors: Readonly<Record<string, string>>;
  readonly typography: Readonly<Record<string, unknown>>;
  readonly spacing: Readonly<Record<string, string>>;
}

/** A change detected on the design surface. */
export interface DesignChange {
  readonly pageId: string;
  readonly field: string;
  readonly previousValue: unknown;
  readonly newValue: unknown;
  readonly changedAt: string;
}

/**
 * Interface for design tool operations.
 * Implementations must return Result types (never throw).
 */
export interface DesignSurface {
  /** Create a new workspace/project in the design tool. */
  createWorkspace(projectName: string): Promise<Result<string>>;

  /** Read the current design for a page. */
  readDesign(pageId: string): Promise<Result<DesignContext>>;

  /** Write a design spec to the tool. */
  writeDesign(spec: DesignSpec): Promise<Result<void>>;

  /** Get the design tokens/variables from the tool. */
  getTokens(): Promise<Result<DesignTokens>>;

  /** Register a callback for user edits (polling-based). */
  onUserEdit(callback: (change: DesignChange) => void): void;

  /** Lock the design surface for an agent. */
  lockForAgent(agentId: string): Result<void>;

  /** Unlock the design surface after agent work. */
  unlockForAgent(agentId: string): Result<void>;
}
