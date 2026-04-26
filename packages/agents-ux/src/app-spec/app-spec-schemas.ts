/**
 * @module @agentforge/agents-ux/app-spec
 *
 * Zod schemas for LLM-generated app specifications (pages, models, endpoints).
 * Field names match core's spec-types.ts (snake_case throughout).
 */

import { z } from 'zod';

const ScreenTypeSchema = z.enum(['page', 'modal', 'drawer', 'sheet']).default('page');

const NavigationTargetSchema = z.object({
  target: z.string(),
  trigger: z.string(),
});

export const GeneratedPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  route: z.string(),
  components: z.array(z.string()),
  data_sources: z.array(z.string()).default([]),
  viewports: z.array(z.number()).optional(),
  navigates_to: z.array(NavigationTargetSchema).optional(),
  screen_type: ScreenTypeSchema,
});

export const GeneratedModelFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().optional(),
});

export const GeneratedModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(GeneratedModelFieldSchema).min(1),
  db_table: z.string(),
});

export const GeneratedEndpointSchema = z.object({
  id: z.string(),
  method: z.string(),
  path: z.string(),
  description: z.string(),
  query_params: z.array(z.object({ name: z.string(), type: z.string() })).default([]),
  response: z.object({ type: z.string(), schema_ref: z.string() }),
  auth: z.string().default('none'),
});

export const GeneratedAppSpecSchema = z.object({
  pages: z.array(GeneratedPageSchema).min(1),
  models: z.array(GeneratedModelSchema).min(1),
  endpoints: z.array(GeneratedEndpointSchema).min(1),
});

export type GeneratedPage = z.infer<typeof GeneratedPageSchema>;
export type GeneratedModel = z.infer<typeof GeneratedModelSchema>;
export type GeneratedEndpoint = z.infer<typeof GeneratedEndpointSchema>;
export type GeneratedAppSpec = z.infer<typeof GeneratedAppSpecSchema>;
