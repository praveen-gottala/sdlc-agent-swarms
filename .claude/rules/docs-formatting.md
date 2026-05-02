# Markdown Formatting for Backstage TechDocs

Docs under `docs/` render in Backstage TechDocs (MkDocs + Material theme).
The `mdx_fix_list_spacing` extension handles automatic visual polish
(inline code backgrounds, table zebra stripes, blockquote borders, HR styling,
list spacing). These features require deliberate use in source markdown:

## Admonitions — use for callouts

```
!!! warning "Title here"

    Indented content (4 spaces). Supports bold, code, lists inside.
```

Types: `note`, `abstract`, `info`, `tip`, `success`, `question`,
`warning`, `failure`, `danger`, `bug`, `example`, `quote`

**When to use:** `**Warning:**`, `**Note:**`, `**Important:**`,
`**Context for implementers:**` patterns should be admonitions, not bold text.

## Collapsible sections — use for long details

```
??? warning "Implementation gotchas (Phase X)"

    - Detail 1
    - Detail 2
```

`???` = collapsed by default. `???+` = expanded by default.

**When to use:** Implementation gotchas, caveats, long discovery notes,
risk details — anything useful for reference but not needed on first read.

## Blank line before lists (REQUIRED)

Python-Markdown requires a blank line between paragraph text and bullet lists.
Without it, the list renders as inline text with literal dashes.

```markdown
<!-- GOOD -->
**Context:**

- item 1
- item 2

<!-- BAD — renders as inline text in TechDocs -->
**Context:**
- item 1
```

The `mdx_fix_list_spacing` extension auto-fixes this at build time,
but writing correct markdown avoids parser-dependent behavior.

## Dense prose — break into structured sections

Wall-of-text paragraphs (like executive summaries or context sections)
should be broken into scannable sub-sections using:
- Short intro sentence, then bullet list for key points
- Tables for status/comparison data
- Admonitions for highlighted takeaways

## Automatic styling (no source changes needed)

These are handled by the Python-Markdown extension at build time:
- Tables → zebra stripes, borders, styled headers
- Inline `code` → gray background (#eff1f3)
- Blockquotes → blue left border + light background
- Horizontal rules → clean thin line with spacing
- Lists after paragraphs → blank line auto-inserted
