# ADR-004: Governance Middleware Check Ordering

## Status

Accepted

## Context

PRD v2.0 Section 4.4 specifies the governance middleware check ordering as:

```
checkPermission(agent, action) → Allow | Deny
enforceHITL(action)            → Proceed | Pause | Notify | Denied
checkBudget(agent, estimatedCost) → Allow | Deny
```

This implies the execution order: **permission → HITL → budget**.

During implementation, we identified that this ordering creates a problem:
`enforceHITL` with `full_approval` or `review_and_override` policies creates
external approval workflows — Slack messages, Telegram inline keyboards, email
notifications — that consume human attention and create pending gates. If the
subsequent `checkBudget` step denies the action, the approval request becomes
an orphan: a human sees a request, spends time reviewing it, and either the
system silently discards their approval or they receive a confusing cancellation.

## Decision

The implementation uses the ordering: **permission → budget → HITL**.

```
1. checkPermission(agent, action)    — synchronous, no side effects
2. checkBudget(agent, estimatedCost) — synchronous, no side effects
3. enforceHITL(action)               — may create external approval workflows
```

## Rationale

- **Budget check is synchronous and cheap.** It reads in-memory spend counters
  and compares against configured limits. No I/O, no external calls.
- **HITL enforcement creates external workflows.** It sends messages to Slack
  channels, creates Telegram inline keyboards, and emits `HITLApprovalRequested`
  events. These are visible to humans and consume attention.
- **Checking budget before HITL prevents wasted human attention.** If an action
  would be denied on budget, there is no reason to ask a human to review it.
  No orphaned approval requests, no confusing cancellation messages.
- **Fail-fast principle.** Both permission and budget are fast, deterministic
  gates. Running all cheap checks before expensive/external ones is a standard
  middleware pattern.

## Consequences

- PRD v2.0 Section 4.4 should be updated to reflect the
  `permission → budget → HITL` ordering in the next revision.
- The `executeGovernancePipeline()` function in `governance-middleware.ts`
  encodes this ordering and is the canonical reference.
- Tests in `governance-three-check-chain.test.ts` validate this ordering with
  execution-order spies and short-circuit assertions.
