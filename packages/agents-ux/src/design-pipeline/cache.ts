/**
 * @module design-pipeline/cache
 *
 * Cache helpers for pipeline artifact persistence.
 * Uses agentContext.fs exclusively — no fallback to Node fs.
 */

import { join } from 'node:path';
import { PREVIEW_DIR_REL, PIPELINE_ARTIFACTS } from '@agentforge/core';
import { migrateResearchArtifact, migratePlanningArtifact } from '@agentforge/core';
import type { FileSystem } from '@agentforge/core';
import { UXResearchOutputSchema } from '../schemas.js';
import { UXPlanningOutputSchema } from '../schemas.js';

type ArtifactName = keyof typeof PIPELINE_ARTIFACTS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/** Resolve the cache directory for a module's pipeline artifacts. */
export function artifactDir(projectRoot: string, moduleId: string): string {
  return join(projectRoot, PREVIEW_DIR_REL, moduleId);
}

/** Resolve the full path for a specific cached artifact. */
export function artifactPath(projectRoot: string, moduleId: string, artifact: ArtifactName): string {
  return join(artifactDir(projectRoot, moduleId), PIPELINE_ARTIFACTS[artifact]);
}

/**
 * Load a cached artifact from disk, handling legacy shapes.
 *
 * Handles four shapes (O1):
 * 1. Canonical typed output — use directly
 * 2. Phase 0.4 shallow wrapper (_migrated: true) — use directly
 * 3. Legacy { brief: string } / { spec: string } — wrap via migrateXxxArtifact
 * 4. Cache miss (file doesn't exist or is corrupted) — return undefined
 */
export function loadCachedArtifact(
  fs: FileSystem,
  projectRoot: string,
  moduleId: string,
  artifact: ArtifactName,
): unknown | undefined {
  const path = artifactPath(projectRoot, moduleId, artifact);
  const readResult = fs.readFile(path);
  if (!readResult.ok) return undefined;

  try {
    const parsed = JSON.parse(readResult.value);

    if (artifact === 'researchBrief') {
      const migrated = migrateResearchArtifact(moduleId, parsed);
      const validated = UXResearchOutputSchema.passthrough().safeParse(migrated);
      return validated.success ? validated.data : undefined;
    }
    if (artifact === 'planningSpec') {
      const migrated = migratePlanningArtifact(moduleId, parsed);
      const validated = UXPlanningOutputSchema.passthrough().safeParse(migrated);
      return validated.success ? validated.data : undefined;
    }
    if (artifact === 'designSpecV2') {
      // Canonical on-disk shape is raw DesignSpecV2.
      // Backward compatibility: older runs may have cached DesignOutput ({ spec, designToolMetadata }).
      if (isRecord(parsed) && isRecord(parsed.spec)) return parsed;
      if (isRecord(parsed)) return { spec: parsed };
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/** Save a pipeline artifact to disk. */
export function saveCachedArtifact(
  fs: FileSystem,
  projectRoot: string,
  moduleId: string,
  artifact: ArtifactName,
  data: unknown,
): void {
  const dir = artifactDir(projectRoot, moduleId);
  const path = artifactPath(projectRoot, moduleId, artifact);

  // Ensure parent directory exists (handles nested paths like scripts/designspec-v2.json)
  const pathParts = PIPELINE_ARTIFACTS[artifact].split('/');
  const parentDir = pathParts.length > 1 ? join(dir, ...pathParts.slice(0, -1)) : dir;
  fs.mkdir(parentDir);
  const payload =
    artifact === 'designSpecV2' && isRecord(data) && isRecord(data.spec)
      ? data.spec
      : data;
  fs.writeFile(path, JSON.stringify(payload, null, 2));
}
