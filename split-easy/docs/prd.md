# SplitEase — Product Requirements Document
**Version:** 1.0  
**Author:** Product Team  
**Date:** March 24, 2026  
**Status:** Draft  

---

## 1. Problem Statement

Splitting a bill among friends is a universally awkward experience. Existing solutions either oversimplify (equal split only) or overcomplicate (requiring accounts, sign-ups, friend lists). People need a tool they can open at the table, punch in numbers, and share the result — all in under 60 seconds.

**The core tension:** Speed vs. accuracy. Most people default to "just split it evenly" not because it's fair, but because doing the math for uneven splits with tax and tip is painful. This leaves someone consistently overpaying and silently resenting it.

---

## 2. Product Vision

A zero-friction, 2-screen web app that calculates fair bill splits (even or uneven) with tax and tip, and generates a shareable summary — no accounts, no installs, no nonsense.

**Design Philosophy:** The app should feel like a calculator, not a platform. Every interaction should reduce cognitive load, not add it.

---

## 3. Target Users

| Persona | Context | Pain Point |
|---|---|---|
| **The Organizer** | Always the one collecting money after group dinners | Tired of doing mental math and chasing people on Venmo |
| **The Fair Splitter** | Ordered a salad while everyone else got steak | Doesn't want to subsidize others but feels awkward saying so |
| **The Quick Resolver** | Splitting a cab, coffee run, or shared grocery trip | Needs an answer in 10 seconds, not an app onboarding flow |

---

## 4. Success Metrics

| Metric | Target | Rationale |
|---|---|---|
| Time to first split result | < 30 seconds | If it's slower than napkin math, it fails |
| Share rate | > 40% of completed splits | Sharing = the viral loop; if people don't share, it's not useful enough |
| Return usage (7-day) | > 25% | People eat out weekly — the app should become a habit |
| Bounce rate on Screen 1 | < 20% | The entry screen must feel immediately obvious |

---

## 5. Screen Architecture

The app consists of exactly **2 screens** with a clear one-way flow and a back path.

```
┌─────────────┐         ┌─────────────────┐
│  SCREEN 1   │────────▶│    SCREEN 2      │
│  Bill Entry  │         │  Split Breakdown │
│             │◀────────│                  │
└─────────────┘  "Edit" └─────────────────┘
```

---

## 6. Screen 1 — Bill Entry

### 6.1 Purpose
Capture all inputs needed to calculate a fair split. Must feel like filling in 3-4 fields, not a form.

### 6.2 Layout (top to bottom)

#### Header
- App name "SplitEase" — small, unobtrusive
- Tagline: "Split it fair. Split it fast." — visible only on first visit (localStorage flag)

#### Section A: The Bill
| Field | Type | Default | Validation | Notes |
|---|---|---|---|---|
| Bill Total | Currency input | Empty, auto-focused | > 0, max 99999.99 | Large font, prominent. This is the first thing users interact with. |
| Tax Amount | Currency input | 0.00 | ≥ 0 | Optional. Many receipts separate tax. If left at 0, tax is assumed included in total. |
| Tip % | Segmented control | 18% | 0–100% | Pre-set buttons: 15%, 18%, 20%, 25%, Custom. Custom reveals a numeric input. |
| Tip Amount | Read-only display | Calculated | — | Shows dollar value of selected tip %. Updates live. |
| **Grand Total** | **Read-only display** | **Calculated** | — | **= Bill Total + Tax + Tip. Bold, prominent.** |

#### Section B: The People
| Field | Type | Default | Validation | Notes |
|---|---|---|---|---|
| Number of People | Stepper (+/−) | 2 | 2–20 | Each increment adds a name row below |
| Person Names | Text inputs | "Person 1", "Person 2"... | Non-empty, max 20 chars | Pre-filled with generic names. Editable. |
| Split Mode | Toggle | "Equal" | — | Two options: **Equal** or **Custom**. Selecting "Custom" reveals per-person amount or percentage inputs. |

#### Section B.1: Custom Split Mode (conditional)
When "Custom" is selected, each person row expands to include:

| Field | Type | Notes |
|---|---|---|
| Item/Amount | Currency input | What this person's portion of the pre-tip-and-tax subtotal is |
| Running balance | Read-only | Shows "X.XX remaining to assign" — updates live as amounts are entered |

**Key UX decision:** Custom mode assigns the *subtotal* (pre-tax, pre-tip). Tax and tip are then distributed proportionally to each person's share of the subtotal. This is the mathematically fair approach and avoids the "who tips on what" argument.

#### Primary CTA
- **"Calculate Split" button** — full-width, high contrast
- Disabled until Bill Total > 0 and all custom amounts are assigned (if in custom mode)
- Navigates to Screen 2

### 6.3 Interaction Details
- Currency inputs: auto-format with commas, strip non-numeric on paste
- Tip segmented control: tapping a preset deselects "Custom" and vice versa
- Stepper: animate person rows in/out (subtle slide, < 200ms)
- Custom mode toggle: smooth expand/collapse of per-person inputs
- All calculations update in real-time — no "recalculate" step
- Keyboard: Tab order follows visual order; Enter on last field triggers CTA

### 6.4 Edge Cases
| Scenario | Behavior |
|---|---|
| User enters 0 for bill total | CTA stays disabled, subtle red border on field |
| Custom amounts don't sum to subtotal | Show remaining balance in amber; CTA disabled with tooltip "Assign the full amount" |
| Custom amounts exceed subtotal | Remaining balance goes negative in red; CTA disabled |
| User switches from Custom back to Equal | Clear all per-person amounts, collapse custom inputs |
| Very long person name | Truncate with ellipsis at 20 chars in display, full name in tooltip |
| 20 people | Scroll within person list; stepper + button disabled |

---

## 7. Screen 2 — Split Breakdown

### 7.1 Purpose
Show each person's share clearly and enable instant sharing of the result.

### 7.2 Layout (top to bottom)

#### Summary Header
| Element | Content |
|---|---|
| Grand Total | "Total: $XXX.XX" |
| Split Mode | "Equal split" or "Custom split" badge |
| Headcount | "X people" |

#### Breakdown Cards
One card per person, each showing:

| Element | Format | Notes |
|---|---|---|
| Person Name | Bold, left-aligned | |
| Their Share | Large dollar amount, right-aligned | The number they owe |
| Breakdown tooltip/expand | Expandable row | "Subtotal: $X.XX + Tax: $X.XX + Tip: $X.XX" |
| Venmo/PayPal deep link (optional) | Icon button | Pre-fills amount. Uses `venmo://paycharge?txn=pay&amount=X.XX` URI scheme. |

**Visual hierarchy:** The name and total share are scannable at a glance. The breakdown is secondary (collapsed by default, tap to expand).

#### Rounding Notice
- If individual shares don't sum exactly to the grand total due to rounding, show a subtle note: "Adjusted by $0.01 — [Person 1] covers the difference"
- Always assign the rounding penny to the first person (the organizer)

#### Action Bar (sticky bottom)

| Action | Type | Behavior |
|---|---|---|
| **Share** | Primary button | Opens native Web Share API (`navigator.share`) with formatted text summary. Fallback: copy-to-clipboard with toast confirmation. |
| **Edit** | Secondary button | Returns to Screen 1 with all fields preserved |
| **New Split** | Tertiary/text link | Clears all data, returns to Screen 1 |

### 7.3 Share Payload

The shared text should be human-readable in any messaging app:

```
🍽️ SplitEase Breakdown

Total: $156.00 (incl. 18% tip)

• Alice: $52.00
• Bob: $52.00
• Carol: $52.00

Split fairly with SplitEase → [URL]
```

### 7.4 Edge Cases
| Scenario | Behavior |
|---|---|
| Web Share API not supported | Fall back to "Copy to Clipboard" with snackbar "Copied!" |
| Venmo/PayPal not installed | Deep link opens app store or fails silently — don't block the flow |
| User hits browser back | Return to Screen 1 with state preserved (use History API) |
| User refreshes Screen 2 | State is in URL query params or sessionStorage — breakdown reconstructs |

---

## 8. Data Architecture

### 8.1 State Model

No backend. All state lives client-side.

```
BillState {
  subtotal: number          // User-entered bill amount
  taxAmount: number         // User-entered tax
  tipPercent: number        // Selected tip percentage
  tipAmount: number         // Computed: subtotal × tipPercent
  grandTotal: number        // Computed: subtotal + taxAmount + tipAmount
  splitMode: 'equal' | 'custom'
  people: [
    {
      id: string            // UUID
      name: string
      customSubtotal: number | null   // Only in custom mode
      taxShare: number      // Computed proportionally
      tipShare: number      // Computed proportionally
      totalShare: number    // Computed: customSubtotal + taxShare + tipShare
    }
  ]
}
```

### 8.2 Storage Strategy
| Store | Purpose | Lifetime |
|---|---|---|
| React state (or vanilla JS state) | Active session calculations | Tab lifetime |
| sessionStorage | Preserve state on refresh / back-nav | Browser session |
| URL query params | Enable shareable result links | Permanent (stateless) |
| localStorage | First-visit flag for tagline | Permanent |

### 8.3 Calculation Logic (Pseudocode)

```
// Equal split
perPersonSubtotal = subtotal / numberOfPeople
perPersonTax = taxAmount / numberOfPeople
perPersonTip = tipAmount / numberOfPeople
perPersonTotal = round(perPersonSubtotal + perPersonTax + perPersonTip, 2)

// Custom split
for each person:
  shareRatio = person.customSubtotal / subtotal
  person.taxShare = round(taxAmount × shareRatio, 2)
  person.tipShare = round(tipAmount × shareRatio, 2)
  person.totalShare = person.customSubtotal + person.taxShare + person.tipShare

// Rounding correction
roundingError = grandTotal - sum(allPersonTotals)
people[0].totalShare += roundingError  // Organizer absorbs the penny
```

---

## 9. Non-Functional Requirements

| Requirement | Target | Rationale |
|---|---|---|
| First Contentful Paint | < 1.0s | Used at the table, often on cellular |
| Total bundle size | < 50KB gzipped | No framework bloat — vanilla JS or Preact |
| Offline capability | Full functionality offline | Service worker caches the single-page app |
| Accessibility | WCAG 2.1 AA | Proper labels, focus management, screen reader announcements for live calculations |
| Browser support | Last 2 versions of Chrome, Safari, Firefox, Edge | Cover 95%+ of mobile browsers |
| Responsive breakpoints | 320px–768px primary, 769px+ secondary | Mobile-first; desktop is a nice-to-have |

---

## 10. Technical Recommendations

### 10.1 Stack Options (pick one)

| Option | Pros | Cons |
|---|---|---|
| **Vanilla JS + HTML/CSS** | Smallest bundle, zero dependencies, fastest FCP | Manual state management, more boilerplate |
| **Preact + HTM** | React-like DX at 3KB, component model | Slight learning curve if unfamiliar |
| **React (Vite)** | Familiar ecosystem, fast dev | Larger bundle (~40KB min), overkill for 2 screens |

**Recommendation:** Preact + HTM for the best balance of DX and performance. Vanilla JS if bundle size is the absolute priority.

### 10.2 Deployment
- **Host:** Vercel, Netlify, or GitHub Pages (all free tier)
- **Domain:** Custom domain optional; works fine on `splitease.vercel.app`
- **CI/CD:** Push to main → auto-deploy

### 10.3 PWA Configuration
- `manifest.json` with app name, icons, `display: standalone`
- Service worker for offline caching (Workbox or hand-rolled)
- "Add to Home Screen" prompt on second visit

---

## 11. Future Considerations (Out of Scope for v1)

These are explicitly **not** in v1 but are worth designing around so they don't require a rewrite:

| Feature | Why Not Now | Design Implication |
|---|---|---|
| Receipt photo OCR | Requires backend/API integration | Keep bill entry as a clean input interface that could accept pre-filled values |
| Group history | Requires auth + persistence | Use the same BillState schema so it's trivially serializable |
| Currency conversion | Adds complexity | Use a currency code field that defaults to USD but is extensible |
| Venmo/PayPal request integration | Requires OAuth | Keep deep links as the integration surface |
| Multi-bill splitting (e.g., whole trip) | Different UX paradigm | Keep single-bill as the atomic unit |

---

## 12. Open Questions

| # | Question | Impact | Recommendation |
|---|---|---|---|
| 1 | Should we support item-level entry (each person picks dishes from a list) instead of just lump-sum custom amounts? | High UX complexity increase | **No for v1.** Lump-sum custom covers 90% of cases. Item-level is a v2 feature. |
| 2 | Should the URL-shared result be editable by the recipient? | Security/trust concern | **No.** Shared links are read-only snapshots. Only the creator can edit via the Edit button. |
| 3 | Should we track analytics? | Privacy vs. product insight | **Minimal.** Plausible Analytics (privacy-friendly) for page views and share events only. No PII. |
| 4 | How do we handle currencies other than USD? | Internationalization scope | **v1 is USD-only.** Design the input to accept a currency symbol prop for future extensibility. |

---

## 13. Launch Checklist

- [ ] Screen 1 fully functional with real-time calculations
- [ ] Screen 2 renders correct breakdown for equal and custom splits
- [ ] Rounding logic verified with edge cases (e.g., $100 ÷ 3 people)
- [ ] Share functionality works on iOS Safari, Android Chrome
- [ ] Clipboard fallback works when Web Share API is unavailable
- [ ] Browser back/forward preserves state
- [ ] Page refresh on Screen 2 preserves state
- [ ] Accessibility audit passes (axe-core, keyboard navigation)
- [ ] Lighthouse Performance score > 95
- [ ] PWA installable on mobile
- [ ] Tested on 320px viewport (iPhone SE)
- [ ] Tested with 20 people in custom split mode
- [ ] Deployed to production URL
- [ ] OG meta tags set for social sharing preview

---

*End of PRD v1.0*
