import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRealFs } from '@agentforge/core';
import { artifactPath, loadCachedArtifact, saveCachedArtifact } from '../cache.js';

describe('design-pipeline cache helpers', () => {
  it('writes raw DesignSpecV2 to designspec-v2.json (not wrapped DesignOutput)', () => {
    const fs = createRealFs();
    const projectRoot = mkdtempSync(join(tmpdir(), 'pipeline-cache-'));
    const moduleId = 'page-1';
    const designOutput = {
      spec: {
        screen: 'page-1',
        width: 1440,
        nodes: {
          root: { type: 'frame', parent: null, order: 0 },
        },
      },
      designToolMetadata: { tool: 'browser' as const },
    };

    saveCachedArtifact(fs, projectRoot, moduleId, 'designSpecV2', designOutput);
    const path = artifactPath(projectRoot, moduleId, 'designSpecV2');
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;

    expect(parsed.nodes).toBeDefined();
    expect(parsed.spec).toBeUndefined();
  });

  it('loads raw DesignSpecV2 cache as wrapped DesignOutput for pipeline state', () => {
    const fs = createRealFs();
    const projectRoot = mkdtempSync(join(tmpdir(), 'pipeline-cache-'));
    const moduleId = 'page-2';
    const rawSpec = {
      screen: 'page-2',
      width: 390,
      nodes: {
        root: { type: 'frame', parent: null, order: 0 },
      },
    };

    saveCachedArtifact(fs, projectRoot, moduleId, 'designSpecV2', rawSpec);
    const loaded = loadCachedArtifact(fs, projectRoot, moduleId, 'designSpecV2') as Record<string, unknown>;

    expect(loaded.spec).toEqual(rawSpec);
  });

  it('preserves legacy wrapped DesignOutput shape on load', () => {
    const fs = createRealFs();
    const projectRoot = mkdtempSync(join(tmpdir(), 'pipeline-cache-'));
    const moduleId = 'page-3';
    const legacyWrapped = {
      spec: {
        screen: 'page-3',
        width: 1440,
        nodes: {
          root: { type: 'frame', parent: null, order: 0 },
        },
      },
      designToolMetadata: {
        tool: 'penpot' as const,
        script: 'penpot-script',
      },
    };

    // Write directly to emulate old on-disk shape.
    const path = artifactPath(projectRoot, moduleId, 'designSpecV2');
    mkdirSync(join(projectRoot, '.agentforge/previews', moduleId, 'scripts'), { recursive: true });
    writeFileSync(path, JSON.stringify(legacyWrapped, null, 2));

    const loaded = loadCachedArtifact(fs, projectRoot, moduleId, 'designSpecV2') as Record<string, unknown>;
    expect(loaded).toEqual(legacyWrapped);
  });
});
