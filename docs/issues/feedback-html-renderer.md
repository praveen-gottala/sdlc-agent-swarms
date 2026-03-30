# Feedback: HTML renderer

1. **Vite alias** — Verify that transitive imports work. If `tree-builder.ts` imports from `../types/design-spec-v2.js`, that relative path must also resolve from the alias root. Test the alias by running `vite build` after creating the first file that uses it; do not wait until Step 4 to discover resolution failures.

2. **Data injection** — Write spec, tokens, and catalog as JSON files to a temp directory alongside `dist/`, then fetch them in `main.tsx` instead of inlining in script tags. This avoids HTML size limits and keeps the injection mechanism clean for large specs.

3. **Correction visibility** — Add a test that takes two versions of the same DesignSpec (original and corrected — e.g., one with overlapping children, one with fixed widths) and verifies the browser renderer produces different output. This validates that the correction loop’s improvements are actually visible in the browser render. Because the self-correction loop in [Phase C] should technically correct the JSON nodes, refer to that improvised version once integrated.

4. **Pre/post correction** — Add a test comparing pre- and post-correction renders.

5. **CSS variable injection** — In `main.tsx`, build the CSS variables string from tokens with `generateCssVariables()` and inject it as a `<style>` node on `document.head` **before** `ReactDOM.createRoot()`. That way variables such as `var(--surface-primary)` exist before React’s first paint. Do **not** put token values in `globals.css` (that file is static and compiled ahead of time); keep only Tailwind directives and `@font-face` there. Resolve tokens to concrete values at runtime in `main.tsx`.

    Example order:

    ```typescript
    // main.tsx — order matters
    import './globals.css'; // Tailwind + fonts only

    const tokens = window.__TOKENS__;
    const cssVars = generateCssVariables(tokens);

    // Inject BEFORE React renders
    const style = document.createElement('style');
    style.textContent = cssVars;
    document.head.appendChild(style);

    // NOW render React
    const root = ReactDOM.createRoot(document.getElementById('root')!);
    root.render(<DesignSpecRenderer spec={...} tokens={...} catalog={...} />);
    document.body.dataset.ready = 'true';
    ```
