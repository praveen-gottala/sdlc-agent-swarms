// Shared types for UX dashboard agents

/** Node in a component decomposition tree. */
export interface ComponentTreeNode {
  readonly name: string;
  readonly props: readonly string[];
  readonly children: readonly ComponentTreeNode[];
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

/** A single issue found during UX review. */
export interface ReviewIssue {
  readonly severity: 'critical' | 'major' | 'minor';
  readonly category: 'accessibility' | 'design_system' | 'visual_fidelity';
  readonly description: string;
  readonly fix: string;
  readonly requirementId?: string;
}
