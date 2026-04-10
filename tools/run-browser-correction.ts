/**
 * Runner script for runBrowserCorrectionPipeline.
 *
 * Usage:
 *   npx tsx tools/run-browser-correction.ts
 *
 * Requires ANTHROPIC_API_KEY env var.
 */
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { runBrowserCorrectionPipeline } from '@agentforge/agents-ux';
import { loadCatalogForRenderer } from '@agentforge/designspec-renderer';
import { createClaudeProvider, resolveClaudeAuth, authResultToProviderConfig } from '@agentforge/providers';
import type { DesignSpecV2, RendererTokens } from '@agentforge/designspec-renderer';

const SPEC_PATH = 'personal-expense-tracker/.agentforge/previews/dashboard/scripts/designspec-v2.json';
const TOKENS_PATH = 'personal-expense-tracker/agentforge/spec/design-tokens.yaml';
const CATALOG_PATH = 'personal-expense-tracker/agentforge/spec/component-catalog.yaml';

async function main() {
  // 1. Load spec
  const spec: DesignSpecV2 = JSON.parse(readFileSync(SPEC_PATH, 'utf-8'));
  console.log(`Spec: "${spec.screen}", ${Object.keys(spec.nodes).length} nodes, width=${spec.width}`);

  // 2. Load tokens (YAML → strip version/created_by → RendererTokens)
  const rawTokens = parseYaml(readFileSync(TOKENS_PATH, 'utf-8'));
  const { version: _v, created_by: _c, ...tokens } = rawTokens as Record<string, unknown>;
  console.log(`Tokens loaded from ${TOKENS_PATH}`);

  // 3. Load catalog (YAML → loadCatalogForRenderer merges with builtins)
  const rawCatalog = parseYaml(readFileSync(CATALOG_PATH, 'utf-8'));
  const catalog = loadCatalogForRenderer(rawCatalog, tokens as RendererTokens);
  console.log(`Catalog: ${Object.keys(catalog).length} entries`);

  // 4. Create LLM provider (supports both API key and Vertex AI)
  const claudeAuth = resolveClaudeAuth();
  if (!claudeAuth) {
    console.error('ERROR: No Claude auth found. Set ANTHROPIC_API_KEY or configure Vertex AI (ANTHROPIC_VERTEX_PROJECT_ID + CLOUD_ML_REGION).');
    process.exit(1);
  }
  const provider = createClaudeProvider('claude-sonnet-4-6', authResultToProviderConfig(claudeAuth));
  const outDir = 'personal-expense-tracker/.agentforge/previews/dashboard/scripts';

  // 5. Run the pipeline
  console.log('\nStarting browser correction pipeline...\n');
  const result = await runBrowserCorrectionPipeline(
    spec,
    tokens as RendererTokens,
    catalog,
    provider,
    {
      maxCorrections: 3,
      qualityThreshold: 80,
      interactive: true,
      mechanicalFixes: true,
      width: spec.width ?? 1440,
      outputDir: `${outDir}/iterations`,
    },
  );

  // 6. Report results
  console.log('\n=== Pipeline Results ===');
  console.log(`  Final score: ${result.finalScore}`);
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Threshold met: ${result.thresholdMet}`);
  if (result.mechanicalResults) {
    console.log(`  Mechanical fixes: ${result.mechanicalResults.appliedFixes.length} applied, accepted=${result.mechanicalResults.accepted}`);
  }
  if (result.userTags && result.userTags.length > 0) {
    console.log(`  User tags: ${result.userTags.length}`);
    for (const tag of result.userTags) {
      console.log(`    - ${tag.nodeId}: ${tag.feedback}`);
    }
  }
  console.log(`  Screenshot: ${result.screenshot.length} bytes`);
  console.log(`  HTML: ${result.html.length} chars`);

  // 7. Write outputs
  const { writeFileSync } = await import('fs');

  const specChanged = result.iterations > 0 && JSON.stringify(result.spec) !== JSON.stringify(spec);
  if (specChanged) {
    writeFileSync(`${outDir}/corrected-spec.json`, JSON.stringify(result.spec, null, 2));
    console.log(`\n  Corrected spec → ${outDir}/corrected-spec.json`);
  } else {
    console.log('\n  No corrections applied — spec unchanged, skipping output write');
  }
  // Always write screenshot (captures the final rendered state)
  writeFileSync(`${outDir}/corrected-screenshot.png`, result.screenshot);
  console.log(`  Screenshot → ${outDir}/corrected-screenshot.png`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
