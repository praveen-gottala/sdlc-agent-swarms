# ADR-003: Token Bridge Layer — Design Tokens to Component Library

| Field          | Value                                                  |
|----------------|--------------------------------------------------------|
| **Status**     | Accepted (Phase 1: shadcn-only, bridge deferred)       |
| **Created**    | 2026-03-24                                             |
| **Authors**    | Praveen Gottala                                        |
| **Supersedes** | —                                                      |
| **Context**    | AgentForge design-to-code pipeline                     |

---

## 1. Problem statement

AgentForge generates a design system during `init` (design-tokens.yaml, brand.yaml, component-library.yaml). Downstream agents consume these tokens to produce themed UI code. The question is: **how do design tokens reach the component library's theming API?**

This matters because design tokens are library-agnostic (they describe colors, spacing, and typography in abstract terms), but every component library consumes them differently. The translation layer between these two worlds is what we call the **token bridge**.

---

## 2. The token flow

```
design-tokens.yaml          (source of truth — abstract tokens)
        │
        ▼
   ┌─────────┐
   │  Bridge  │              (translation layer — the subject of this ADR)
   └─────────┘
        │
        ▼
Component Library Theme API  (library-specific — CSS vars, JS theme object, etc.)
        │
        ▼
UI Components                (consume theme idiomatically, zero knowledge of tokens)
```

The bridge is "the only file that knows both worlds." It imports design tokens and exports a theme object (or CSS variables) in the format the chosen component library expects. Components never import tokens directly — they use their library's theming API.

---

## 3. Why the bridge exists (library-by-library)

### 3.1 shadcn/ui — CSS-variable-based theming

shadcn components consume CSS custom properties. A Button doesn't call `theme.colors.primary` — it uses `className="bg-primary"`, which Tailwind resolves to a CSS variable defined in `globals.css`.

**The bridge for shadcn is two generated files:**

| File               | Role                                                         |
|--------------------|--------------------------------------------------------------|
| `globals.css`      | Defines CSS custom properties (--background, --primary, etc.) |
| `tailwind.config.ts` | Extends Tailwind with those CSS variables as color/spacing values |

**A separate bridge.ts is redundant for shadcn.** No shadcn component imports a JS theme object. The CSS variables ARE the bridge. Adding a bridge.ts would create a file that exports values nothing consumes — dead code from day one.

**Token flow for shadcn:**

```
design-tokens.yaml
        │
        ├──▶ globals.css           @layer base { :root { --primary: 160 84% 24%; } }
        │
        └──▶ tailwind.config.ts    colors: { primary: "hsl(var(--primary))" }
                                          │
                                          ▼
                                   <Button className="bg-primary" />
```

### 3.2 MUI (Material UI) — JS theme object

MUI components consume a runtime JavaScript theme object created via `createTheme()`. This object is passed to `<ThemeProvider>` and accessed via `useTheme()` or the `sx` prop. There is no CSS-variable layer — the theme is a JS data structure.

**bridge.ts is load-bearing for MUI.** Without it, `createTheme()` calls scatter across the codebase, token references become implicit, and updating a token means hunting through files.

**Token flow for MUI:**

```
design-tokens.yaml
        │
        └──▶ bridge.ts (theme.mui.ts)
                │
                │   import { createTheme } from "@mui/material/styles";
                │   export const theme = createTheme({
                │     palette: {
                │       primary: { main: "#0F6E56", contrastText: "#FAFAF8" },
                │       error: { main: "#E8593C" },
                │       background: { default: "#FFF8E7", paper: "#FAFAF8" },
                │     },
                │     shape: { borderRadius: 12 },
                │     shadows: ["none", "0 1px 3px rgba(0,0,0,0.08)", ...],
                │   });
                │
                ▼
        <ThemeProvider theme={theme}>
          <Button color="primary" />     ← reads from theme.palette.primary
        </ThemeProvider>
```

### 3.3 Chakra UI — JS theme extension

Chakra uses `extendTheme()` to merge custom tokens into a base theme. Like MUI, this is a JS-level operation. Components access tokens via style props (`colorScheme`, `size`) that resolve against the theme.

**bridge.ts is load-bearing for Chakra.** Same reasoning as MUI — the `extendTheme()` call must live in exactly one place.

**Token flow for Chakra:**

```
design-tokens.yaml
        │
        └──▶ bridge.ts (theme.chakra.ts)
                │
                │   import { extendTheme } from "@chakra-ui/react";
                │   export const theme = extendTheme({
                │     colors: { brand: { 500: "#0F6E56", 600: "#0A5A45" } },
                │     radii: { sm: "8px", md: "12px", lg: "16px" },
                │     fonts: { heading: "'Nunito', sans-serif", body: "'Open Sans', sans-serif" },
                │   });
                │
                ▼
        <ChakraProvider theme={theme}>
          <Button colorScheme="brand" />  ← reads from theme.colors.brand
        </ChakraProvider>
```

---

## 4. Summary: when bridge.ts is needed

| Library | Theme mechanism      | Bridge file needed? | Why                                         |
|---------|----------------------|---------------------|---------------------------------------------|
| shadcn  | CSS custom properties | **No**             | `globals.css` + `tailwind.config.ts` ARE the bridge |
| MUI     | JS `createTheme()`   | **Yes**            | Components consume a runtime JS theme object |
| Chakra  | JS `extendTheme()`   | **Yes**            | Components consume a runtime JS theme object |
| Custom  | Varies               | **Likely yes**     | Any non-CSS-variable theming needs a JS bridge |

The deciding factor is simple: **if the library's components consume a JavaScript theme object at runtime, bridge.ts is necessary. If they consume CSS variables, the CSS generation layer is the bridge.**

---

## 5. Decision

### Phase 1 (current): shadcn only — no bridge.ts

AgentForge supports only shadcn/ui. The token bridge is implemented as:

- `globals.css` — generated deterministically from design-tokens.yaml
- `tailwind.config.ts` — generated deterministically from design-tokens.yaml

No bridge.ts file is generated. This avoids dead code and keeps the token flow simple and auditable.

**What IS generated in Phase 1 (and useful regardless of library):**

A typed token map (`design-tokens.d.ts`) that gives agents and developers type-safe references to tokens:

```typescript
// design-tokens.d.ts — generated from design-tokens.yaml
export type SemanticColor =
  | "background-primary"
  | "surface-primary"
  | "surface-elevated"
  | "text-primary"
  | "text-secondary"
  | "text-disabled"
  | "text-on-cta"
  | "cta-primary"
  | "error"
  | "success"
  | "warning"
  | "info";

export type SpacingIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type BorderRadius = "small" | "medium" | "large" | "pill";
export type ElevationLevel = 0 | 1 | 2 | 3;
export type TypographyRole =
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "body"
  | "label"
  | "small";
```

This gives compile-time safety when agents generate code that references tokens. A typo like `text-primry` fails the TypeScript compiler, not silently at runtime.

### Phase 2 (future): multi-library support — bridge.ts required

When AgentForge adds MUI or Chakra support, bridge.ts becomes necessary. The implementation approach:

**Option A (recommended): Library-specific theme files, no universal abstraction**

```
design-tokens.yaml
        │
        ├── component-library.yaml says "shadcn"  ──▶  globals.css + tailwind.config.ts
        ├── component-library.yaml says "mui"      ──▶  theme.mui.ts (createTheme)
        └── component-library.yaml says "chakra"   ──▶  theme.chakra.ts (extendTheme)
```

Each output is idiomatic to its library. The init generator reads the library choice and runs the appropriate template. No shared abstraction layer — each file speaks its library's native API.

**Why not a universal bridge?**

A universal bridge would export a normalized interface that agents consume regardless of library:

```typescript
// universal bridge — sounds elegant, creates problems
export const designTokens = {
  color: (semantic: string) => resolve(tokens.colors.semantic[semantic]),
  spacing: (index: number) => tokens.spacing.scale[index],
  radius: (size: string) => tokens.borders.radius[size],
};
export { theme } from "./theme.shadcn"; // or theme.mui, theme.chakra
```

This introduces an abstraction that only matters if:
- Agents need to switch libraries mid-project (they don't — library is picked once at init)
- The same agent code runs against multiple libraries (it doesn't — agent output is library-specific)
- The normalized API is simpler than the library's native API (it isn't — it's a wrapper)

The universal bridge adds a layer of indirection without a consumer that benefits from it. Library-specific files are simpler, more debuggable, and more familiar to developers who know their chosen library.

---

## 6. Implications for agents

### Design agent (generates Penpot/Figma designs)

No change. The design agent consumes design-tokens.yaml directly. It never touches bridge.ts, globals.css, or any library-specific file. Its job is to produce designs that are token-aligned, not library-aligned.

### Implementation agent (generates React code)

The implementation agent needs to know:

1. **Which tokens exist** → reads design-tokens.yaml or imports design-tokens.d.ts
2. **Which components to use** → reads component-library.yaml for import paths
3. **How to apply tokens** → depends on the library:
   - shadcn: uses Tailwind utility classes (`bg-primary`, `text-sm`, `rounded-md`)
   - MUI: uses `sx` prop or `styled()` with `theme.palette.primary.main`
   - Chakra: uses style props (`colorScheme="brand"`, `borderRadius="md"`)

The implementation agent's prompt template must include library-specific code generation instructions. This is already handled by the component-library.yaml's `react_mappings` — but Phase 2 will need to expand those mappings with theming idioms per library.

### QA agent (visual verification)

No change. The QA agent compares rendered screenshots against design files. It doesn't care how tokens reach the DOM — only that the visual output matches.

---

## 7. Migration path

When Phase 2 begins:

1. Add `theme_mechanism` field to component-library.yaml:
   ```yaml
   library_id: mui
   theme_mechanism: js-theme-object  # or "css-variables" for shadcn
   ```
2. Init generator reads `theme_mechanism` and selects the appropriate bridge template
3. For `js-theme-object`: generate bridge.ts with the library's `createTheme` / `extendTheme` call
4. For `css-variables`: generate globals.css + tailwind.config.ts (existing behavior)
5. design-tokens.d.ts is generated in all cases (library-agnostic)
6. Update implementation agent prompt templates with library-specific theming idioms

No changes needed to design-tokens.yaml, brand.yaml, component-catalog.yaml, or any design agent prompts. The bridge is a *downstream* concern — it translates tokens into library format. Everything upstream of the bridge stays the same.

---

## 8. References

- AgentForge PRD v2.0 — Section 4.3: Token Bridge Architecture
- ADR-001: Design-as-Source-of-Truth Pipeline
- ADR-002: Component Library Strategy
- design-tokens.yaml schema: `agentforge/spec/design-tokens.yaml`
- component-library.yaml schema: `agentforge/spec/component-library.yaml`
