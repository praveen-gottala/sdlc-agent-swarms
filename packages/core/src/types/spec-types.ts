/**
 * @module @agentforge/core/types/spec
 *
 * Typed interfaces for the Living Spec YAML files
 * defined in PRD v2.0 Sections 5.2.1, 5.2.2, and 5.2.3.
 */

// ---------------------------------------------------------------------------
// 5.2.1 — Component Spec (components/<page>.yaml)
// ---------------------------------------------------------------------------

/**
 * A single prop definition within a component spec.
 */
export interface ComponentProp {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
}

/**
 * A single component entry within a component spec file.
 */
export interface ComponentEntry {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly design_ref: string;
  readonly props: readonly ComponentProp[];
  readonly data_source: string;
}

/**
 * Component spec file — one per page.
 * e.g. spec/components/dashboard.yaml
 */
export interface ComponentSpec {
  readonly version: string;
  readonly page_id: string;
  readonly last_updated_by: string;
  readonly components: readonly ComponentEntry[];
}

// ---------------------------------------------------------------------------
// 5.2.2 — API Spec (api.yaml)
// ---------------------------------------------------------------------------

/**
 * A query parameter definition within an API endpoint.
 */
export interface QueryParam {
  readonly name: string;
  readonly type: string;
  readonly format?: string;
}

/**
 * Response definition for an API endpoint.
 */
export interface EndpointResponse {
  readonly type: string;
  readonly schema_ref: string;
}

/**
 * A single endpoint entry within the API spec.
 */
export interface EndpointEntry {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly query_params: readonly QueryParam[];
  readonly response: EndpointResponse;
  readonly auth: string;
  readonly status: string;
}

/**
 * API spec file — spec/api.yaml
 */
export interface ApiSpec {
  readonly version: string;
  readonly base_url: string;
  readonly endpoints: readonly EndpointEntry[];
}

// ---------------------------------------------------------------------------
// 5.2.3 — Models Spec (models.yaml)
// ---------------------------------------------------------------------------

/**
 * A single field definition within a data model.
 */
export interface ModelField {
  readonly name: string;
  readonly type: string;
  readonly nullable?: boolean;
  readonly precision?: number;
  readonly scale?: number;
}

/**
 * A single model entry within the models spec.
 */
export interface ModelEntry {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly ModelField[];
  readonly db_table: string;
}

/**
 * Data model spec file — spec/models.yaml
 */
export interface ModelsSpec {
  readonly version: string;
  readonly models: readonly ModelEntry[];
}

// ---------------------------------------------------------------------------
// Pages Spec (pages.yaml)
// ---------------------------------------------------------------------------

/** A navigation target from one page to another. */
export interface NavigationTarget {
  /** Target page ID (must reference another PageEntry.id). */
  readonly target: string;
  /** Human-readable description of what triggers this navigation. */
  readonly trigger: string;
  /** Exact node ID in the DesignSpec that triggers this navigation. Set by user click in prototype view. */
  readonly source_node?: string;
}

/** Screen rendering mode. Determines viewport width and prototype overlay behavior. */
export type ScreenType = 'page' | 'modal' | 'drawer' | 'sheet';

/** A single page entry in the pages spec. */
export interface PageEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly route: string;
  readonly status: string;
  readonly components: readonly string[];
  readonly data_sources?: readonly string[];
  /** Target viewport widths for design generation. Defaults to [1440] (desktop). Uncomment 768 (tablet) or 390 (mobile) as needed. */
  readonly viewports?: readonly number[];
  /** Navigation targets from this page to other pages. Generated during spec generation, editable in dashboard. */
  readonly navigates_to?: readonly NavigationTarget[];
  /** Screen rendering mode. Defaults to 'page'. Overlays (modal/drawer/sheet) render on top of the current page in prototype mode. */
  readonly screen_type?: ScreenType;
}

/** Pages spec file — spec/pages.yaml */
export interface PagesSpec {
  readonly version: string;
  readonly pages: readonly PageEntry[];
}

// ---------------------------------------------------------------------------
// Page Context (structured context passed to UX agents)
// ---------------------------------------------------------------------------

/** Structured page context passed to UX agents for spec-driven design. */
export interface PageContext {
  readonly targetPage: PageEntry;
  readonly allPages: readonly PageEntry[];
  readonly models?: readonly ModelEntry[];
  readonly apiEndpoints?: readonly EndpointEntry[];
}
