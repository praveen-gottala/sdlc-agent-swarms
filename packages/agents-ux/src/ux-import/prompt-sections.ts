/**
 * @module @agentforge/agents-ux/ux-import/prompt-sections
 *
 * Generates library-specific prompt sections for injection into the
 * import system prompt template. Each section is a string that replaces
 * a {{PLACEHOLDER}} in ux-import-system.md.
 *
 * Supports: shadcn, mui, chakra, antd, radix, mantine.
 * Styling: tailwind (v3/v4), css-in-js, plain CSS.
 */

import type { ComponentLibraryId, StylingApproach } from '@agentforge/designspec-renderer';

// ─── Component → Catalog Mapping Tables ─────────────────

interface ComponentMappingEntry {
  readonly component: string;
  readonly catalogId: string;
  readonly notes?: string;
}

const SHADCN_MAPPINGS: readonly ComponentMappingEntry[] = [
  { component: '<Button> (default/variant="default")', catalogId: 'button-primary' },
  { component: '<Button variant="outline">', catalogId: 'button-secondary' },
  { component: '<Button variant="ghost">', catalogId: 'button-ghost' },
  { component: '<Button variant="destructive">', catalogId: 'button-primary', notes: 'Use `overrides: { background: "error" }`' },
  { component: '<Card>', catalogId: 'card', notes: 'Wrap CardHeader/CardContent as children' },
  { component: '<Input>', catalogId: 'input-text' },
  { component: '<Select>', catalogId: 'select' },
  { component: '<Badge>', catalogId: 'badge' },
  { component: '<Avatar>', catalogId: 'avatar' },
  { component: '<Switch>', catalogId: 'switch' },
  { component: '<Checkbox>', catalogId: 'checkbox' },
  { component: '<Table>', catalogId: 'data-table', notes: 'Use `items` array for rows' },
  { component: '<Separator>', catalogId: 'divider (type, not catalog)' },
  { component: '<Label>', catalogId: 'text', notes: 'with typography "label"' },
  { component: '<AlertDialog> / <Dialog>', catalogId: 'alert', notes: 'Decompose to container + text for modal content' },
  { component: '<Tooltip>', catalogId: 'tooltip' },
  { component: '<Skeleton>', catalogId: 'skeleton' },
  { component: '<Progress>', catalogId: 'stat', notes: 'Use value field for progress amount' },
];

const MUI_MAPPINGS: readonly ComponentMappingEntry[] = [
  { component: '<Button variant="contained">', catalogId: 'button-primary' },
  { component: '<Button variant="outlined">', catalogId: 'button-secondary' },
  { component: '<Button variant="text">', catalogId: 'button-ghost' },
  { component: '<Button color="error">', catalogId: 'button-primary', notes: 'Use `overrides: { background: "error" }`' },
  { component: '<Card>', catalogId: 'card', notes: 'Wrap CardHeader/CardContent as children' },
  { component: '<TextField>', catalogId: 'input-text' },
  { component: '<Select> / <FormControl+Select>', catalogId: 'select' },
  { component: '<Chip>', catalogId: 'badge', notes: 'Use `chip` catalog for deletable chips' },
  { component: '<Avatar>', catalogId: 'avatar' },
  { component: '<Switch>', catalogId: 'switch' },
  { component: '<Checkbox>', catalogId: 'checkbox' },
  { component: '<Table> / <DataGrid>', catalogId: 'data-table', notes: 'Use `items` array for rows' },
  { component: '<Divider>', catalogId: 'divider (type, not catalog)' },
  { component: '<Typography> / <InputLabel>', catalogId: 'text', notes: 'Map variant prop to typography role' },
  { component: '<Alert>', catalogId: 'alert' },
  { component: '<Tooltip>', catalogId: 'tooltip' },
  { component: '<Skeleton>', catalogId: 'skeleton' },
  { component: '<LinearProgress> / <CircularProgress>', catalogId: 'loading-spinner' },
  { component: '<IconButton>', catalogId: 'button-ghost', notes: 'Icon-only button' },
  { component: '<Fab>', catalogId: 'button-primary', notes: 'Floating action button' },
];

const CHAKRA_MAPPINGS: readonly ComponentMappingEntry[] = [
  { component: '<Button> (default)', catalogId: 'button-primary' },
  { component: '<Button variant="outline">', catalogId: 'button-secondary' },
  { component: '<Button variant="ghost">', catalogId: 'button-ghost' },
  { component: '<Button colorScheme="red">', catalogId: 'button-primary', notes: 'Use `overrides: { background: "error" }`' },
  { component: '<Card>', catalogId: 'card' },
  { component: '<Input>', catalogId: 'input-text' },
  { component: '<Select>', catalogId: 'select' },
  { component: '<Badge>', catalogId: 'badge' },
  { component: '<Avatar>', catalogId: 'avatar' },
  { component: '<Switch>', catalogId: 'switch' },
  { component: '<Checkbox>', catalogId: 'checkbox' },
  { component: '<Table> / <TableContainer>', catalogId: 'data-table', notes: 'Use `items` array for rows' },
  { component: '<Divider>', catalogId: 'divider (type, not catalog)' },
  { component: '<Text> / <Heading>', catalogId: 'text', notes: 'Map `as` prop or `size` to typography' },
  { component: '<Alert>', catalogId: 'alert' },
  { component: '<Tooltip>', catalogId: 'tooltip' },
  { component: '<Skeleton>', catalogId: 'skeleton' },
  { component: '<Spinner>', catalogId: 'loading-spinner' },
  { component: '<Tag>', catalogId: 'chip' },
  { component: '<IconButton>', catalogId: 'button-ghost' },
];

const ANTD_MAPPINGS: readonly ComponentMappingEntry[] = [
  { component: '<Button type="primary">', catalogId: 'button-primary' },
  { component: '<Button> (default)', catalogId: 'button-secondary' },
  { component: '<Button type="text">', catalogId: 'button-ghost' },
  { component: '<Button danger>', catalogId: 'button-primary', notes: 'Use `overrides: { background: "error" }`' },
  { component: '<Card>', catalogId: 'card' },
  { component: '<Input>', catalogId: 'input-text' },
  { component: '<Select>', catalogId: 'select' },
  { component: '<Badge> / <Tag>', catalogId: 'badge' },
  { component: '<Avatar>', catalogId: 'avatar' },
  { component: '<Switch>', catalogId: 'switch' },
  { component: '<Checkbox>', catalogId: 'checkbox' },
  { component: '<Table>', catalogId: 'data-table', notes: 'Use `items` array for rows' },
  { component: '<Divider>', catalogId: 'divider (type, not catalog)' },
  { component: '<Typography.Title> / <Typography.Text>', catalogId: 'text' },
  { component: '<Alert>', catalogId: 'alert' },
  { component: '<Tooltip>', catalogId: 'tooltip' },
  { component: '<Skeleton>', catalogId: 'skeleton' },
  { component: '<Spin>', catalogId: 'loading-spinner' },
  { component: '<Steps>', catalogId: 'stepper' },
];

const MANTINE_MAPPINGS: readonly ComponentMappingEntry[] = [
  { component: '<Button> (default)', catalogId: 'button-primary' },
  { component: '<Button variant="outline">', catalogId: 'button-secondary' },
  { component: '<Button variant="subtle">', catalogId: 'button-ghost' },
  { component: '<Button color="red">', catalogId: 'button-primary', notes: 'Use `overrides: { background: "error" }`' },
  { component: '<Card>', catalogId: 'card' },
  { component: '<TextInput>', catalogId: 'input-text' },
  { component: '<Select>', catalogId: 'select' },
  { component: '<Badge>', catalogId: 'badge' },
  { component: '<Avatar>', catalogId: 'avatar' },
  { component: '<Switch>', catalogId: 'switch' },
  { component: '<Checkbox>', catalogId: 'checkbox' },
  { component: '<Table>', catalogId: 'data-table', notes: 'Use `items` array for rows' },
  { component: '<Divider>', catalogId: 'divider (type, not catalog)' },
  { component: '<Title> / <Text>', catalogId: 'text' },
  { component: '<Alert>', catalogId: 'alert' },
  { component: '<Tooltip>', catalogId: 'tooltip' },
  { component: '<Skeleton>', catalogId: 'skeleton' },
  { component: '<Loader>', catalogId: 'loading-spinner' },
  { component: '<Stepper>', catalogId: 'stepper' },
  { component: '<Chip>', catalogId: 'chip' },
];

const RADIX_MAPPINGS: readonly ComponentMappingEntry[] = [
  { component: '<Button> (default)', catalogId: 'button-primary' },
  { component: '<Button variant="outline">', catalogId: 'button-secondary' },
  { component: '<Button variant="ghost">', catalogId: 'button-ghost' },
  { component: '<Card>', catalogId: 'card' },
  { component: '<TextField.Root>', catalogId: 'input-text' },
  { component: '<Select.Root>', catalogId: 'select' },
  { component: '<Badge>', catalogId: 'badge' },
  { component: '<Avatar.Root>', catalogId: 'avatar' },
  { component: '<Switch>', catalogId: 'switch' },
  { component: '<Checkbox>', catalogId: 'checkbox' },
  { component: '<Table.Root>', catalogId: 'data-table', notes: 'Use `items` array for rows' },
  { component: '<Separator>', catalogId: 'divider (type, not catalog)' },
  { component: '<Text> / <Heading>', catalogId: 'text' },
  { component: '<Tooltip>', catalogId: 'tooltip' },
  { component: '<Callout.Root>', catalogId: 'alert' },
];

const LIBRARY_MAPPINGS: Record<string, readonly ComponentMappingEntry[]> = {
  shadcn: SHADCN_MAPPINGS,
  mui: MUI_MAPPINGS,
  chakra: CHAKRA_MAPPINGS,
  antd: ANTD_MAPPINGS,
  mantine: MANTINE_MAPPINGS,
  radix: RADIX_MAPPINGS,
};

/** Generate the component mapping table for a specific library. */
export function buildComponentMappingSection(library: ComponentLibraryId): string {
  const mappings = LIBRARY_MAPPINGS[library] ?? SHADCN_MAPPINGS;
  const libraryName = library === 'unknown' ? 'shadcn (default)' : library;

  const header = `**Library: ${libraryName}**\n\n| React Component | Catalog ID | Notes |\n|----------------|-----------|-------|`;
  const rows = mappings.map(m =>
    `| \`${m.component}\` | \`${m.catalogId}\` | ${m.notes ?? ''} |`
  );
  return `${header}\n${rows.join('\n')}`;
}

// ─── Styling → Layout Mapping ────────────────────────────

const TAILWIND_LAYOUT_MAPPING = `**Styling: Tailwind CSS**

| Tailwind Class | DesignSpec Property |
|---------------|-------------------|
| \`flex\` | \`layout.dir\` (check flex-col/flex-row) |
| \`flex-col\` | \`layout.dir: "column"\` |
| \`flex-row\` | \`layout.dir: "row"\` |
| \`grid\` | \`layout.display: "grid"\` |
| \`grid-cols-{n}\` | \`layout.columns: n\` |
| \`gap-{n}\` | \`layout.gap: n * 4\` (Tailwind spacing scale) |
| \`p-{n}\` | \`layout.px\` and \`layout.py: n * 4\` |
| \`px-{n}\` | \`layout.px: n * 4\` |
| \`py-{n}\` | \`layout.py: n * 4\` |
| \`pt-{n}\` | \`layout.pt: n * 4\` |
| \`pb-{n}\` | \`layout.pb: n * 4\` |
| \`items-center\` | \`layout.align: "center"\` |
| \`items-start\` | \`layout.align: "start"\` |
| \`items-end\` | \`layout.align: "end"\` |
| \`items-stretch\` | \`layout.align: "stretch"\` |
| \`justify-between\` | \`layout.justify: "space-between"\` |
| \`justify-center\` | \`layout.justify: "center"\` |
| \`justify-end\` | \`layout.justify: "end"\` |
| \`w-full\` | \`width: "fill"\` |
| \`w-{n}\` | \`width: n * 4\` |
| \`h-{n}\` | \`height: n * 4\` |
| \`rounded-lg\` | \`radius: 8\` |
| \`rounded-xl\` | \`radius: 12\` |
| \`shadow-sm\` | \`shadow: "sm"\` |
| \`shadow-md\` | \`shadow: "md"\` |
| \`col-span-{n}\` | \`overrides: { gridColumn: "span n" }\` |`;

const MUI_SX_LAYOUT_MAPPING = `**Styling: MUI sx prop / styled()**

Map MUI's \`sx\` prop and \`styled()\` values to DesignSpec layout:

| MUI sx Property | DesignSpec Property |
|----------------|-------------------|
| \`display: 'flex'\` | \`layout.dir\` (check flexDirection) |
| \`flexDirection: 'column'\` | \`layout.dir: "column"\` |
| \`display: 'grid'\` | \`layout.display: "grid"\` |
| \`gridTemplateColumns: 'repeat(n, 1fr)'\` | \`layout.columns: n\` |
| \`gap: n\` | \`layout.gap: n * 8\` (MUI spacing = 8px) |
| \`p: n\` | \`layout.px\` and \`layout.py: n * 8\` |
| \`px: n\` | \`layout.px: n * 8\` |
| \`py: n\` | \`layout.py: n * 8\` |
| \`alignItems: 'center'\` | \`layout.align: "center"\` |
| \`justifyContent: 'space-between'\` | \`layout.justify: "space-between"\` |
| \`width: '100%'\` | \`width: "fill"\` |
| \`borderRadius: n\` | \`radius: n\` (px) |

For \`Stack\` component: \`direction\` → \`layout.dir\`, \`spacing\` → \`layout.gap\` (× 8px).
For \`Grid\` component: \`container\` → parent with \`layout.display: "grid"\`, \`item xs={n}\` → column span.`;

const CHAKRA_LAYOUT_MAPPING = `**Styling: Chakra UI props**

Map Chakra's style props to DesignSpec layout:

| Chakra Prop | DesignSpec Property |
|------------|-------------------|
| \`display="flex"\` | \`layout.dir\` (check flexDirection) |
| \`flexDir="column"\` / \`flexDirection="column"\` | \`layout.dir: "column"\` |
| \`gap={n}\` | \`layout.gap: n * 4\` (Chakra spacing scale) |
| \`p={n}\` / \`padding={n}\` | \`layout.px\` and \`layout.py: n * 4\` |
| \`px={n}\` | \`layout.px: n * 4\` |
| \`py={n}\` | \`layout.py: n * 4\` |
| \`alignItems="center"\` / \`align="center"\` | \`layout.align: "center"\` |
| \`justifyContent="space-between"\` / \`justify="space-between"\` | \`layout.justify: "space-between"\` |
| \`w="full"\` / \`width="100%"\` | \`width: "fill"\` |
| \`borderRadius="lg"\` | \`radius: 8\` |
| \`shadow="md"\` | \`shadow: "md"\` |

For \`<Stack>\`: \`spacing\` → \`layout.gap\`, \`direction\` → \`layout.dir\`.
For \`<SimpleGrid>\`: \`columns\` → \`layout.columns\`, \`spacing\` → \`layout.gap\`.`;

const GENERIC_CSS_LAYOUT_MAPPING = `**Styling: CSS / inline styles**

Map CSS properties to DesignSpec layout:

| CSS Property | DesignSpec Property |
|-------------|-------------------|
| \`display: flex\` | \`layout.dir\` (check flex-direction) |
| \`flex-direction: column\` | \`layout.dir: "column"\` |
| \`display: grid\` | \`layout.display: "grid"\` |
| \`grid-template-columns: repeat(n, 1fr)\` | \`layout.columns: n\` |
| \`gap: Npx\` | \`layout.gap: N\` |
| \`padding: Npx\` | \`layout.px: N\` and \`layout.py: N\` |
| \`align-items: center\` | \`layout.align: "center"\` |
| \`justify-content: space-between\` | \`layout.justify: "space-between"\` |
| \`width: 100%\` | \`width: "fill"\` |
| \`border-radius: Npx\` | \`radius: N\` |
| \`box-shadow: ...\` | \`shadow: "sm" / "md" / "lg"\` (approximate) |`;

/** Generate the styling mapping section based on detected approach. */
export function buildStylingMappingSection(styling: StylingApproach, library: ComponentLibraryId): string {
  // Library-specific styling takes precedence
  if (library === 'mui') return MUI_SX_LAYOUT_MAPPING;
  if (library === 'chakra') return CHAKRA_LAYOUT_MAPPING;

  // Then by detected styling approach
  if (styling === 'tailwind-v3' || styling === 'tailwind-v4') return TAILWIND_LAYOUT_MAPPING;
  if (styling === 'css-in-js') return MUI_SX_LAYOUT_MAPPING;
  return GENERIC_CSS_LAYOUT_MAPPING;
}

// ─── Color Token Mapping ─────────────────────────────────

const TAILWIND_COLOR_MAPPING = `**Tailwind CSS color classes → semantic tokens**

| Tailwind/CSS Class | Semantic Token |
|-------------------|---------------|
| \`bg-background\` | \`background-primary\` |
| \`bg-card\` | \`surface-primary\` |
| \`bg-primary\` | \`cta-primary\` |
| \`bg-secondary\` | \`surface-secondary\` |
| \`bg-muted\` | \`surface-elevated\` |
| \`bg-destructive\` | \`error\` |
| \`bg-accent\` | \`cta-hover\` |
| \`text-foreground\` | \`text-primary\` |
| \`text-muted-foreground\` | \`text-secondary\` |
| \`text-primary\` | \`cta-primary\` |
| \`text-primary-foreground\` | \`text-on-cta\` |
| \`text-destructive\` | \`error\` |
| \`border-border\` | \`border-default\` |
| \`border-input\` | \`border-default\` |`;

const MUI_COLOR_MAPPING = `**MUI theme palette → semantic tokens**

| MUI Palette | Semantic Token |
|------------|---------------|
| \`palette.background.default\` / \`theme.palette.background.paper\` | \`background-primary\` / \`surface-primary\` |
| \`palette.primary.main\` | \`cta-primary\` |
| \`palette.primary.contrastText\` | \`text-on-cta\` |
| \`palette.secondary.main\` | \`surface-secondary\` |
| \`palette.error.main\` | \`error\` |
| \`palette.text.primary\` | \`text-primary\` |
| \`palette.text.secondary\` | \`text-secondary\` |
| \`palette.divider\` | \`border-default\` |
| \`color="primary"\` | \`cta-primary\` |
| \`color="error"\` | \`error\` |
| \`color="success"\` | \`success\` |
| \`color="warning"\` | \`warning\` |`;

const CHAKRA_COLOR_MAPPING = `**Chakra colorScheme → semantic tokens**

| Chakra Color Prop | Semantic Token |
|------------------|---------------|
| \`bg="white"\` / \`bg="gray.50"\` | \`background-primary\` / \`surface-primary\` |
| \`colorScheme="teal"\` / \`colorScheme="blue"\` (primary) | \`cta-primary\` |
| \`colorScheme="red"\` | \`error\` |
| \`colorScheme="green"\` | \`success\` |
| \`colorScheme="orange"\` / \`colorScheme="yellow"\` | \`warning\` |
| \`color="gray.800"\` | \`text-primary\` |
| \`color="gray.500"\` | \`text-secondary\` |
| \`borderColor="gray.200"\` | \`border-default\` |`;

const GENERIC_COLOR_MAPPING = `**Infer semantic tokens from color usage context:**

- Main background color → \`background-primary\`
- Card/elevated surface color → \`surface-primary\`
- Primary action/brand color → \`cta-primary\`
- Body text color → \`text-primary\`
- Secondary/muted text → \`text-secondary\`
- White text on dark buttons → \`text-on-cta\`
- Red/error color → \`error\`
- Border/divider color → \`border-default\``;

/** Generate the color token mapping section. */
export function buildColorTokenSection(styling: StylingApproach, library: ComponentLibraryId): string {
  if (library === 'mui') return MUI_COLOR_MAPPING;
  if (library === 'chakra') return CHAKRA_COLOR_MAPPING;
  if (styling === 'tailwind-v3' || styling === 'tailwind-v4') return TAILWIND_COLOR_MAPPING;
  return GENERIC_COLOR_MAPPING;
}

// ─── Typography Mapping ──────────────────────────────────

const TAILWIND_TYPOGRAPHY = `| Tailwind Class | Typography Role |
|---------------|----------------|
| \`text-3xl font-bold\` | \`heading-1\` |
| \`text-2xl font-bold\` | \`heading-2\` |
| \`text-xl font-semibold\` or \`text-lg font-semibold\` | \`heading-3\` |
| \`text-sm\` or \`text-base\` | \`body\` |
| \`text-xs\` | \`small\` |
| \`font-medium text-sm\` (with Label) | \`label\` |`;

const MUI_TYPOGRAPHY = `| MUI Typography variant | Typography Role |
|-----------------------|----------------|
| \`variant="h1"\` / \`variant="h2"\` | \`heading-1\` |
| \`variant="h3"\` / \`variant="h4"\` | \`heading-2\` |
| \`variant="h5"\` / \`variant="h6"\` | \`heading-3\` |
| \`variant="body1"\` / \`variant="body2"\` | \`body\` |
| \`variant="caption"\` / \`variant="overline"\` | \`small\` |
| \`variant="subtitle1"\` / \`variant="subtitle2"\` | \`label\` |`;

const CHAKRA_TYPOGRAPHY = `| Chakra Component/Prop | Typography Role |
|----------------------|----------------|
| \`<Heading size="2xl">\` / \`<Heading as="h1">\` | \`heading-1\` |
| \`<Heading size="xl">\` / \`<Heading as="h2">\` | \`heading-2\` |
| \`<Heading size="lg">\` / \`<Heading as="h3">\` | \`heading-3\` |
| \`<Text>\` (default) | \`body\` |
| \`<Text fontSize="sm">\` / \`<Text fontSize="xs">\` | \`small\` |
| \`<FormLabel>\` | \`label\` |`;

const GENERIC_TYPOGRAPHY = `| Element / Size | Typography Role |
|---------------|----------------|
| \`<h1>\` / 28-32px bold | \`heading-1\` |
| \`<h2>\` / 22-26px bold | \`heading-2\` |
| \`<h3>\` / 18-20px semibold | \`heading-3\` |
| \`<p>\` / 14-16px normal | \`body\` |
| 12px or smaller | \`small\` |
| \`<label>\` / 14px medium | \`label\` |`;

/** Generate the typography mapping section. */
export function buildTypographySection(styling: StylingApproach, library: ComponentLibraryId): string {
  if (library === 'mui') return MUI_TYPOGRAPHY;
  if (library === 'chakra') return CHAKRA_TYPOGRAPHY;
  if (styling === 'tailwind-v3' || styling === 'tailwind-v4') return TAILWIND_TYPOGRAPHY;
  return GENERIC_TYPOGRAPHY;
}
