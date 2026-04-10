/**
 * @module @agentforge/designspec-renderer/extraction/types
 *
 * Types for the brownfield import source intelligence pipeline.
 * These types represent the deterministic analysis of an existing
 * React application's source code.
 */

/** Supported React meta-frameworks. */
export type Framework = 'nextjs-app' | 'nextjs-pages' | 'vite' | 'cra' | 'remix' | 'unknown';

/** Supported component libraries (matches AgentForge presets). */
export type ComponentLibraryId = 'shadcn' | 'mui' | 'chakra' | 'antd' | 'radix' | 'mantine' | 'unknown';

/** Styling approach used by the app. */
export type StylingApproach = 'tailwind-v4' | 'tailwind-v3' | 'css-modules' | 'css-in-js' | 'plain-css' | 'unknown';

/** Detected stack from package.json analysis. */
export interface DetectedStack {
  readonly framework: Framework;
  readonly componentLibrary: ComponentLibraryId;
  readonly styling: StylingApproach;
  readonly typescript: boolean;
  readonly packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
}

/** A discovered route in the application. */
export interface RouteInfo {
  readonly id: string;
  readonly route: string;
  readonly filePath: string;
  readonly name: string;
}

/** Component usage entry from import scanning. */
export interface ComponentUsage {
  readonly componentName: string;
  readonly importPath: string;
  readonly fileCount: number;
  readonly files: readonly string[];
}

/** Extracted CSS custom property. */
export interface CSSVariable {
  readonly name: string;
  readonly value: string;
  readonly scope: ':root' | '.dark' | string;
}

/** Complete source intelligence output — Phase 1 result. */
export interface SourceIntelligence {
  readonly stack: DetectedStack;
  readonly routes: readonly RouteInfo[];
  readonly componentUsage: readonly ComponentUsage[];
  readonly cssVariables: readonly CSSVariable[];
  readonly appRoot: string;
}
