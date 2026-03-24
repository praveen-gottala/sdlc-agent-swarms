// Shared types for UX dashboard agents

/** Node in a component decomposition tree. */
export interface ComponentTreeNode {
  readonly name: string;
  readonly props: readonly string[];
  readonly children: readonly ComponentTreeNode[];
  /** Concrete default values for sizing props (padding, gap, columns, cardHeight, etc.). */
  readonly defaultValues?: Readonly<Record<string, number | string>>;
}

/** Responsive behavior rule for a breakpoint. */
export interface ResponsiveRule {
  readonly breakpoint: string;
  readonly behavior: string;
}

/** One stage in the 4-stage implementation pattern. */
export interface ImplementationStage {
  readonly stage: 'layout' | 'theme' | 'animation' | 'implementation';
  readonly tasks: readonly string[];
}

/** A single step for creating or modifying Figma design via TalkToFigma MCP. */
export interface FigmaCreationStep {
  readonly tool: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly componentRef: string;
  readonly description: string;
}

/** Result of a successful screenshot capture (shared between Figma and Penpot). */
export interface ScreenshotResult {
  readonly imageUrl: string;
  readonly base64: string;
}

/** Captured visual snapshot of a single design component (tool-agnostic). */
export interface ComponentSnapshot {
  /** Design tool node ID (e.g. "54:46" for Figma, "uuid" for Penpot). */
  readonly nodeId: string;
  /** Component name from the planning spec (e.g. "GameHomeLayout"). */
  readonly name: string;
  /** Node type (FRAME, TEXT, RECTANGLE, etc.). */
  readonly nodeType?: string;
  /** Relative path to the PNG screenshot file (e.g. "screenshots/figma/GameHomeLayout.png"). */
  readonly screenshotPath?: string;
  /** Extracted properties from the design tool (styles, layout, text content, etc.). */
  readonly properties?: Readonly<Record<string, unknown>>;
}

/** Design snapshot metadata — shared between Figma and Penpot output types. */
export interface DesignSnapshotData {
  /**
   * Relative path to the full-page screenshot PNG (e.g. "screenshots/figma/root.png").
   * Captured after design + corrections are complete.
   */
  readonly screenshotPath?: string;
  /**
   * Per-component snapshots with extracted styles and screenshot paths.
   * Makes the artifact self-contained — developers can inspect
   * the design without Figma access.
   */
  readonly componentSnapshots?: readonly ComponentSnapshot[];
}

/** A logical screen/page in the application. */
export interface ScreenDefinition {
  readonly screenId: string;
  readonly name: string;
  /** Top-level componentTree names belonging to this screen. */
  readonly componentNames: readonly string[];
  readonly route?: string;
}

/** Per-screen design result metadata. */
export interface PerScreenResult {
  readonly screenId: string;
  readonly screenName: string;
  readonly rootNodeId: string;
  readonly nodeIds: Readonly<Record<string, string>>;
  readonly steps: readonly FigmaCreationStep[];
  readonly correctionScore?: number;
}

/** A single issue found during UX review. */
export interface ReviewIssue {
  readonly severity: 'critical' | 'major' | 'minor';
  readonly category: 'accessibility' | 'design_system' | 'visual_fidelity';
  readonly description: string;
  readonly fix: string;
  readonly requirementId?: string;
}
