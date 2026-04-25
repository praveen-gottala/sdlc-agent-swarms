/**
 * @module @agentforge/agents-ux/ux-design/browser-correction-adapter
 *
 * Implements CorrectionAdapter for browser-based DesignSpec correction.
 * Unlike the Penpot adapter (which generates JS code for the Plugin API),
 * this adapter receives NodeSpec patches from the vision LLM and merges
 * them directly into the DesignSpec JSON.
 */
import type { Result } from '@agentforge/core';
import { Ok, Err, EVALUATOR_MODEL, isVisionLLMEnabled } from '@agentforge/core';
import type { LLMProvider, ContentBlock } from '@agentforge/providers';
import type { CorrectionAdapter, CorrectionFixResult } from './correction-loop.js';
import type { DesignIssue, CorrectionHistory, FixAttemptRecord } from './design-evaluator.js';
import type { BrowserSession } from '@agentforge/designspec-renderer';
import type { DOMLayoutData, DOMNodeLayout } from '@agentforge/designspec-renderer';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { UserFeedbackTag } from '@agentforge/designspec-renderer';
import type { MechanicalIssue } from '@agentforge/designspec-renderer';
import type { RendererTokens, CatalogMap } from '@agentforge/designspec-renderer';

/** Mutable ref to the current spec — adapter mutates this in place. */
export interface SpecRef {
  value: DesignSpecV2;
}

const VISION_FIX_SYSTEM_PROMPT = `You are a design layout fixer for a DesignSpec-based UI renderer.
You receive a screenshot, DOM layout data, the current DesignSpec JSON, and a list of issues.
Your job is to return NodeSpec patches that fix the layout issues.

RULES:
- Return a JSON object with "patches" and "reasoning" fields
- "patches" is an object map: { "<nodeId>": { /* partial NodeSpec fields */ } }
- Each patch is shallow-merged into the existing NodeSpec for that node
- ONLY include fields you want to CHANGE — omit fields you don't want to touch
- Use exact node IDs from the spec — do NOT invent new ones
- Layout must include "dir" if you set layout
- Dimensions: positive numbers or 'fill' for width, positive numbers for height
- To REMOVE a field, set it to null (e.g., "width": null)
- Colors and typography: use token names from the design system
- Include "reasoning" to explain your changes

The DesignSpec NodeSpec interface — you may ONLY use these properties in patches:

interface NodeSpec {
  parent?: string;      // nodeId of parent node
  order?: number;       // 0-indexed position among siblings
  type?: "page" | "container" | "section" | "header" | "divider" | "spacer" | "text";
  catalog?: string;     // catalog component name (e.g., "badge-warning", "button-primary")
  width?: number | "fill";  // pixels or flex-fill
  height?: number;
  radius?: number;      // border-radius in pixels
  background?: string;  // semantic token name (e.g., "surface-primary", NOT hex values)
  border?: string;      // semantic token name
  shadow?: string;      // "sm" | "md" | "lg"
  layout?: {
    dir: "row" | "column";
    display?: "flex" | "grid";  // layout mode (default: flex). Use "grid" for multi-column card grids.
    columns?: number;            // grid column count — only with display: "grid". Maps to repeat(N, 1fr).
    wrap?: boolean;              // flex wrapping — only with display: "flex". Wraps children to next line.
    gap?: number;       // pixels
    align?: "start" | "center" | "end" | "stretch";
    justify?: "start" | "center" | "end" | "space-between";
    px?: number;        // horizontal padding in pixels
    py?: number;        // vertical padding in pixels
    pt?: number;        // padding-top in pixels
    pb?: number;        // padding-bottom in pixels
    my?: number;        // vertical margin (top + bottom) in pixels
    mx?: number;        // horizontal margin (left + right) in pixels
    mt?: number;        // margin-top
    mb?: number;        // margin-bottom
    ml?: number;        // margin-left
    mr?: number;        // margin-right
  };
  content?: string;     // text content (for type: "text" nodes only)
  label?: string;       // label text (for catalog components)
  value?: string | number;  // value text (for stat/input components)
  placeholder?: string; // placeholder text (for input components)
  helper?: string;      // helper text below node
  title?: string;       // title text
  typography?: string;  // typography role (e.g., "heading-1", "body", "label")
  color?: string;       // semantic token name for text color
  weight?: number;      // font-weight override
  textAlign?: "left" | "center" | "right";
}

IMPORTANT — Prefer DesignSpec properties over CSS. The following are auto-aliased or stripped:
- display → auto-aliased to layout.display ("flex" or "grid")
- gridTemplateColumns → auto-aliased to layout.columns (extracts the number)
- flexWrap → auto-aliased to layout.wrap (boolean)
- marginLeft/Right/Top/Bottom → auto-aliased to layout.ml/mr/mt/mb
- position, top, left, right, bottom, zIndex → auto-aliased to overrides (use sparingly — prefer layout-based positioning)
- backgroundColor → use "background" instead
- borderRadius → use "radius" instead
- fontSize → use "typography" instead
- flexDirection → use layout.dir instead
- alignItems → use layout.align instead
- justifyContent → use layout.justify instead
- padding, paddingLeft, paddingRight, paddingTop, paddingBottom → use layout.px/py/pt/pb
- transform, margin (shorthand), style: { ... }, overflow, opacity → NOT supported, will be stripped

To center a container: set layout.align: "center" and layout.justify: "center" on its PARENT.
To push an element right in a row: set layout.justify: "space-between" on the PARENT container.
To constrain width: set width to a pixel number. To fill available space: set width to "fill".
For overlays/modals: use overrides with position: "fixed", top/left/zIndex as needed.

EXAMPLE:
{
  "patches": {
    "card-header": {
      "layout": { "dir": "row", "justify": "space-between", "align": "center", "px": 24, "py": 16, "gap": 12 }
    },
    "status-badge": {
      "width": null
    }
  },
  "reasoning": "Centered the card header content with space-between to push the badge right. Removed explicit width from badge so it sizes to its text content."
}

IMPORTANT: layout patches are deep-merged — you only need to include the layout properties you want to CHANGE.
Existing layout properties (dir, gap, px, py, align, justify) are preserved unless you explicitly set them.`;

// ─── Post-processing safety net ─────────────────────────────────────────────

/** CSS-to-DesignSpec alias map. Handles common LLM hallucinations. */
const ALIAS_MAP: Record<string, { target: string; transform?: (v: unknown) => unknown }> = {
  // CSS → DesignSpec property mappings
  backgroundColor: { target: 'background' },
  borderRadius: { target: 'radius' },
  borderColor: { target: 'border' },
  boxShadow: { target: 'shadow' },
  fontSize: { target: 'typography' },
  fontWeight: { target: 'weight' },
  // Layout-level aliases
  flexDirection: { target: 'layout.dir' },
  alignItems: { target: 'layout.align' },
  justifyContent: { target: 'layout.justify' },
  paddingLeft: { target: 'layout.px' },
  paddingRight: { target: 'layout.px' },
  paddingTop: { target: 'layout.py' },
  paddingBottom: { target: 'layout.py' },
  padding: { target: '__strip__' },
  gap: { target: 'layout.gap' },
  // Properties to silently strip (no DesignSpec equivalent)
  // Positioning → overrides (renderer reads from overrides.position/top/left/etc.)
  position: { target: 'overrides.position' },
  top: { target: 'overrides.top' },
  left: { target: 'overrides.left' },
  right: { target: 'overrides.right' },
  bottom: { target: 'overrides.bottom' },
  zIndex: { target: 'overrides.zIndex' },
  // Centering hints — renderer uses these for fixed/absolute centering
  positionX: { target: 'overrides.positionX' },
  positionY: { target: 'overrides.positionY' },
  transform: { target: '__strip__' },
  // Margins → layout spacing equivalents
  margin: { target: '__strip__' },
  marginLeft: { target: 'layout.ml' },
  marginRight: { target: 'layout.mr' },
  marginTop: { target: 'layout.mt' },
  marginBottom: { target: 'layout.mb' },
  style: { target: '__strip__' },
  display: {
    target: 'layout.display',
    transform: (v: unknown) => {
      const s = String(v);
      return s === 'grid' ? 'grid' : s === 'flex' ? 'flex' : undefined;
    },
  },
  gridTemplateColumns: {
    target: 'layout.columns',
    transform: (v: unknown) => {
      const match = /repeat\((\d+)/.exec(String(v));
      return match ? parseInt(match[1], 10) : undefined;
    },
  },
  grid_template_columns: {
    target: 'layout.columns',
    transform: (v: unknown) => {
      const match = /repeat\((\d+)/.exec(String(v));
      return match ? parseInt(match[1], 10) : undefined;
    },
  },
  flexWrap: {
    target: 'layout.wrap',
    transform: (v: unknown) => v === 'wrap' || v === true,
  },
  flex_wrap: {
    target: 'layout.wrap',
    transform: (v: unknown) => v === 'wrap' || v === true,
  },
  overflow: { target: '__strip__' },
  opacity: { target: '__strip__' },
};

/** Valid top-level NodeSpec property names (from design-spec-v2.ts). */
const VALID_NODE_KEYS = new Set([
  'parent', 'order', 'type', 'catalog',
  'label', 'content', 'value', 'placeholder', 'helper', 'title', 'options',
  'layout', 'width', 'height',
  'typography', 'color', 'weight', 'background', 'shadow', 'radius', 'textAlign',
  'overrides', 'items',
  'removeFields', // synthetic field for field deletion (handled in executeFixes)
]);

/** Valid LayoutSpec property names. */
const VALID_LAYOUT_KEYS = new Set([
  'dir', 'display', 'columns', 'wrap',
  'gap', 'align', 'justify',
  'px', 'py', 'pt', 'pb',
  'my', 'mx', 'mt', 'mb', 'ml', 'mr',
]);

// ─── Value validation maps (derived from design-spec-v2.ts) ─────────────────

const NUMERIC_FIELDS = new Set([
  'gap', 'px', 'py', 'pt', 'pb', 'mt', 'mb', 'ml', 'mr', 'my', 'mx',
  'order', 'weight', 'height', 'radius',
]);
const DIMENSION_FIELDS = new Set(['width']); // accepts number | 'fill'
const ENUM_FIELDS: Record<string, readonly string[]> = {
  type: ['page', 'container', 'section', 'header', 'divider', 'spacer', 'text'],
  textAlign: ['left', 'center', 'right'],
};
const LAYOUT_ENUM_FIELDS: Record<string, readonly string[]> = {
  dir: ['row', 'column'],
  display: ['flex', 'grid'],
  align: ['start', 'center', 'end', 'stretch'],
  justify: ['start', 'center', 'end', 'space-between'],
};
const STRING_FIELDS = new Set([
  'parent', 'catalog', 'label', 'content', 'placeholder', 'helper',
  'title', 'typography', 'color', 'background', 'shadow',
]);

/** Strip CSS unit suffixes and coerce to number. Returns NaN if not numeric.
 *  Only strips known absolute/relative CSS units — NOT % / vw / vh which
 *  indicate a fundamentally different sizing model.
 */
function coerceNumeric(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const stripped = v.replace(/\s*(px|rem|em|pt)$/i, '').trim();
    const n = Number(stripped);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * Validate and coerce values in a patch object. Strips invalid values.
 * Exported for testing.
 */
export function validatePatchValues(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const validated: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    // null means "remove this field" — always keep
    if (value === null) {
      validated[key] = null;
      continue;
    }

    // Layout sub-object — validate inner fields
    if (key === 'layout' && typeof value === 'object') {
      validated[key] = validateLayoutValues(value as Record<string, unknown>);
      continue;
    }

    // Numeric fields
    if (NUMERIC_FIELDS.has(key)) {
      const n = coerceNumeric(value);
      if (n !== null && !Number.isNaN(n)) {
        validated[key] = n;
      }
      // else strip
      continue;
    }

    // Dimension fields (number | 'fill')
    if (DIMENSION_FIELDS.has(key)) {
      if (value === 'fill') {
        validated[key] = value;
      } else {
        const n = coerceNumeric(value);
        if (n !== null && !Number.isNaN(n)) {
          validated[key] = n;
        }
        // else strip (e.g. "100%", "auto", "hug")
      }
      continue;
    }

    // Enum fields
    if (ENUM_FIELDS[key]) {
      if (typeof value === 'string' && (ENUM_FIELDS[key] as readonly string[]).includes(value)) {
        validated[key] = value;
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[sanitize] Stripped invalid enum value for "${key}": ${JSON.stringify(value)}`);
      }
      continue;
    }

    // String fields
    if (STRING_FIELDS.has(key)) {
      if (typeof value === 'string') {
        validated[key] = value;
      }
      // else strip
      continue;
    }

    // Everything else (removeFields, options, overrides, items, value, etc.) — pass through
    validated[key] = value;
  }

  return validated;
}

/** Validate layout sub-object values. */
function validateLayoutValues(layout: Record<string, unknown>): Record<string, unknown> {
  const validated: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(layout)) {
    if (value === null) continue; // null in layout means no change

    // Layout enum fields (dir, display, align, justify)
    if (LAYOUT_ENUM_FIELDS[key]) {
      if (typeof value === 'string' && (LAYOUT_ENUM_FIELDS[key] as readonly string[]).includes(value)) {
        validated[key] = value;
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[sanitize] Stripped invalid layout enum value for "${key}": ${JSON.stringify(value)}`);
      }
      continue;
    }

    // columns — positive integer only
    if (key === 'columns') {
      const n = coerceNumeric(value);
      if (n !== null && !Number.isNaN(n) && n > 0 && Number.isInteger(n)) {
        validated[key] = n;
      }
      continue;
    }

    // wrap — boolean coercion
    if (key === 'wrap') {
      validated[key] = value === true || value === 'wrap' || value === 'true';
      continue;
    }

    // Numeric layout fields (gap, px, py, etc.)
    if (NUMERIC_FIELDS.has(key)) {
      const n = coerceNumeric(value);
      if (n !== null && !Number.isNaN(n)) {
        validated[key] = n;
      }
      continue;
    }

    // Unknown layout key — pass through (sanitizeLayout already stripped invalid keys)
    validated[key] = value;
  }

  return validated;
}

/**
 * Sanitize LLM-generated patches by stripping invalid properties and
 * mapping common CSS aliases to their DesignSpec equivalents.
 * Exported for testing.
 */
export function sanitizePatches(
  patches: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const sanitized: Record<string, Record<string, unknown>> = {};

  for (const [nodeId, patch] of Object.entries(patches)) {
    const clean: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(patch)) {
      // Skip null values used as "no change" markers from constrained decoding
      if (value === null) {
        // Explicit null means "remove this property" — keep it
        clean[key] = null;
        continue;
      }

      if (VALID_NODE_KEYS.has(key)) {
        // Valid property — keep it (sanitize layout sub-object)
        if (key === 'layout' && typeof value === 'object' && value !== null) {
          clean[key] = sanitizeLayout(value as Record<string, unknown>);
        } else {
          clean[key] = value;
        }
      } else if (ALIAS_MAP[key]) {
        const alias = ALIAS_MAP[key];
        if (alias.target === '__strip__') continue;

        const transformed = alias.transform ? alias.transform(value) : value;
        if (alias.target.includes('.')) {
          const [parent, child] = alias.target.split('.');
          if (!clean[parent] || typeof clean[parent] !== 'object') {
            clean[parent] = {};
          }
          (clean[parent] as Record<string, unknown>)[child] = transformed;
        } else {
          clean[alias.target] = transformed;
        }
      }
      // Unknown and not in alias map — silently strip
    }

    // Validate values after key validation
    const validated = validatePatchValues(clean);

    // Strip null-only patches (all properties were null = no changes)
    const nonNullEntries = Object.entries(validated).filter(([, v]) => v !== null);
    if (nonNullEntries.length > 0) {
      sanitized[nodeId] = validated;
    }
  }

  return sanitized;
}

/** Strip invalid sub-properties from a layout object. */
function sanitizeLayout(layout: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(layout)) {
    if (VALID_LAYOUT_KEYS.has(key) && value !== null) {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Create a CorrectionAdapter for browser-based DesignSpec correction.
 */
export function createBrowserCorrectionAdapter(
  session: BrowserSession,
  currentSpec: SpecRef,
  provider: LLMProvider,
  domLayout: DOMLayoutData,
  userTags?: readonly UserFeedbackTag[],
  mechanicalIssues?: readonly MechanicalIssue[],
  tokens?: RendererTokens,
  catalog?: CatalogMap,
): CorrectionAdapter {
  return {
    async captureScreenshot(): Promise<Result<string>> {
      try {
        const result = await session.rerender(currentSpec.value);
        return Ok(result.screenshot.toString('base64'));
      } catch (error) {
        return Err({
          code: 'LLM_MALFORMED_OUTPUT',
          message: `Browser screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
          recoverable: true,
        });
      }
    },

    async executeFixes(
      issues: readonly DesignIssue[],
      screenshotBase64: string,
      correctionHistory: readonly CorrectionHistory[],
    ): Promise<Result<CorrectionFixResult>> {
      if (!isVisionLLMEnabled()) {
        return Ok({ fixed: 0, failed: 0, fixAttempts: [] });
      }

      // Re-extract DOM (layout may have changed)
      let currentDOM: DOMLayoutData;
      try {
        currentDOM = await session.extractDOM();
      } catch {
        currentDOM = domLayout; // Fall back to initial DOM
      }

      // Build abbreviated DOM data (nodeId, rect, scroll/client widths only)
      const domSummary: Record<string, { rect: DOMNodeLayout['rect']; scrollW: number; clientW: number; catalog: string | null }> = {};
      for (const [id, node] of Object.entries(currentDOM.nodes)) {
        domSummary[id] = {
          rect: node.rect,
          scrollW: node.scrollWidth,
          clientW: node.clientWidth,
          catalog: node.dataCatalog,
        };
      }

      // Build content blocks for the vision LLM
      const imageBlock: ContentBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: screenshotBase64,
        },
      };

      const domBlock: ContentBlock = {
        type: 'text',
        text: `DOM LAYOUT DATA:\n${JSON.stringify(domSummary, null, 2)}`,
      };

      const userTagsBlock: ContentBlock = {
        type: 'text',
        text: `USER FEEDBACK TAGS:\n${userTags && userTags.length > 0 ? JSON.stringify(userTags) : '(none)'}`,
      };

      const specBlock: ContentBlock = {
        type: 'text',
        text: `CURRENT DESIGNSPEC JSON:\n${JSON.stringify(currentSpec.value, null, 2)}`,
      };

      // Build issues + history + mechanical issues context
      const issuesSummary = issues
        .map(i => `- [${i.severity}] ${i.component}: ${i.description} (fix: ${i.fix})`)
        .join('\n');

      const historyContext = correctionHistory.length > 0
        ? `\nPREVIOUS ATTEMPTS:\n${correctionHistory.map(h =>
            `  Iteration ${h.iteration}: score ${h.score}, fixes: ${h.fixAttempts.map(f => `${f.issueComponent}:${f.stepsSucceeded}/${f.stepsAttempted}`).join(', ')}`,
          ).join('\n')}\n`
        : '';

      const mechanicalContext = mechanicalIssues && mechanicalIssues.length > 0
        ? `\nMECHANICAL ISSUES (detected programmatically, not auto-fixed):\n${mechanicalIssues.map(m => `- [${m.rule}] ${m.description}`).join('\n')}\n`
        : '';

      const issuesBlock: ContentBlock = {
        type: 'text',
        text: `EVALUATOR ISSUES:\n${issuesSummary}${historyContext}${mechanicalContext}`,
      };

      // Build dynamic context sections for tokens and catalog
      let tokenRefSection = '';
      if (tokens?.colors?.semantic) {
        const colorNames = Object.keys(tokens.colors.semantic).join(', ');
        const typoRoles = tokens.typography?.scale?.map((e: { role: string }) => e.role).join(', ') ?? '';
        const spacingVals = tokens.spacing?.scale?.join(', ') ?? '';
        tokenRefSection = `\n\nDESIGN TOKEN REFERENCE (use these names in patches, NOT hex values):\n- Semantic colors: ${colorNames}\n- Typography roles: ${typoRoles}\n- Spacing scale (px): ${spacingVals}`;
      }

      let catalogRefSection = '';
      if (catalog) {
        const usedIds = new Set<string>();
        for (const node of Object.values(currentSpec.value.nodes)) {
          const cat = (node as unknown as Record<string, unknown>).catalog;
          if (typeof cat === 'string') usedIds.add(cat);
        }
        if (usedIds.size > 0) {
          const lines: string[] = [];
          for (const id of usedIds) {
            const entry = catalog[id];
            if (!entry) continue;
            const fields = entry.required_fields?.join(', ') ?? '(none)';
            lines.push(`- ${id}: type=${entry.type ?? '?'}, required=[${fields}], bg=${entry.background ?? '?'}, text=${entry.text_color ?? '?'}`);
          }
          if (lines.length > 0) {
            catalogRefSection = `\n\nCATALOG COMPONENT ANATOMY (use correct fields on catalog nodes):\n${lines.join('\n')}`;
          }
        }
      }

      const effectiveSystemPrompt = VISION_FIX_SYSTEM_PROMPT + tokenRefSection + catalogRefSection;

      // Call vision LLM (no structured output — prompt + validation instead).
      // Claude's compilation limits (24 optional, 16 unions) are incompatible
      // with our sparse patch format. We rely on the system prompt for format
      // guidance and sanitizePatches() + validatePatchValues() for safety.
      const result = await provider.complete(
        {
          system: effectiveSystemPrompt,
          messages: [
            { role: 'user', content: [imageBlock, domBlock, userTagsBlock, specBlock, issuesBlock] },
          ],
        },
        {
          model: EVALUATOR_MODEL,
          maxTokens: 8000,
        },
      );

      if (!result.ok) {
        return Err({
          code: 'LLM_MALFORMED_OUTPUT' as const,
          message: `Vision fix LLM call failed: ${JSON.stringify(result.error)}`,
          recoverable: true,
        });
      }

      // Parse patches — accept both structured (defensive fallback) and text
      let patches: Record<string, Record<string, unknown>>;
      let reasoning: string;
      try {
        const structured = result.value.structured;
        let parsed: Record<string, unknown>;

        if (structured) {
          parsed = structured as Record<string, unknown>;
        } else {
          const content = result.value.content;
          const fenceMatch = /```json\s*\n?([\s\S]*?)```/.exec(content);
          const jsonStr = fenceMatch ? fenceMatch[1].trim() : content.trim();
          parsed = JSON.parse(jsonStr);
        }

        // Defensive unwrap: { response: { patches: ... } }
        if (parsed.response && typeof parsed.response === 'object' && !parsed.patches) {
          parsed = parsed.response as Record<string, unknown>;
        }

        reasoning = (parsed.reasoning as string) ?? '';
        let patchesRaw: Record<string, Record<string, unknown>> | undefined;

        if (Array.isArray(parsed.patches)) {
          // Array format: [{ nodeId: "...", ...patch }]
          patchesRaw = {};
          for (const entry of parsed.patches) {
            const { nodeId, ...rest } = entry as { nodeId?: string; [k: string]: unknown };
            if (nodeId) patchesRaw[nodeId] = rest;
          }
        } else if (parsed.patches && typeof parsed.patches === 'object') {
          // Object-map format: { "node-id": { ...patch } }
          patchesRaw = parsed.patches as Record<string, Record<string, unknown>>;
        } else if (typeof (parsed as any).patches_json === 'string') {
          patchesRaw = JSON.parse((parsed as any).patches_json);
        } else {
          // Heuristic: top-level keys might be node IDs (values are patch objects)
          const keys = Object.keys(parsed).filter(k => k !== 'reasoning');
          const looksLikePatchMap = keys.length > 0 && keys.every(k => {
            const v = parsed[k];
            return v && typeof v === 'object' && !Array.isArray(v);
          });
          if (looksLikePatchMap) {
            patchesRaw = {} as Record<string, Record<string, unknown>>;
            for (const k of keys) {
              patchesRaw[k] = parsed[k] as Record<string, unknown>;
            }
          }
        }

        patches = sanitizePatches(patchesRaw ?? {});
      } catch {
        return Err({
          code: 'LLM_MALFORMED_OUTPUT' as const,
          message: 'Could not parse patches from vision LLM output',
          recoverable: true,
        });
      }

      // Apply patches
      let fixedCount = 0;
      let failedCount = 0;
      const fixAttempts: FixAttemptRecord[] = [];

      for (const [nodeId, patch] of Object.entries(patches)) {
        const node = currentSpec.value.nodes[nodeId];
        if (!node) {
          failedCount++;
          fixAttempts.push({
            issueComponent: nodeId,
            issueDescription: `Patch for unknown node "${nodeId}"`,
            stepsAttempted: 1,
            stepsSucceeded: 0,
            stepsFailed: 1,
            stepsSkipped: 0,
          });
          continue;
        }

        // Shallow-merge patch into node
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nodeRecord = node as any;

        // Handle removeFields first
        const removeFields = (patch as any).removeFields;
        if (Array.isArray(removeFields)) {
          for (const field of removeFields) {
            if (typeof field === 'string') delete nodeRecord[field];
          }
        }

        for (const [key, value] of Object.entries(patch)) {
          if (key === 'removeFields') continue; // already handled
          if (value === null) {
            delete nodeRecord[key];
          } else if (key === 'layout' && typeof value === 'object' && typeof nodeRecord.layout === 'object' && nodeRecord.layout !== null) {
            nodeRecord.layout = { ...nodeRecord.layout, ...value };
          } else {
            nodeRecord[key] = value;
          }
        }

        fixedCount++;
        fixAttempts.push({
          issueComponent: nodeId,
          issueDescription: `Patched ${Object.keys(patch).join(', ')}`,
          stepsAttempted: 1,
          stepsSucceeded: 1,
          stepsFailed: 0,
          stepsSkipped: 0,
        });
      }

      // eslint-disable-next-line no-console
      if (reasoning) console.log(`        [vision-fix] ${reasoning}`);

      // Re-render with patched spec
      try {
        await session.rerender(currentSpec.value);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`        [vision-fix] Re-render after patches failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      return Ok({ fixed: fixedCount, failed: failedCount, fixAttempts });
    },
  };
}
