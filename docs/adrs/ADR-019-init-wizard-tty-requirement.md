# ADR-019: Init Wizard TTY Requirement

## Date
2026-03-18

## Status
Accepted

## PRD Reference
Section 9.1.1 — "The CLI wizard has a quick-start mode with opinionated defaults (5 questions, under 3 minutes) and an advanced mode for full customization."

## What the Implementation Does
The `agentforge init` wizard uses Node.js `readline.createInterface` which requires a TTY (interactive terminal) for input. In CI environments and automated test harnesses, TTY is not available. The wizard cannot be integration-tested end-to-end without TTY emulation or a `--non-interactive` flag. Tests validate the wizard's outputs (`buildManifest`, `scaffoldProject`) directly, bypassing the interactive readline layer.

## Reasoning
The PRD specifies an interactive wizard, and the implementation delivers exactly that for real developer terminals. The readline-based approach is the standard Node.js pattern for CLI interactivity. The testing gap is an inherent property of interactive CLI tools — the business logic (manifest building, project scaffolding) is fully tested through unit tests. Adding a `--non-interactive` flag with `--name`, `--repo`, etc. options would close the gap but is not required for Wave 6.

## Downstream Impact
- **Wave 6 (P30 Code Generation):** No impact — Wave 6 tests use `buildManifest`/`scaffoldProject` directly for project setup, not the interactive wizard.
- **Future CI pipelines:** If `agentforge init` is invoked in CI (e.g., for bootstrapping test projects), a `--non-interactive` flag will be needed. This is a Phase 2 enhancement.

## Decision
Accept deviation and update PRD to match implementation.

## PRD Update Required
Yes — Section 9.1.1 should note that non-interactive mode is deferred to Phase 2.

> Updated per ADR-019 (2026-03-18): The interactive wizard requires a TTY. A `--non-interactive` flag for CI/automated environments is deferred to Phase 2.
