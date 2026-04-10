The design generation endpoint at packages/dashboard/src/app/api/pages/[pageId]/design/route.ts has a critical bug in how it builds the component catalog prompt, and is missing models.yaml, brand.yaml, and navigation context entirely. Fix all four issues.

## Task 1: Replace buggy catalog prompt with buildComponentCatalogPrompt import

The dashboard's buildDesignSpecSystemPrompt function (around lines 330-339) has a critical bug. It does this:
```typescript
if (componentCatalog) {
    sections.push('## Component Catalog');
    sections.push('Available catalog components (use these as catalog values):');
    for (const [name] of Object.entries(componentCatalog)) {
        if (name !== 'version' && name !== 'componentLibrary') {
            sections.push(`  - ${name}`);
        }
    }
}
```

This iterates `Object.entries(componentCatalog)` — the top-level YAML keys (version, created_by, components) — instead of `componentCatalog.components`. The filter for 'componentLibrary' doesn't match anything in the actual YAML. The LLM receives `- version`, `- created_by`, `- components` as bullet items, NOT actual component names like Card or Button.

Fix: Import `buildComponentCatalogPrompt` from `@agentforge/agents-ux` and replace the entire buggy block.

1. Add import at top of file:
```typescript
   import { buildComponentCatalogPrompt } from '@agentforge/agents-ux';
```

2. Replace lines 330-339 (the buggy if/for block) with:
```typescript
   if (componentCatalog) {
       const catalogPrompt = buildComponentCatalogPrompt(componentCatalog);
       if (catalogPrompt) {
           sections.push(catalogPrompt);
       }
   }
```

This single change simultaneously:
- Fixes the bug (iterates .components correctly)
- Adds full anatomy (slots with contents and typography_role)
- Adds spacing values (padding, internal_gap)
- Adds token bindings (background, text, border-radius, font)
- Adds states (default, hover, selected with visual properties)
- Adds variants (success/warning/error for badges, primary/secondary for buttons)
- Adds accessibility info (focus_visible, aria_labels, keyboard_nav)
- Groups components by category (layout, data_display, input, feedback, navigation, composite)
- Keeps the CLI and dashboard using identical prompt logic (single source of truth)

The function takes a ComponentCatalogSpec object. The dashboard already parses component-catalog.yaml into an object — just pass that parsed object directly.

IMPORTANT: Keep the existing flat catalog name list AS WELL as the rich anatomy. The flat list constrains which `catalog:` values the LLM may use (for responseSchema validation). The rich anatomy teaches the LLM how components work. Both serve different purposes. Add the flat list AFTER the rich anatomy section:
```typescript
if (componentCatalog) {
    // Rich anatomy from shared function
    const catalogPrompt = buildComponentCatalogPrompt(componentCatalog);
    if (catalogPrompt) {
        sections.push(catalogPrompt);
    }
    // Flat list for catalog value constraint (used by responseSchema validation)
    if (componentCatalog.components) {
        const names = Object.keys(componentCatalog.components);
        sections.push('## Valid catalog values');
        sections.push('When setting catalog: on a node, use ONLY these exact names:');
        sections.push(names.map(n => `  - ${n}`).join('\n'));
    }
}
```

## Task 2: Add page component mapping context

if (pageEntry.components && pageEntry.components.length > 0) { sections.push('## Page Components'); sections.push('This page should include these functional components:'); sections.push(pageEntry.components.map((c: string) => ` - ${c}`).join('\n')); sections.push(''); }

## Task 3: Read and inject models.yaml

In the POST handler, after the existing spec reads:

1. Read `agentforge/spec/models.yaml` from the active project using the same readYamlFile helper
2. Cross-reference with the page's `data_sources` array from pages.yaml (if it exists)
3. For each matching model, extract the field names and types
4. Add a section to the system prompt:
```typescript
const modelsPath = join(specDir, 'models.yaml');
const modelsExists = await fileExists(modelsPath);
if (modelsExists) {
    const modelsYaml = await readYamlFile(modelsPath);
    if (modelsYaml?.entities || modelsYaml?.models) {
        const models = modelsYaml.entities || modelsYaml.models;
        sections.push('## Data Models');
        sections.push('Use real field names from these models in labels and mock data:');
        for (const [name, model] of Object.entries(models)) {
            const fields = (model as any).fields;
            if (fields) {
                const fieldList = Object.entries(fields)
                    .map(([fname, fdef]) => `${fname} (${(fdef as any).type || 'string'})`)
                    .join(', ');
                sections.push(`### ${name}`);
                sections.push(`Fields: ${fieldList}`);
            }
        }
        sections.push('');
    }
}
```

This tells the LLM to use real field names in labels and mock data: "$42.50 at Whole Foods" instead of "Lorem ipsum".

If models.yaml doesn't exist, skip silently — some projects may not have it yet.

## Task 4: Read and inject brand.yaml

1. Read `agentforge/spec/brand.yaml` from the active project
2. Add to the system prompt:
```typescript
const brandPath = join(specDir, 'brand.yaml');
const brandExists = await fileExists(brandPath);
if (brandExists) {
    const brandYaml = await readYamlFile(brandPath);
    if (brandYaml) {
        sections.push('## Brand Guidelines');
        if (brandYaml.tone) sections.push(`Tone: ${brandYaml.tone}`);
        if (brandYaml.illustration_style) sections.push(`Illustration style: ${brandYaml.illustration_style}`);
        if (brandYaml.motion) {
            const motion = brandYaml.motion;
            sections.push(`Motion: ${motion.transitions || ''} ${motion.easing || ''} ${motion.duration || ''}`);
        }
        if (brandYaml.accessibility) sections.push(`Accessibility: ${brandYaml.accessibility}`);
        sections.push('');
    }
}
```

If brand.yaml doesn't exist, skip silently.

## Task 5: Include page-to-page navigation context

1. Read the full pages.yaml (all pages, not just the current one)
2. Add a section listing other pages with their routes:
```typescript
if (allPages && allPages.length > 1) {
    sections.push('## Other Pages in This Application');
    sections.push('These are valid navigation targets:');
    for (const page of allPages) {
        if (page.id !== currentPageId) {
            const status = page.designStatus || page.status || 'draft';
            sections.push(`  - ${page.name} (${page.route}) — ${status}`);
        }
    }
    sections.push('');
}
```

This tells the LLM what navigation targets exist, so it can generate NavigationTabs with correct routes.

## Prompt section ordering

Find the buildDesignSpecSystemPrompt function. The section order should be:

1. Rules (existing)
2. Design Tokens (existing)
3. Brand Guidelines (NEW - Task 4)
4. Component Catalog with anatomy (FIXED - Task 1, replaces buggy loop)
5. Valid catalog values flat list (FIXED - Task 1, extracted from catalog.components)
6. Page Components to Design (NEW - Task 2)
7. Data Models (NEW - Task 3)
8. Navigation Context (NEW - Task 5)
9. Required Components (existing — if different from Task 2, keep both)
10. Page to Design (existing — the page description)

## Constraints
- If models.yaml doesn't exist, skip that section silently
- If brand.yaml doesn't exist, skip silently
- Don't change the SUBMIT_DESIGN_TOOL schema — it's correct
- Don't change the validation logic — it's correct
- If the import of buildComponentCatalogPrompt fails at build time, check that @agentforge/agents-ux is in dashboard's transpilePackages in next.config.js (it should already be there from Phase 3 setup)
- If buildComponentCatalogPrompt is not found in the barrel export, check packages/agents-ux/src/index.ts for the export. The audit confirmed it's at line 91.