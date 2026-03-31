# Task: Analyze Real Renderer Results and Tune Thresholds

## Context

The mechanical validation harness was just updated with `--real-renderer` support. Run a full comparison between the mini-renderer and the real production renderer to identify detection gaps and threshold adjustments.

## Step 1: Run both modes back-to-back

```bash
cd tools/mechanical-validation

# Mini-renderer baseline (all 15 cases)
npx tsx src/index.ts --runs=3 2>&1 | tee output/mini-renderer-run.log

# Real renderer comparison (all 15 cases)  
npx tsx src/index.ts --real-renderer --runs=3 2>&1 | tee output/real-renderer-run.log
```

## Step 2: Compare detection matrices

For each run, extract the detection matrix from the summary.json and produce a side-by-side comparison:

```
                      Mini-Renderer          Real Renderer
                    target  any            target  any
sibling-overlap      ?/3    ?/3             ?/3    ?/3
child-overflow       ?/3    ?/3             ?/3    ?/3
text-clipping        ?/3    ?/3             ?/3    ?/3
badge-oversized      ?/3    ?/3             ?/3    ?/3
zero-collapse        ?/3    ?/3             ?/3    ?/3
```

## Step 3: Analyze badge-oversized specifically

For badge-01, badge-02, badge-03 cases in the real renderer run:
1. Open each screenshot — does the badge visually appear stretched?
2. Check the violations.json — did the badge-oversized check fire?
3. If the badge IS visually stretched but the check didn't fire: the threshold (2.5×) is too high, report what ratio the badge actually has
4. If the badge is NOT visually stretched and the check didn't fire: the prompt bias wasn't strong enough to create the issue — this is fine

## Step 4: Report findings

Produce a summary with:
1. The side-by-side detection matrix
2. For each check category: did the real renderer improve detection? (more true positives)
3. Any new false positives introduced by the real renderer?
4. Recommended threshold changes (if any), with the specific values and rationale
5. Any prompt adjustments needed (if badge prompts aren't creating stretch scenarios)

## Step 5: Apply threshold changes (if recommended)

If Step 4 recommends threshold changes:
1. Update the constants in `packages/designspec-renderer/src/renderer/browser/mechanical-fixes.ts`
2. Run `nx run designspec-renderer:test` — all tests must pass
3. Run `cd tools/mechanical-validation && npx tsx src/integration-test.ts` — 6/6 must pass
4. Re-run `npx tsx src/index.ts --real-renderer --runs=1` to verify the new thresholds improve detection

Do NOT change thresholds without evidence from the comparison data. If the current thresholds work well, say so and make no changes.