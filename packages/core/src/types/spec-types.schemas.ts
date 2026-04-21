/**
 * @module @agentforge/core/types/spec-types.schemas
 *
 * Zod schemas that mirror the TypeScript interfaces in spec-types.ts.
 * These enable runtime validation of Living Spec YAML files.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 5.2.1 — Component Spec
// ---------------------------------------------------------------------------

export const ComponentPropSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
});

export const ComponentEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string(),
  design_ref: z.string(),
  props: z.array(ComponentPropSchema),
  data_source: z.string(),
});

export const ComponentSpecSchema = z.object({
  version: z.string(),
  page_id: z.string(),
  last_updated_by: z.string(),
  components: z.array(ComponentEntrySchema),
});

// ---------------------------------------------------------------------------
// 5.2.2 — API Spec
// ---------------------------------------------------------------------------

export const QueryParamSchema = z.object({
  name: z.string(),
  type: z.string(),
  format: z.string().optional(),
});

export const EndpointResponseSchema = z.object({
  type: z.string(),
  schema_ref: z.string(),
});

export const EndpointEntrySchema = z.object({
  id: z.string(),
  method: z.string(),
  path: z.string(),
  query_params: z.array(QueryParamSchema),
  response: EndpointResponseSchema,
  auth: z.string(),
  status: z.string(),
});

export const ApiSpecSchema = z.object({
  version: z.string(),
  base_url: z.string(),
  endpoints: z.array(EndpointEntrySchema),
});

// ---------------------------------------------------------------------------
// 5.2.3 — Models Spec
// ---------------------------------------------------------------------------

export const ModelFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().optional(),
  precision: z.number().optional(),
  scale: z.number().optional(),
});

export const ModelEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(ModelFieldSchema),
  db_table: z.string(),
});

export const ModelsSpecSchema = z.object({
  version: z.string(),
  models: z.array(ModelEntrySchema),
});

// ---------------------------------------------------------------------------
// Pages Spec
// ---------------------------------------------------------------------------

export const NavigationTargetSchema = z.object({
  target: z.string(),
  trigger: z.string(),
  source_node: z.string().optional(),
});

export const ScreenTypeSchema = z.enum(['page', 'modal', 'drawer', 'sheet']);

export const PageEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  route: z.string(),
  status: z.string(),
  components: z.array(z.string()),
  data_sources: z.array(z.string()).optional(),
  viewports: z.array(z.number()).optional(),
  navigates_to: z.array(NavigationTargetSchema).optional(),
  screen_type: ScreenTypeSchema.optional(),
});

export const PagesSpecSchema = z.object({
  version: z.string(),
  pages: z.array(PageEntrySchema),
});

// ---------------------------------------------------------------------------
// Page Context
// ---------------------------------------------------------------------------

export const PageContextSchema = z.object({
  targetPage: PageEntrySchema,
  allPages: z.array(PageEntrySchema),
  models: z.array(ModelEntrySchema).optional(),
  apiEndpoints: z.array(EndpointEntrySchema).optional(),
});
