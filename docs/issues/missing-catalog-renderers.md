## Prerequisite: Fix missing catalog renderers in React renderer

Before building the browser renderer, fix the parent React renderer's 
incomplete CATALOG_RENDERERS registry. The fuzzy-match in resolver.ts 
is masking 9 missing entries that the Budgetly DesignSpec actively uses. 
Fuzzy-match should handle genuine edge cases, not cover for missing 
registrations.

### File: packages/designspec-renderer/src/renderer/react/components/index.ts

Add these missing entries to CATALOG_RENDERERS:

1. 'button-destructive' — new file button-destructive.ts
   Same pattern as button-primary.ts but uses variant="destructive"
   shadcn: <Button variant="destructive">{label}</Button>

2. 'badge-warning' — handled by existing renderBadge but needs explicit 
   registration so it doesn't rely on fuzzy-match
   
3. 'badge-success' — same as above

4. 'badge-error' — same as above

5. 'badge-info' — same as above
   
   For badges 2-5: the existing renderBadge already works for all variants.
   Just add the explicit registry entries pointing to renderBadge:
```typescript
   'badge-warning': renderBadge,
   'badge-success': renderBadge,
   'badge-error': renderBadge,
   'badge-info': renderBadge,
```

6. 'chip' — new file chip.ts
   Renders as <Badge variant="outline">{label}</Badge>
   
7. 'pagination' — new file pagination.ts  
   Renders as <Pagination> with page numbers
   shadcn import: @/components/ui/pagination

8. 'progress-bar-active' — new file progress-bar.ts
   Renders as <Progress value={node.value ?? 0} />
   shadcn import: @/components/ui/progress

9. 'search-input' — new file search-input.ts
   Renders as <Input type="search" placeholder={node.placeholder ?? "Search..."} />
   shadcn import: @/components/ui/input

### After adding, verify:
1. Run: nx run designspec-renderer:test — all existing tests pass
2. Run: nx run-many -t typecheck — no type errors
3. Grep for fuzzy-match warnings in test output — the 9 catalog IDs 
   above should NO LONGER produce "No renderer for catalog" warnings
4. The fuzzy-match in resolver.ts stays as-is (it handles genuine edge 
   cases) — but it should not be triggered for any catalog ID used in 
   the Budgetly dashboard fixture
