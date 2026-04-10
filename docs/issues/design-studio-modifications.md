# Design Studio — Post-Audit Modifications

Based on the audit results, these are the specific changes needed.
Grouped into passes by priority. Run Pass 1 + Pass 2 together.

---

## Pass 1: Enrich spec context in design generation (highest impact)

This is the biggest quality win. The LLM currently gets component names as a flat list.
It should get full anatomy, spacing, token bindings, and data model field names.

### Claude Code prompt

```
The design generation endpoint at packages/dashboard/src/app/api/pages/[pageId]/design/route.ts reads component-catalog.yaml but only extracts key names as a flat list. It also doesn't read models.yaml or brand.yaml. This means the LLM is missing 80% of the context it needs for good first-pass generation.

## Task 1: Read and inject component anatomy

In the POST handler (around lines 117-124 where inputs are assembled):

Currently the component catalog is read and only key names are passed. Change this:

1. Read component-catalog.yaml fully (it's already being read — just use the full content)
2. For each component listed in the page's `components` array from pages.yaml, extract from the catalog:
   - `anatomy` (the slots: header/body/footer with their contents)
   - `spacing` (padding, internal_gap)
   - `token_bindings` (background, text, border-radius)
   - `states` (default, hover, selected — the visual states)
   - `variants` if present (e.g., Badge has success/warning/error variants)
3. Format this as a structured section in the system prompt, replacing the current flat list

Example of what the LLM should receive (instead of just "Available catalog components: card, badge, button-primary"):

```
## Component anatomy for this page

### Card
Slots: header (title heading-3, subtitle body, action Button), body (primary content), footer (action buttons, metadata)
Spacing: padding 16px 20px, internal gap 12px
Tokens: background=surface-primary, text=text-primary, border-radius=medium (10px)
States: default (surface-primary bg, shadow-sm), hover (shadow-md), selected (border cta-primary 2px)

### Badge
Slots: label (status text, small), icon (optional)
Spacing: padding 2px 8px, internal gap 4px
Variants: success (bg success 15% opacity), warning (bg warning 15%), error (bg error 15%), info (bg cta-primary 15%)
```

## Task 2: Read and inject models.yaml

In the same POST handler:

1. Read `agentforge/spec/models.yaml` from the active project
2. Cross-reference with the page's `data_sources` array from pages.yaml
3. For each matching model, extract the field names and types
4. Add a section to the system prompt:

```
## Data models for this page

### Expense
Fields: id (string), amount (number), merchant (string), category_id (string), date (date), payment_method_id (string), note (string), currency (string)

### Category
Fields: id (string), name (string), color_hex (string), icon (string), is_default (boolean)
```

This tells the LLM to use real field names in labels and mock data: "$42.50 at Whole Foods" instead of "Lorem ipsum".

## Task 3: Read and inject brand.yaml

1. Read `agentforge/spec/brand.yaml` from the active project
2. Add to the system prompt:

```
## Brand guidelines
Tone: Refined and analytical — like a premium fintech dashboard. Serious but not cold, with warm amber accents adding energy.
Illustration style: Dark background, glowing amber and teal accents, geometric, minimal.
Motion: fade transitions, smooth interaction, ease-out, 200ms base.
Accessibility: WCAG AA
```

## Task 4: Include page-to-page navigation context

1. Read the full pages.yaml (all pages, not just the current one)
2. Add a section listing other pages with their routes:

```
## Other pages in this application
- Dashboard (/) — status: approved
- Add Expense (/add) — status: approved
- Spending Insights (/insights) — status: approved
```

This tells the LLM what navigation targets exist, so it can generate NavigationTabs with correct routes.

## Where to inject in the system prompt

Find the `buildDesignSpecSystemPrompt` function (around lines 275-356). Add these sections after the existing Design Tokens section and before the Page Description section. The order should be:

1. Rules (existing)
2. Design Tokens (existing)
3. Brand Guidelines (NEW - Task 3)
4. Component Catalog with anatomy (MODIFIED - Task 1, replaces flat list)
5. Data Models (NEW - Task 2)
6. Navigation Context (NEW - Task 4)
7. Required Components (existing)
8. Page to Design (existing - the page description)

## Constraints
- If models.yaml doesn't exist, skip that section silently (some projects may not have it yet)
- If brand.yaml doesn't exist, skip silently
- Don't change the SUBMIT_DESIGN_TOOL schema — it's correct
- Don't change the validation logic — it's correct
- The component anatomy formatting should be concise — don't dump raw YAML into the prompt. Summarize each component in 3-4 lines.
- Keep the existing flat catalog list AS WELL as the anatomy — the flat list constrains which catalog names are valid, the anatomy teaches spacing/slots
```

### Test
```bash
npx nx run dashboard:build

# Start the dashboard and generate a design for a page that has
# components, data_sources, and a component-catalog.yaml in the spec dir.
# Check the terminal/logs to see the system prompt being built.
# It should now include:
# - Component anatomy (not just names)
# - Data model fields
# - Brand guidelines
# - Other pages with routes
```

---

## Pass 2: Page registry spec awareness (small but visible)

### Claude Code prompt

```
The page registry in the Design Studio ignores the spec `status` field from pages.yaml.
Pages that are status:"approved" (meaning the spec is approved and ready for design) 
show up with a gray "Draft" badge because the registry only looks at `designStatus`.

## Task 1: Pass spec status through the API

In `packages/dashboard/src/app/api/pages/route.ts` GET handler (around lines 24-31):

The current mapping explicitly maps: id, name, description, route, status, designStatus.
But the Page interface in page-registry.tsx only has: id, name, description, designStatus.

1. Add `specStatus` (or `status`) to the Page interface in page-registry.tsx
2. Pass the `status` field from pages.yaml through the API response
3. Also pass the `components` array (currently dropped during mapping in design/page.tsx around line 42-47)

## Task 2: Show dual status in the registry

In `packages/dashboard/src/components/design/page-registry.tsx`:

Currently it shows only a designStatus badge. Change it to show:

1. If the page has specStatus "approved" AND designStatus "draft" (or undefined):
   Show "Ready to design" in a blue badge instead of gray "Draft"
   This tells the user: "the spec is approved, you can generate a design now"

2. If the page has specStatus "requested" or "draft":
   Show "Spec pending" in a gray badge — design can't be generated yet

3. If the page has a designStatus (generating/rendered/correction/approved):
   Show the designStatus badge as currently (this takes priority over specStatus)

4. Show the component count below the description: "12 components" in secondary text
   This gives users a sense of page complexity before generating

## Task 3: Pre-fill create modal for existing spec pages

In `packages/dashboard/src/components/pages/create-page-modal.tsx`:

Add an optional `prefillDescription` prop. When the modal is opened from a page
that already exists in pages.yaml (e.g., user clicks "Generate" on a spec page
that needs design), pre-fill the textarea with the spec description.

The user can still edit it — it's a starting point, not locked.

## Constraints
- Don't change the visual layout of page cards — just the badge logic
- The "Ready to design" state should feel like an invitation, not a warning
- If components array is missing or empty, don't show the component count line
```

### Test
```bash
npx nx run dashboard:build
npx nx run dashboard:dev

# Navigate to /design with a project that has pages.yaml containing pages
# with status: "approved" but no designStatus
# They should show "Ready to design" (blue) not "Draft" (gray)
# Pages with status: "requested" should show "Spec pending" (gray)
# Pages that already have designs should show their designStatus as before
# Click a "Ready to design" page — description should pre-fill if available
```

---

## Pass 3: Coherence validation (new feature, do after Pass 1+2)

### Claude Code prompt

```
Add a coherence validation step that checks approved designs against their spec.
This runs when all spec-approved pages have approved designs, and flags gaps.

## Task 1: Coherence checker

Create `packages/dashboard/src/lib/design/coherence-check.ts`:

```typescript
interface CoherenceResult {
  pageId: string;
  componentCoverage: {
    specComponents: string[];    // from pages.yaml components array
    designedComponents: string[]; // catalog references found in DesignSpec
    missing: string[];           // in spec but not in design
    extra: string[];             // in design but not in spec (informational)
  };
  navigationCoverage: {
    expectedRoutes: string[];    // routes from other pages in pages.yaml
    foundRoutes: string[];       // interaction targets in DesignSpec nodes
    missingRoutes: string[];     // expected but not found
  };
  dataFieldCoverage: {
    expectedFields: string[];    // from models.yaml for this page's data_sources
    foundFields: string[];       // text content in DesignSpec matching field names
    missingFields: string[];     // expected but not found
  };
}

export function checkCoherence(
  pageSpec: PageEntry,           // from pages.yaml
  designSpec: DesignSpecV2,      // the approved design
  allPages: PageEntry[],         // all pages for navigation check
  models: ModelEntry[]           // from models.yaml
): CoherenceResult
```

Implementation:
1. **Component coverage**: Compare page.components array against DesignSpec nodes that have `catalog` fields. Use fuzzy matching (TopBar → top-bar, BudgetSummaryCard → budget-summary-card or just check if a node's catalog starts with the component name lowercased).
2. **Navigation coverage**: Collect all routes from allPages. Scan DesignSpec nodes for interaction fields with navigate actions. Check if all routes appear as targets.
3. **Data field coverage**: For each model in page.data_sources, get field names from models.yaml. Scan DesignSpec text nodes for field name matches (case-insensitive).

## Task 2: API endpoint

Create `packages/dashboard/src/app/api/design/coherence/route.ts`:

GET handler:
1. Read pages.yaml, get all pages with designStatus "approved"
2. For each, read its DesignSpec JSON from agentforge/designs/{pageId}.json
3. Read models.yaml
4. Run checkCoherence for each page
5. Return array of CoherenceResult

## Task 3: Show in Design Studio

In the Design Studio page, add a "Coherence" button in the header area (next to the context bar).
When clicked, fetch GET /api/design/coherence and show results in a slide-out panel or modal:

- Green check per page if all coverage is complete
- Amber warning with list of missing components/routes/fields
- Each missing item links to the affected page in the registry

Only enable the button when at least 2 pages have approved designs.

## Constraints
- This is purely structural — zero LLM cost, no browser rendering needed
- Fuzzy matching for component names (specs use PascalCase like TopBar, catalog uses kebab-case like top-bar)
- Don't block the approval flow — coherence is informational, not a gate
- Data field coverage is best-effort (field names in mock data may not exactly match model field names)
```

### Test
```bash
npx nx run dashboard:build

# With a project that has:
# - pages.yaml with 3 approved pages, each listing components
# - Approved designs for at least 2 pages
# - models.yaml with data models

curl http://localhost:3000/api/design/coherence

# Should return coherence results per page
# Missing components = components in spec but not in design
# Missing routes = pages that should be navigable but aren't linked
```

---

## Deferred (do later, not in this pass)

### Real vision correction pipeline
The correction endpoint is currently a tag-annotation passthrough. Wiring the real
BrowserCorrectionPipeline needs: LLMProvider configuration, Playwright browser session,
RendererTokens, CatalogMap. This is a separate session — the current passthrough is
functional for basic iteration (tags are recorded, iteration count works).

### Screenshot generation
Needs BrowserSession from designspec-renderer running Playwright. The design renders
in the iframe already — screenshots are needed for coherence visualization and
few-shot examples for the Planning Agent. Can be added when the correction pipeline
is wired (same Playwright dependency).

### API route model configuration
Model is hardcoded to claude-sonnet-4-5-20250514. Should read from project config
or agents.yaml. Low priority — works correctly, just not configurable.
