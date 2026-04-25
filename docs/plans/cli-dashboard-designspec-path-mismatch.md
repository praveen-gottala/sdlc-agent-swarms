# Handoff: CLI vs Dashboard — `designspec-v2` / design status mismatch

**Date:** 2026-04-25  
**Context:** After Phase 2 CLI migration, `agentforge design:page` writes pipeline artifacts under `.agentforge/previews/`, while Design Studio and related APIs still treat `agentforge/designs/<pageId>.json` as the **single source of truth** for “a design exists” and for loading the spec. This handoff documents confirmed behavior, root cause, and a minimal fix direction for the next implementer.

---

## Symptoms (observed)

1. **CLI completes** and reports e.g. `.../.agentforge/previews/page-001/penpot-design.json` (and `scripts/designspec-v2.json`).
2. **Design Studio** still shows **“No design yet”** and list entries show **“Spec pending”** for the same `pageId`.
3. **Browser correction** on `--tool browser` can fail with Playwright: `browserType.launch: Executable doesn't exist` — **separate** from the path/status issue; requires `npx playwright install` (or env without sandbox cache).

---

## Confirmed: two different on-disk contracts

| Artifact | Typical path (single-page CLI) | Typical path (`design:page:all`) | Consumer |
|----------|--------------------------------|----------------------------------|----------|
| Pipeline V2 spec (cache) | `.agentforge/previews/<moduleId>/scripts/designspec-v2.json` | `.agentforge/previews/bookshelf-<pageId>/scripts/designspec-v2.json` | CLI replay-browser, Prototype API scanner, ad-hoc tools |
| Dashboard “canvas” spec | `agentforge/designs/<pageId>.json` | same | `GET /api/pages/[pageId]/design/spec`, Design Studio flow when `designStatus` allows load |

`moduleId` for `design:page` is **`resolved page.id`** (e.g. `page-001`), not a bookshelf prefix — see `packages/cli/src/commands/design-page.ts` (moduleId from resolved page).  
`design:page:all` uses `bookshelf-${page.id}` for preview dirs — see `packages/cli/src/commands/design-page-all.ts`.

---

## Root cause A: `/api/pages` overwrites `designStatus` to `draft`

`GET /api/pages` **forces** any non-`draft` `designStatus` back to `draft` if `agentforge/designs/<id>.json` is missing.

**File:** `packages/dashboard/src/app/api/pages/route.ts`  
**Logic (paraphrased):** if `p.designStatus !== 'draft'` and `agentforge/designs/${p.id}.json` does not exist → return `'draft'`.

**Effect:** A page can have a full CLI pipeline output under `.agentforge/previews/.../designspec-v2.json` but the dashboard still shows **`designStatus: draft`**, because the YAML field is ignored when the file under `agentforge/designs/` is absent.

`pages.yaml` in fixtures (e.g. `apps/gamingzone/agentforge/spec/pages.yaml`) still has `designStatus: draft` for pages — CLI does not bump this when writing previews.

---

## Root cause B: Design Studio only fetches the spec in “rendered-like” states

**File:** `packages/dashboard/src/app/(dashboard)/design/page.tsx`

The effect that loads the spec only runs when `selectedDesignStatus` is one of: **`rendered` | `correction` | `approved`**.  
If status stays **`draft`**, the UI shows **“No design yet”** and never calls `GET /api/pages/.../design/spec?bundle=true` for loading.

So even a correct preview file on disk does not show in the iframe until the **page’s design state machine** in YAML/API moves past draft (or the fetch logic is extended for preview-only cases).

---

## Root cause C (partial): spec fetch route historically only read `agentforge/designs/`

`GET /api/pages/[pageId]/design/spec` was documented/implemented to read `agentforge/designs/<pageId>.json` only.

A fix direction (may already be partially applied in a branch): add fallbacks, e.g. in order:

1. `agentforge/designs/<pageId>.json`
2. `.agentforge/previews/<pageId>/scripts/designspec-v2.json`
3. `.agentforge/previews/bookshelf-<pageId>/scripts/designspec-v2.json`

**Important:** on-disk `designspec-v2.json` must be **raw `DesignSpecV2`** (object with `screen`, `width`, `nodes` as a map), not a wrapped `DesignOutput` like `{ spec: { ... } }` — consumers such as `stripPersistentOverlays` in `GET /api/prototype` call `Object.entries(spec.nodes)`.

---

## Prototype /api/prototype (related)

`GET /api/prototype` discovers screens from **preview** dirs and/or `agentforge/designs/`. It loads JSON and runs `stripPersistentOverlays` on each screen spec. If a file has **wrong shape** (e.g. `nodes` missing or nested under `spec` only in a way that is not a valid `DesignSpecV2`), it can **500** at `spec-split.ts` (`Object.entries(spec.nodes)`).

This is a **shape** issue, not a page-id naming issue, but the same “wrapped vs raw” file content matters.

---

## Pipeline cache layer (intended contract)

`runDesignPipeline` persists `design` stage to `scripts/designspec-v2.json` via `saveCachedArtifact` with artifact key `designSpecV2`.

**Intended on-disk file:** the **V2 spec object** (same shape the renderer expects).

If `designSpecV2` was ever written as a full `DesignOutput` object, the file can be a **wrapper**; loaders must either normalize on read or write only the inner `spec` on save.

**Files to verify:** `packages/agents-ux/src/design-pipeline/cache.ts` (and any `MOCK_` / tool-call extractors in `extractDesignSpecFromToolCall`).

---

## Playwright (orthogonal)

Post-pipeline **browser correction** uses Playwright. The common failure is missing browser binaries in the current environment: message suggests `npx playwright install`. This does not fix the dashboard “no design” by itself; it only enables correction to run.

---

## Recommended fix strategy (for the next agent)

1. **Single product decision:** Should CLI preview output **also** (or instead) **sync to** `agentforge/designs/<pageId>.json` when a page id is known, or should the dashboard **treat preview paths as first-class**?
2. **Minimal dashboard alignment (no double-write):**
   - In `GET /api/pages`, treat existence of  
     `.../previews/<pageId>/.../designspec-v2.json` *or* `.../previews/bookshelf-<pageId>/.../designspec-v2.json`  
     as at least a signal that a spec exists (e.g. bump effective status or a new `previewSpecAvailable` field).
   - In `design/page.tsx`, either allow loading the spec in `draft` when a preview file exists, or set `designStatus` from a server-side rule when preview exists.
3. **Unify on-disk shape:** ensure `scripts/designspec-v2.json` is always raw `DesignSpecV2`; normalize legacy wrapped files in `loadCachedArtifact` or one-time migration.
4. **Tests:** one integration test: run mock CLI, assert `GET /api/pages` and/or `GET /api/pages/:id/design/spec?bundle=true` can load the spec without manual copy to `agentforge/designs/`.

---

## Files to read first (in order)

1. `packages/dashboard/src/app/api/pages/route.ts` — `designStatus` + file check  
2. `packages/dashboard/src/app/(dashboard)/design/page.tsx` — when `design/spec` is fetched  
3. `packages/dashboard/src/app/api/pages/[pageId]/design/spec/route.ts` — where the spec is read from disk  
4. `packages/cli/src/commands/design-page.ts` — `moduleId`, `ensureOutputDir`, `PIPELINE_ARTIFACTS.designSpecV2`  
5. `packages/agents-ux/src/design-pipeline/cache.ts` — what exactly is written for `designSpecV2`  
6. `packages/agents-ux/src/ux-design/penpot-script-executor.ts` — `extractDesignSpecFromToolCall` (required `submit_design` args shape)  
7. `apps/gamingzone/agentforge/spec/pages.yaml` — `designStatus` and page ids (example: `page-001`)

---

## What not to conflate

- **Page name in UI** (“Dashboard / Home”) is display text from `pages.yaml` — the stable key is always **`page.id`**, not the label.
- **Penpot** vs **Browser** tool affects pipeline internals; the *dashboard path split* is the same unless you wire tool-specific copy paths.

This document is intentionally implementation-agnostic so the next agent can choose between “sync to designs/” (dashboard-first) vs “teach API to read previews/” (CLI-first) with clear tradeoffs.
