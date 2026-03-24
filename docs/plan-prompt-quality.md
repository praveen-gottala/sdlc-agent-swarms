# Plan: Design Prompt Quality Improvements

Status: TODO — created 2026-03-23 from observed issues in tictactoe-app home screen design.

## Observed Issues

### 1. Unequal card widths
**Problem**: Game mode cards ("VS Computer", "VS Friend", "Quick Match") have different widths instead of filling the row equally.
**Root cause**: The design system prompt doesn't enforce equal-width children in horizontal auto-layout. The LLM creates cards with `layoutSizingHorizontal: "HUG"` instead of `"FILL"`.
**Fix**: Add explicit instruction in `ux-dashboard-design-system.md`: "When creating cards in a horizontal row, set `layoutSizingHorizontal: FILL` on each card so they share available width equally."

### 2. Text clipping / overflow
**Problem**: Card descriptions are cut off mid-word ("Get matched with a random player instantly. Jump right into th...").
**Root cause**: Text nodes have fixed-size parents with no overflow handling. The LLM creates frames with fixed heights but long text.
**Fix**:
- Instruct the LLM to use `layoutSizingVertical: "HUG"` on card frames so they expand to fit content.
- Or instruct it to set `textAutoResize: "HEIGHT"` on text nodes so text wraps within the frame width.

### 3. Missing components from component tree
**Problem**: ref-validation warns that `GameSessionCard`, `FriendInviteModal`, `FriendsList`, `FriendCard` were in the planning tree but not generated.
**Root cause**: The LLM has a token limit and sometimes omits lower-priority components. With 56 steps already, it may have hit its output ceiling.
**Fix options**:
- Increase `maxTokens` for the design LLM call (currently 32000)
- Split the component tree into batches — design top-level components first, then children in a second pass
- Add a post-generation check: if component tree items are missing, run a targeted follow-up prompt for just those components

### 4. Avatar step failure (step 5)
**Problem**: "Parent node does not support children: 55:180" — tried to add text inside an ellipse.
**Root cause**: The LLM generated a `create_text` step with the ellipse (PlayerAvatar) as parent. Ellipses don't support children in Figma.
**Fix**: Add to the design system prompt: "NEVER add children to ELLIPSE, RECTANGLE, LINE, VECTOR, POLYGON, or STAR nodes — only FRAME and COMPONENT nodes can contain children."

### 5. Phase C fixer passes null params
**Problem**: `resize_node` kept failing with "width: Expected number, received null" across all 3 correction attempts.
**Root cause**: The fixer LLM generates parameters without proper values. No input validation catches this before the MCP call.
**Fix**:
- Add param validation in `executeDesignFixes()` — reject steps where required params are null/undefined/NaN
- Add to the fixer prompt: "All numeric parameters (width, height, x, y, fontSize) MUST be positive numbers. Never pass null."
- When `get_node_info` returns the current dimensions, the fixer should use those as defaults if it can't compute new ones

### 6. Correction loop score regression (75 → 72)
**Problem**: Score went DOWN after corrections, from 75 to 72.
**Root cause**: Failed fixes (resize returning errors) leave the design unchanged, but the evaluator may penalize differently on subsequent screenshots if minor rendering differences occur. Also, successful `scan_text_nodes` calls don't actually change anything — they're read-only.
**Fix**:
- Track whether any write operations actually succeeded before re-evaluating
- Skip re-evaluation if all fix attempts failed (no point re-scoring an unchanged design)
- The fixer should only emit write operations (create/resize/set_*), not read operations (scan/get)

## Implementation Order

1. **Param validation in fixer** (quickest win, prevents all null-param errors)
2. **Design system prompt: equal-width cards + no children on shapes** (fixes most layout issues)
3. **Text overflow handling** (auto-resize text or hug-content frames)
4. **Skip re-evaluation on all-failed corrections** (prevents score regression noise)
5. **Missing component follow-up pass** (handles incomplete generation)

## Files to modify

- `packages/agents-ux/src/prompts/ux-dashboard-design-system.md` — design rules
- `packages/agents-ux/src/ux-design/design-fixer.ts` — param validation + prompt
- `packages/agents-ux/src/ux-design/design-evaluator.ts` — skip-on-no-change logic
- `packages/agents-ux/src/ux-design/ux-dashboard-design.ts` — missing component follow-up
