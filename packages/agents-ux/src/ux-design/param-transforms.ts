/**
 * @module @agentforge/agents-ux/param-transforms
 *
 * Shared parameter resolution and transformation logic used by both the
 * initial design path (ux-design.ts) and the feedback collaboration
 * path (design-collaboration.ts).
 *
 * Handles:
 * - ref:<name> placeholder resolution to real Figma node IDs
 * - <parent> fallback resolution
 * - Color wrapping (hex string / flat r,g,b,a → { color: { r,g,b,a } })
 * - set_layout_mode: mode → layoutMode remapping
 * - create_text: fontWeight string → number, fontColor hex → object
 * - create_frame: fillColor/strokeColor hex → object, FILL sizing stripping
 */

import type { FigmaCreationStep } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/** Context needed for resolving refs and applying transforms. */
export interface ParamTransformContext {
  /** Map of componentRef names → Figma node IDs. */
  readonly nodeIds: Readonly<Record<string, string>>;
  /** ID of the last created node, for <parent> fallback. */
  readonly lastCreatedNodeId: string;
  /** Current step index (for logging). */
  readonly stepIndex: number;
  /** Total step count (for logging). */
  readonly stepCount: number;
}

/** Result of param transform, including post-creation instructions. */
export interface TransformResult {
  /** The resolved and transformed params ready for MCP call. */
  readonly resolvedParams: Record<string, unknown>;
  /** If set, run set_layout_mode after frame creation with this mode. */
  readonly postCreateLayoutMode?: string;
  /** If set, run set_item_spacing after frame creation with this value. */
  readonly postCreateSpacing?: number;
  /** If set, run set_padding after frame creation with these values. */
  readonly postCreatePadding?: Record<string, number>;
  /** If true, the step should be skipped because a ref could not be resolved. */
  readonly skipped?: boolean;
  /** Human-readable reason when skipped is true. */
  readonly skipReason?: string;
}

// ============================================================================
// Hex → RGB converter
// ============================================================================

/** Convert hex color string to {r,g,b} 0-1 floats for Figma API. */
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};

// ============================================================================
// Fuzzy ref matching
// ============================================================================

/**
 * Attempt a fuzzy match for an unresolved ref name against known node IDs.
 * Tries: (1) case-insensitive match, (2) substring match.
 * Returns the matched key if exactly one match is found, otherwise null.
 */
export const fuzzyMatchRef = (refName: string, nodeIds: Readonly<Record<string, string>>): string | null => {
  const keys = Object.keys(nodeIds);
  const refLower = refName.toLowerCase();

  // 1. Case-insensitive exact match
  const ciMatches = keys.filter((k) => k.toLowerCase() === refLower);
  if (ciMatches.length === 1) return ciMatches[0];

  // 2. Substring match — ref is contained in a key, or key is contained in ref
  const subMatches = keys.filter(
    (k) => k.toLowerCase().includes(refLower) || refLower.includes(k.toLowerCase()),
  );
  if (subMatches.length === 1) return subMatches[0];

  return null;
};

// ============================================================================
// Core transform logic
// ============================================================================

/** Wrap flat r,g,b,a or hex string into { r, g, b, a } color object. */
const wrapColor = (params: Record<string, unknown>, colorKey: string): void => {
  const raw = params[colorKey];
  if (typeof raw === 'string') {
    const rgb = hexToRgb(raw);
    if (rgb) params[colorKey] = { ...rgb, a: 1 };
  } else if (raw === undefined && typeof params.r === 'number') {
    params[colorKey] = {
      r: params.r, g: params.g, b: params.b,
      a: typeof params.a === 'number' ? params.a : 1,
    };
    delete params.r; delete params.g; delete params.b; delete params.a;
  }
};

/**
 * Resolve ref: placeholders and apply all param transforms for a single step.
 * This is the shared logic that both the initial design and feedback paths use.
 */
export const resolveAndTransformParams = (
  step: FigmaCreationStep,
  ctx: ParamTransformContext,
): TransformResult => {
  // ── Phase 1: Resolve ref:<componentRef> and <parent> placeholders ──

  const resolvedParams: Record<string, unknown> = {};
  let hasUnresolvedRef = false;
  let unresolvedRefName = '';
  for (const [key, value] of Object.entries(step.params)) {
    if (typeof value === 'string') {
      const refMatch = /^ref:(.+)$/.exec(value);
      if (refMatch) {
        const refName = refMatch[1];
        const realId = ctx.nodeIds[refName];
        if (realId) {
          resolvedParams[key] = realId;
        } else {
          // Attempt fuzzy match before giving up
          const fuzzyKey = fuzzyMatchRef(refName, ctx.nodeIds);
          if (fuzzyKey) {
            // eslint-disable-next-line no-console
            console.warn(`        [step ${ctx.stepIndex + 1}/${ctx.stepCount}] fuzzy-matched ref:${refName} → ${fuzzyKey}`);
            resolvedParams[key] = ctx.nodeIds[fuzzyKey];
          } else {
            // eslint-disable-next-line no-console
            console.warn(`        [step ${ctx.stepIndex + 1}/${ctx.stepCount}] unresolved ref:${refName} — known refs: ${Object.keys(ctx.nodeIds).join(', ')}`);
            hasUnresolvedRef = true;
            unresolvedRefName = refName;
            resolvedParams[key] = value; // leave unresolved marker for logging
          }
        }
      } else if (value === '<parent>' && ctx.lastCreatedNodeId) {
        resolvedParams[key] = ctx.lastCreatedNodeId;
      } else {
        resolvedParams[key] = value;
      }
    } else {
      resolvedParams[key] = value;
    }
  }

  // If any ref could not be resolved, signal the caller to skip this step
  if (hasUnresolvedRef) {
    return {
      resolvedParams,
      skipped: true,
      skipReason: `unresolved ref:${unresolvedRefName}`,
    };
  }

  // ── Phase 2: Param transforms ──

  // set_fill_color / set_stroke_color: plugin expects { nodeId, color: { r, g, b, a } }
  if (step.tool === 'set_fill_color' || step.tool === 'set_stroke_color') {
    wrapColor(resolvedParams, 'color');
  }

  // set_layout_mode: plugin expects { nodeId, layoutMode, layoutWrap? }
  if (step.tool === 'set_layout_mode') {
    if (resolvedParams.mode && !resolvedParams.layoutMode) {
      resolvedParams.layoutMode = resolvedParams.mode;
      delete resolvedParams.mode;
    }
    // spacing/padding are separate commands — strip them here
    delete resolvedParams.spacing;
    delete resolvedParams.paddingLeft;
    delete resolvedParams.paddingRight;
    delete resolvedParams.paddingTop;
    delete resolvedParams.paddingBottom;
  }

  // set_axis_align: normalize invalid enum values
  if (step.tool === 'set_axis_align') {
    const validCounter = new Set(['MIN', 'MAX', 'CENTER', 'BASELINE']);
    const validPrimary = new Set(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN']);
    if (resolvedParams.counterAxisAlignItems &&
        !validCounter.has(resolvedParams.counterAxisAlignItems as string)) {
      resolvedParams.counterAxisAlignItems = 'MIN';
    }
    if (resolvedParams.primaryAxisAlignItems &&
        !validPrimary.has(resolvedParams.primaryAxisAlignItems as string)) {
      resolvedParams.primaryAxisAlignItems = 'MIN';
    }
  }

  // create_text: fontWeight must be numeric, fontColor must be object
  if (step.tool === 'create_text') {
    if (typeof resolvedParams.fontWeight === 'string') {
      resolvedParams.fontWeight = parseInt(resolvedParams.fontWeight as string, 10) || 400;
    }
    if (resolvedParams.fontColor && typeof resolvedParams.fontColor === 'string') {
      const rgb = hexToRgb(resolvedParams.fontColor as string);
      if (rgb) resolvedParams.fontColor = { ...rgb, a: 1 };
    }
  }

  // create_frame: wrap colors, remap mode, strip FILL sizing, capture post-create instructions
  let postCreateLayoutMode: string | undefined;
  let postCreateSpacing: number | undefined;
  let postCreatePadding: Record<string, number> | undefined;

  if (step.tool === 'create_frame') {
    if (resolvedParams.fillColor && typeof resolvedParams.fillColor !== 'object') {
      const rgb = typeof resolvedParams.fillColor === 'string' ? hexToRgb(resolvedParams.fillColor as string) : null;
      if (rgb) resolvedParams.fillColor = { ...rgb, a: 1 };
    }
    if (resolvedParams.strokeColor && typeof resolvedParams.strokeColor !== 'object') {
      const rgb = typeof resolvedParams.strokeColor === 'string' ? hexToRgb(resolvedParams.strokeColor as string) : null;
      if (rgb) resolvedParams.strokeColor = { ...rgb, a: 1 };
    }
    // Remap "mode" → "layoutMode" if present
    if (resolvedParams.mode && !resolvedParams.layoutMode) {
      resolvedParams.layoutMode = resolvedParams.mode;
      delete resolvedParams.mode;
    }
    // Normalize counterAxisAlignItems — Figma only accepts MIN|MAX|CENTER|BASELINE.
    // LLMs often generate 'STRETCH' which is invalid (stretch is done via layoutAlign on children).
    const validCounterAxisValues = new Set(['MIN', 'MAX', 'CENTER', 'BASELINE']);
    if (resolvedParams.counterAxisAlignItems &&
        !validCounterAxisValues.has(resolvedParams.counterAxisAlignItems as string)) {
      resolvedParams.counterAxisAlignItems = 'MIN';
    }
    // Same for primaryAxisAlignItems — valid: MIN|MAX|CENTER|SPACE_BETWEEN
    const validPrimaryAxisValues = new Set(['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN']);
    if (resolvedParams.primaryAxisAlignItems &&
        !validPrimaryAxisValues.has(resolvedParams.primaryAxisAlignItems as string)) {
      resolvedParams.primaryAxisAlignItems = 'MIN';
    }
    // Strip FILL sizing — requires confirmed parent auto-layout which is unreliable inline
    if (resolvedParams.layoutSizingHorizontal === 'FILL') {
      delete resolvedParams.layoutSizingHorizontal;
    }
    if (resolvedParams.layoutSizingVertical === 'FILL') {
      delete resolvedParams.layoutSizingVertical;
    }
    // Capture layout params for post-creation enforcement
    if (resolvedParams.layoutMode && resolvedParams.layoutMode !== 'NONE') {
      postCreateLayoutMode = resolvedParams.layoutMode as string;
      if (typeof resolvedParams.itemSpacing === 'number') {
        postCreateSpacing = resolvedParams.itemSpacing as number;
      }
      const pt = resolvedParams.paddingTop as number | undefined;
      const pr = resolvedParams.paddingRight as number | undefined;
      const pb = resolvedParams.paddingBottom as number | undefined;
      const pl = resolvedParams.paddingLeft as number | undefined;
      if (pt !== undefined || pr !== undefined || pb !== undefined || pl !== undefined) {
        postCreatePadding = {};
        if (pt !== undefined) postCreatePadding.paddingTop = pt;
        if (pr !== undefined) postCreatePadding.paddingRight = pr;
        if (pb !== undefined) postCreatePadding.paddingBottom = pb;
        if (pl !== undefined) postCreatePadding.paddingLeft = pl;
      }
    }
  }

  return {
    resolvedParams,
    postCreateLayoutMode,
    postCreateSpacing,
    postCreatePadding,
  };
};
