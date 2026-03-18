# ADR-017: Secret Scoping via Env Vars in Phase 1, Vault in Phase 2

## Date
2026-03-18

## Status
Accepted

## PRD Reference
PRD v2.0 Section 19.2: "Agent credentials are managed through vault integration. Agents never see raw secrets. They receive scoped, time-limited tokens that are automatically rotated."

## What the Implementation Does
Phase 1 implements `SecretProvider` backed by environment variables (`AGENTFORGE_MCP_{SERVER}_{KEY}`). The interface is designed for drop-in vault replacement. Specifically:
1. **Environment variable provider** — `createEnvSecretProvider()` reads from `process.env` on each call
2. **Scope enforcement** — governance middleware blocks unauthorized MCP server access before auth middleware injects tokens
3. **Secret masking** — secrets never appear in traces, logs, or error messages
4. **Rotation support** — env var changes are picked up without agent restart (read on every call)

Missing from Phase 1:
- Vault integration (HashiCorp Vault, AWS Secrets Manager)
- Token TTL / automatic expiry
- Per-agent credential isolation at the storage level (isolation is via governance middleware only)

## Reasoning
The PRD's core security intent has three properties:
1. Agents never see raw secrets → **Met**: auth middleware injects tokens; agents don't access SecretProvider directly
2. Scoped tokens → **Met via governance**: permission checker blocks cross-agent server access before any external call
3. Automatic rotation → **Partially met**: env vars can be rotated externally and changes are picked up per-call; no built-in TTL

For single-machine Phase 1 deployment, env vars provide adequate security. Vault adds value for multi-machine deployments and compliance requirements.

## Downstream Impact
- P26 Permissions Enforcement: governance middleware enforces scope. No risk.
- P27 Secret Management tests validate all three security properties. All pass.
- No downstream risk for Wave 5-7.

## Decision
Phase 1: env vars + governance scope enforcement. Phase 2: vault integration with time-limited tokens. The `SecretProvider` interface is stable and vault-ready.

## PRD Update Required
Section 19.2 should add phasing guidance: Phase 1 uses environment variables with governance-enforced scoping; vault integration with time-limited tokens is Phase 2.
