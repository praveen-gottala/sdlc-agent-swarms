/**
 * @module @agentforge/designspec-renderer/types/prototype-manifest
 *
 * Defines the PrototypeManifest — an app-level structure that links
 * multiple DesignSpecV2 screens into a navigable prototype with
 * LLM-inferred navigation bindings.
 */

/** A screen in the prototype, referencing a DesignSpecV2 JSON file. */
export interface PrototypeScreen {
  readonly screenId: string;
  readonly name: string;
  readonly route: string;
  readonly specPath: string;
  readonly isDefault?: boolean;
  /** Screen rendering mode. Derived from PageEntry.screen_type. */
  readonly screenType?: 'page' | 'modal' | 'drawer' | 'sheet';
}

/** A navigation binding between two screens, inferred by LLM. */
export interface NavigationBinding {
  readonly sourceNodeId: string;
  readonly sourceScreenId: string;
  readonly targetScreenId: string;
  readonly reason: string;
  /** Rendering mode: 'navigate' for full-page replacement, 'overlay' for modal/drawer/sheet. Derived from target's screenType. */
  readonly mode?: 'navigate' | 'overlay';
}

/** Manifest linking all screens in a prototype with navigation. */
export interface PrototypeManifest {
  readonly version: '1.0';
  readonly projectName: string;
  readonly screens: readonly PrototypeScreen[];
  readonly navigation: readonly NavigationBinding[];
}
