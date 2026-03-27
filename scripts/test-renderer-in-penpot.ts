/**
 * Developer utility: render a DesignSpecV2 JSON into a Penpot script.
 *
 * Usage:
 *   npx tsx scripts/test-renderer-in-penpot.ts --project-dir split-easy --spec bill-entry
 *   npx tsx scripts/test-renderer-in-penpot.ts --project-dir split-easy --spec ./my-spec.json
 *   npx tsx scripts/test-renderer-in-penpot.ts --project-dir split-easy --spec bill-entry --replay-dir split-easy
 *
 * Required:
 *   --project-dir <dir>    Project directory (loads tokens + catalog)
 *   --spec <name-or-path>  DesignSpecV2 JSON fixture name or file path
 *
 * Optional:
 *   --replay-dir <dir>     Output dir for replay (default: --project-dir value)
*No cached research output found
 * Without --spec, lists available fixtures and exits.
 *
 * Then replay in Penpot:
 *   cd <replay-dir>
 *   npx agentforge design:penpot "<screen name>" --stage replay
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, isAbsolute, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
    renderToScript,
    loadCatalogForRenderer,
    type DesignSpecV2,
    type RendererTokens,
    type RawCatalogSpec,
} from '../packages/designspec-renderer/src/index.js';
/* ------------------------------------------------------------------ */
/*  Parse args                                                         */
/* ------------------------------------------------------------------ */
const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : undefined;
}

const projectDir = getFlag('--project-dir');
const specArg = getFlag('--spec');
const replayDir = getFlag('--replay-dir');

const FIXTURES_DIR = join(__dirname, '../packages/designspec-renderer/__tests__/fixtures/test-app-splitwise');

if (!projectDir) {
    console.error(
        'Error: --project-dir is required.\n\n' +
        'Usage: npx tsx scripts/test-renderer-in-penpot.ts --project-dir <dir> --spec <name-or-path>\n\n' +
        'Required:\n' +
        '  --project-dir <dir>    Project directory (loads tokens + catalog)\n' +
        '  --spec <name-or-path>  DesignSpecV2 JSON fixture name or file path\n\n' +
        'Optional:\n' +
        '  --replay-dir <dir>     Output dir for replay (default: --project-dir value)',
    );
    process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Resolve spec fixture                                               */
/* ------------------------------------------------------------------ */
if (!specArg) {
    console.log('No --spec provided. Available fixtures:');
    if (existsSync(FIXTURES_DIR)) {
        readdirSync(FIXTURES_DIR)
            .filter(f => f.endsWith('.json'))
            .forEach(f => console.log(`  ${f.replace('.json', '')}`));
    } else {
        console.log('  (no fixtures directory found)');
    }
    process.exit(0);
}

let fixturePath: string;
let fixtureName: string;

// If specArg looks like a file path (has extension or path separator), treat as path
if (extname(specArg) === '.json' || specArg.includes('/') || specArg.includes('\\')) {
    fixturePath = isAbsolute(specArg) ? specArg : join(process.cwd(), specArg);
    // Derive fixture name from filename
    const base = fixturePath.split('/').pop() ?? specArg;
    fixtureName = base.replace('.json', '');
} else {
    // Treat as fixture name — look up from __tests__/fixtures/
    fixturePath = join(FIXTURES_DIR, `${specArg}.json`);
    fixtureName = specArg;
}

if (!existsSync(fixturePath)) {
    console.error(`Spec not found: ${fixturePath}`);
    if (!specArg.includes('/') && !specArg.includes('\\')) {
        console.error('\nAvailable fixtures:');
        if (existsSync(FIXTURES_DIR)) {
            readdirSync(FIXTURES_DIR)
                .filter(f => f.endsWith('.json'))
                .forEach(f => console.error(`  ${f.replace('.json', '')}`));
        }
    }
    process.exit(1);
}

const spec: DesignSpecV2 = JSON.parse(readFileSync(fixturePath, 'utf-8'));
console.log(`Spec: ${fixturePath}`);

/* ------------------------------------------------------------------ */
/*  Load tokens + catalog from --project-dir                           */
/* ------------------------------------------------------------------ */
const projectRoot = join(__dirname, '..', projectDir);
const tokensPath = join(projectRoot, 'agentforge/spec/design-tokens.yaml');
const catalogPath = join(projectRoot, 'agentforge/spec/component-catalog.yaml');

if (!existsSync(tokensPath)) {
    console.error(`Design tokens not found: ${projectDir}/agentforge/spec/design-tokens.yaml`);
    process.exit(1);
}

const rawTokens = parseYaml(readFileSync(tokensPath, 'utf-8'));
const tokens: RendererTokens = {
    colors: rawTokens.colors,
    typography: rawTokens.typography,
    elevation: rawTokens.elevation,
    borders: rawTokens.borders,
    spacing: rawTokens.spacing,
};
console.log(`Tokens: ${projectDir}/agentforge/spec/design-tokens.yaml`);

let catalog: ReturnType<typeof loadCatalogForRenderer>;
if (existsSync(catalogPath)) {
    const rawCatalog: RawCatalogSpec = parseYaml(readFileSync(catalogPath, 'utf-8'));
    catalog = loadCatalogForRenderer(rawCatalog, tokens);
    const projectEntryCount = Object.keys(rawCatalog.components).length;
    const totalCount = Object.keys(catalog).length;
    console.log(`Catalog: ${projectDir}/agentforge/spec/component-catalog.yaml (${projectEntryCount} project entries + ${totalCount - projectEntryCount} built-in)`);
} else {
    console.warn(`Warning: Catalog not found at ${projectDir}/agentforge/spec/component-catalog.yaml — using built-in catalog`);
    catalog = loadCatalogForRenderer();
    console.log(`Catalog: built-in (${Object.keys(catalog).length} entries)`);
}

/* ------------------------------------------------------------------ */
/*  Render                                                              */
/* ------------------------------------------------------------------ */
console.log(`Rendering ${fixtureName} (${Object.keys(spec.nodes).length} nodes)...`);
const result = renderToScript(spec, tokens, catalog);

if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  ⚠ ${w}`));
}
console.log(`Rendered ${result.nodeIds.length} nodes`);
console.log(`Script length: ${result.script.length} chars`);

/* ------------------------------------------------------------------ */
/*  Validate parseability                                               */
/* ------------------------------------------------------------------ */
try {
    new Function('penpot', result.script);
    console.log('Script parse: ✓ valid JavaScript');
} catch (e: unknown) {
    console.error('Script parse: ✗ INVALID', (e as Error).message);
    process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Write output                                                        */
/* ------------------------------------------------------------------ */
const effectiveReplayDir = replayDir ?? projectDir;
const replayRoot = join(__dirname, '..', effectiveReplayDir);
const previewDir = join(replayRoot, `.agentforge/previews/${fixtureName}`);
console.log("previewDir", previewDir);
const scriptsDir = join(previewDir, 'scripts');
mkdirSync(scriptsDir, { recursive: true });

// Write design.js for manual inspection
const designJsPath = join(scriptsDir, 'design.js');
writeFileSync(designJsPath, result.script);
console.log(`\nSaved design.js: ${designJsPath}`);

// Write penpot-design.json for --stage replay
const penpotDesign = {
    script: result.script,
    penpotNodeIds: {},
    moduleId: fixtureName,
    breakpoints: ['1440'],
};
const penpotDesignPath = join(previewDir, 'penpot-design.json');
writeFileSync(penpotDesignPath, JSON.stringify(penpotDesign, null, 2));
console.log(`Saved penpot-design.json: ${penpotDesignPath}`);

// Write minimal stubs for --stage replay (CLI requires these to exist)
const researchPath = join(previewDir, 'research-brief.json');
const planningPath = join(previewDir, 'planning-spec.json');

if (!existsSync(researchPath)) {
    writeFileSync(researchPath, JSON.stringify({
        moduleId: fixtureName,
        stub: true,
        note: 'Generated by test-renderer-in-penpot.ts for --stage replay'
    }, null, 2));
    console.log(`Created stub: research-brief.json`);
}
if (!existsSync(planningPath)) {
    writeFileSync(planningPath, JSON.stringify({
        moduleId: fixtureName,
        stub: true,
        note: 'Generated by test-renderer-in-penpot.ts for --stage replay'
    }, null, 2));
    console.log(`Created stub: planning-spec.json`);
}

console.log(`\nTo replay in Penpot:`);
console.log(`  npx agentforge design:penpot "${fixtureName.replaceAll('-', ' ')}" --stage replay --project-dir ${projectDir}`);
