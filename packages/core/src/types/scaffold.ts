/**
 * @module @agentforge/core/types/scaffold
 *
 * Input/output types for the shared scaffoldProject function.
 * Both CLI init and dashboard project-creation map their
 * channel-specific inputs to this schema before calling scaffoldProject.
 */

import { z } from 'zod';
import type { DesignTokensSpec, BrandSpec, ComponentCatalogSpec } from './design-system.js';

/**
 * Input for the shared scaffoldProject function.
 *
 * Callers (CLI, dashboard) resolve their channel-specific inputs
 * (wizard answers, API request body) into this shape before calling.
 * The projectConfig field accepts the pre-built agentforge.yaml content
 * so each caller can include its own fields (repo, agents, etc.)
 * without the scaffold function needing to know about them.
 *
 * Design tokens and brand spec are accepted as opaque pre-validated
 * objects (z.custom) since callers build them from typed builders
 * (buildDesignTokensSpec, optionToTokens) before passing them in.
 */
export const ScaffoldProjectInputSchema = z.object({
  /** Project display name. */
  name: z.string().min(1),

  /** Project description. */
  description: z.string().optional(),

  /**
   * Pre-built agentforge.yaml content. The scaffold function writes this
   * as-is. CLI passes the full ProjectManifest; dashboard passes a minimal
   * config. This avoids the scaffold function needing to know about
   * caller-specific fields (repo, agents, hitl, channels, etc.).
   */
  projectConfig: z.record(z.unknown()),

  /** Pre-resolved design tokens. When provided, writes design-tokens.yaml. */
  designTokens: z.custom<DesignTokensSpec>().optional(),

  /** Pre-resolved brand spec. When provided, writes brand.yaml. */
  brandSpec: z.custom<BrandSpec>().optional(),

  /** Component library ID (e.g. 'shadcn', 'mui'). When provided, generates project catalog. */
  componentLibraryId: z.string().optional(),

  /**
   * Pre-loaded base component catalog. When provided, used instead of
   * loadBaseCatalog() which resolves the YAML via __dirname. Callers
   * in environments where __dirname doesn't resolve correctly (e.g.
   * Next.js dev server) should pre-load the catalog and pass it here.
   */
  baseCatalog: z.custom<ComponentCatalogSpec>().optional(),

  /** Whether to generate tailwind.config.ts and globals.css. Defaults to true when designTokens present. */
  generateTailwind: z.boolean().optional(),

  /** PRD markdown content. When provided, writes docs/prd.md. */
  prdContent: z.string().optional(),
});

export type ScaffoldProjectInput = z.infer<typeof ScaffoldProjectInputSchema>;

/** Result of a scaffoldProject call. */
export interface ScaffoldResult {
  /** List of file paths created, relative to projectDir. */
  createdFiles: string[];
}
