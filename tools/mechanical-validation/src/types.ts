// ── DesignSpec types (mirrors the actual schema) ──────────────────────

export interface DesignSpecLayout {
  dir?: "row" | "column";
  gap?: number;
  align?: "flex-start" | "center" | "flex-end" | "stretch";
  justify?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around";
  px?: number;
  py?: number;
}

export interface DesignSpecNode {
  parent: string | null;
  order: number;
  type?: "page" | "header" | "container" | "section" | "text" | "divider";
  catalog?: string;
  width?: number | "fill";
  height?: number;
  radius?: number;
  background?: string;
  border?: string;
  shadow?: string;
  layout?: DesignSpecLayout;
  // text-specific
  content?: string;
  typography?: string;
  color?: string;
  weight?: number;
  // catalog-specific
  label?: string;
  value?: string;
}

export interface DesignSpec {
  screen: string;
  width: number;
  nodes: Record<string, DesignSpecNode>;
}

// ── DOM extraction types ──────────────────────────────────────────────

export interface DOMRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DOMNodeData {
  nodeId: string;
  tagName: string;
  rect: DOMRect;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  computedStyles: {
    display: string;
    flexDirection: string;
    overflow: string;
    visibility: string;
  };
  textContent: string;
  childCount: number;
  parentNodeId: string | null;
  dataCatalog: string | null; // from data-catalog attribute — identifies badge/chip/button
}

// ── Checker types ─────────────────────────────────────────────────────

export type CheckCategory =
  | "sibling-overlap"
  | "child-overflow"
  | "zero-collapse"
  | "text-clipping"
  | "badge-oversized";

export interface CheckViolation {
  nodeId: string;
  check: CheckCategory;
  severity: "error" | "warning";
  message: string;
  details: Record<string, unknown>;
}

// ── Harness types ─────────────────────────────────────────────────────

export type PromptCategory =
  | "sibling-overlap"
  | "child-overflow"
  | "text-clipping"
  | "badge-oversized"
  | "zero-collapse";

export interface PromptSpec {
  id: string;
  category: PromptCategory;
  bias: string;          // human-readable description of what we're pushing toward
  systemSuffix: string;  // appended to the base system prompt
}

export interface TestCaseResult {
  id: string;
  category: PromptCategory;
  bias: string;
  generated: boolean;
  valid: boolean;
  nodeCount: number;
  renderSuccess: boolean;
  violations: CheckViolation[];
  screenshotPath: string | null;
  inputPath: string;
  domDataPath: string | null;
  error?: string;
}

export interface RunSummary {
  runId: string;
  timestamp: string;
  totalCases: number;
  generated: number;
  valid: number;
  rendered: number;
  violationsByCategory: Record<CheckCategory, number>;
  cases: TestCaseResult[];
}

// ── Token resolution ──────────────────────────────────────────────────

export const SEMANTIC_TOKENS: Record<string, string> = {
  "background-primary": "#0F172A",
  "surface-primary": "#1E293B",
  "surface-elevated": "#293548",
  "surface-secondary": "#0F172A",
  "surface-input": "#0F172A",
  "text-primary": "#CBD5E1",
  "text-secondary": "#64748B",
  "text-disabled": "#64748B",
  "text-on-cta": "#0F172A",
  "cta-primary": "#F59E0B",
  "cta-hover": "#D97706",
  "border-default": "#334155",
  "border-focus": "#F59E0B",
  "border-error": "#F87171",
  "error": "#F87171",
  "success": "#14B8A6",
  "warning": "#F59E0B",
  "info": "#38BDF8",
  "overlay": "rgba(0,0,0,0.65)",
};

export const TYPOGRAPHY: Record<string, { size: number; weight: number; lineHeight: number; family: string }> = {
  "heading-1": { size: 24, weight: 700, lineHeight: 1.3, family: "'DM Sans', sans-serif" },
  "heading-2": { size: 16, weight: 600, lineHeight: 1.4, family: "'DM Sans', sans-serif" },
  "heading-3": { size: 15, weight: 500, lineHeight: 1.4, family: "'DM Sans', sans-serif" },
  "body":      { size: 14, weight: 400, lineHeight: 1.6, family: "'DM Mono', monospace" },
  "label":     { size: 12, weight: 500, lineHeight: 1.4, family: "'DM Mono', monospace" },
  "small":     { size: 11, weight: 400, lineHeight: 1.4, family: "'DM Mono', monospace" },
};

export const SHADOW: Record<string, string> = {
  sm: "0 1px 4px rgba(0,0,0,0.3)",
  md: "0 4px 16px rgba(0,0,0,0.4)",
  lg: "0 12px 32px rgba(0,0,0,0.5)",
};

// Valid catalog names the LLM can reference
export const VALID_CATALOG = [
  "button-primary", "button-secondary", "button-destructive",
  "badge", "badge-success", "badge-warning", "badge-error", "badge-info",
  "avatar", "chip",
  "stat", "search-input", "pagination", "progress-bar-active",
] as const;
