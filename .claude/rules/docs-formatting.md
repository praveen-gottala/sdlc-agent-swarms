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

## Voice — strengths, not defenses

Frame architectural tradeoffs as positive statements of what IS, not as
answers to imagined objections. The reader hasn't formed the objection yet —
don't plant it.

```markdown
<!-- GOOD -->
**Parallel where it's safe, sequential where it matters.**

<!-- BAD — defensive, signals insecurity -->
**Where's the parallelism?** Sequential doesn't mean slow...
```

Study how Vercel, Linear, and Stripe handle tradeoffs: they state what the
system does as a feature. They don't acknowledge the concern, then rebut it.
This applies to home pages, concept pages, and any user-facing documentation.

## Page flow — earn the reader's attention

Structure pages so the reader follows naturally. Each section should earn
the next. Apply these rules especially to high-traffic pages (home, overview,
concept pages):

**Lead with what it does, not what others get wrong.**

```markdown
<!-- GOOD — leads with the product -->
## From idea to working software
CHIP takes a product requirement through four stages...

<!-- BAD — leads with competitors failing -->
## Why Most Agent Architectures Fail
When multiple AI agents write to the same codebase...
```

**Don't repeat what the reader just saw.** If a diagram shows the 4 stages,
the next section should ADD information (how they connect, what's different),
not list the same 4 stages again with slightly different words.

**Insider concepts must be earned.** "Context quality and write-coupling are
the axes" means nothing to a first-time reader. Show the architecture first,
let them see the pattern, THEN name the principle — as a closing insight,
not an opener.

**Don't duplicate the nav.** If the sidebar already shows Architecture,
Specs, How-To Guides — a table listing the same sections with "when to read"
context is filler. The nav IS the wayfinding.

**Orphaned paragraphs break flow.** Every block of content needs either a
heading or a clear visual connection to the section above it. A paragraph
floating between two sections reads as an afterthought.

## Automatic styling (no source changes needed)

These are handled by the Python-Markdown extension at build time:
- Tables → zebra stripes, borders, styled headers
- Inline `code` → gray background (#eff1f3)
- Blockquotes → blue left border + light background
- Horizontal rules → clean thin line with spacing
- Lists after paragraphs → blank line auto-inserted
