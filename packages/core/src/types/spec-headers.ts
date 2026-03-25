/**
 * @module @agentforge/core/types/spec-headers
 *
 * Central registry of schema comment headers for on-demand spec files.
 * These headers are prepended when an agent creates a spec file for the
 * first time, giving downstream agents schema context.
 */

/** Schema comment headers keyed by spec file basename (without .yaml). */
export const SPEC_SCHEMA_HEADERS: Readonly<Record<string, string>> = {
  pages:
    '# pages.yaml — created on-demand, not by init\n# schema: { version, pages: [{ id, name, description, route, status, components[], data_sources[], viewports?[] }] }',
  api:
    '# api.yaml — created on-demand, not by init\n# schema: { version, base_url, endpoints: [{ id, method, path, description, auth, status }] }',
  models:
    '# models.yaml — created on-demand, not by init\n# schema: { version, models: [{ id, name, fields: [{ name, type }], db_table }] }',
};
