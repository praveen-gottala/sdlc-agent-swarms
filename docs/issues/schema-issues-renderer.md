25 visual issues found in the bill-entry Penpot render. Categorized 
by root cause:

## Fixture issues (fix bill-entry.json):

1. Header px: 420 is too large — change to px: 24. The 420px 
   padding was copied from settings-form (centered narrow header) 
   but bill-entry should have a full-width header.

2. Input backgrounds should be "white" or a contrasting color, 
   not "surface-primary" which matches the page background. 
   But wait — there's no "white" in the current tokens. Add 
   "surface-input": "white" to the semantic tokens, or use 
   the existing surface-elevated for input backgrounds via 
   an override on input nodes.

3. Stepper background token "surface-primary" blends with the 
   card. Change stepper catalog default background from 
   "surface-elevated" to "surface-primary" — or change the 
   fixture's stepper to use overrides: { background: "surface-elevated" }.

## Renderer issues (fix component renderers):

4. Segmented control pill text is NOT centered. The pill uses 
   makeText with wrapWidth but no textAlign. Fix in 
   segmented-control.ts: add textAlign center to the pill text:
   After creating ptxt, add: b.line(`${tv}.textAlign = 'center';`);

5. Display-readonly layout is column (stacked) but should be row 
   (label left, value right) with justify: space-between. Fix 
   display-readonly.ts: change flex dir from 'column' to 'row', 
   add justify: 'space-between', align: 'center'.

6. Stepper "+" still slightly clipped. The 20px padding fix 
   helped but isn't enough. The issue is the controls container 
   uses horizontalSizing: 'auto' which doesn't account for the 
   circular button radius. Add right padding of 4px to the stepper 
   or increase to px: 24.

7. Text alignment not propagating to child text nodes. The tagline 
   container has align: "center" which affects flex item positioning, 
   but text CONTENT alignment (t.textAlign) needs to be set on 
   each text node. The text renderer should check the parent node's 
   layout.align and set textAlign accordingly, OR the fixture 
   should set textAlign on each text node explicitly.

8. Helper text color appears teal instead of gray. Check the 
   input-text renderer's helper text — it should use 
   tokenRef('text-secondary') with opacity 0.7. Verify the 
   fillColor and fillOpacity values.

## Schema/token issues:

9. No "white" primitive in the color tokens. The only light 
   surfaces are warm-cream (#FFF8E7) and soft-white (#FAFAF8), 
   both warm-tinted. For input fields that need maximum contrast 
   against cards, add:
   primitive: { white: "#FFFFFF" }
   semantic: { "surface-input": "white" }
   Then update input-text catalog default: background: "surface-input"

10. Divider opacity 0.3 is too subtle on cream backgrounds. 
    Consider increasing to 0.5 in the divider renderer.

Priority order: fix #4 (pill text centering) and #5 (display-readonly 
layout) first — these are renderer bugs. Then #1 (header padding) 
and #7 (text alignment) — fixture + renderer. The token/contrast 
issues (#9) can wait for a design review.