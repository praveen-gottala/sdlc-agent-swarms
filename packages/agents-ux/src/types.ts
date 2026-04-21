// Shared types for UX dashboard agents

/** Node in a component decomposition tree. */
export interface ComponentTreeNode {
  readonly name: string;
  readonly props: readonly string[];
  readonly children: readonly ComponentTreeNode[];
  /** Concrete default values for sizing props (padding, gap, columns, cardHeight, etc.). */
  readonly defaultValues?: Readonly<Record<string, number | string>>;
  /** Target page ID this component navigates to when activated. */
  readonly navigateTo?: string;
}

/** Responsive behavior rule for a breakpoint. */
export interface ResponsiveRule {
  readonly breakpoint: string;
  readonly behavior: string;
  /** Viewport width in pixels (e.g., 375, 768, 1440). */
  readonly width?: number;
  /** Layout strategy at this breakpoint (e.g., "single-column", "two-column"). */
  readonly layout?: string;
  /** Specific changes at this breakpoint (e.g., ["stack cards vertically", "hide sidebar"]). */
  readonly changes?: readonly string[];
}

/** One stage in the 4-stage implementation pattern. */
export interface ImplementationStage {
  readonly stage: 'layout' | 'theme' | 'animation' | 'implementation';
  readonly tasks: readonly string[];
}

/**
 * Tool-agnostic design output used by the feedback loop and collaboration session.
 * Both PenpotDesignOutput and any future design tool output extend DesignSnapshotData
 * and satisfy this interface.
 */
export interface UXDesignOutput extends DesignSnapshotData {
  readonly moduleId: string;
  readonly breakpoints: readonly string[];
  /** Tool-specific node ID map (component name → design tool ID). */
  readonly [key: string]: unknown;
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

/** A single issue found during UX review. */
export interface ReviewIssue {
  readonly severity: 'critical' | 'major' | 'minor';
  readonly category: 'accessibility' | 'design_system' | 'visual_fidelity';
  readonly description: string;
  readonly fix: string;
  readonly requirementId?: string;
}
