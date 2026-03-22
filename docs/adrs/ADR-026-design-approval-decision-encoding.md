# ADR-026: Design Approval Decision Encoding

## Status
Accepted

## Context

The HITL wireframe preview gate needs 4 decision types for design approval:
- `approved` — proceed to implementation
- `changes_requested` — re-run planning with feedback
- `redesign` — restart from research with a new direction
- `use_figma` — skip LLM-generated wireframe, use Figma source instead

The core `HITLDecision` type (`packages/core/src/types/agent-contract.ts:20`) only
has 3 values: `'approved' | 'rejected' | 'changes_requested'`.

Modifying core `HITLDecision` would ripple through all channel implementations
(Slack, Telegram, CLI) and governance middleware.

## Decision

Create a local `DesignDecision` discriminated union in the approval gate module
(`packages/agents-ux/src/preview/design-approval-gate.ts`). Map to/from
`HITLDecision` for channel infrastructure:

| DesignDecision        | HITLDecision         | Feedback encoding                        |
|-----------------------|----------------------|------------------------------------------|
| `approved`            | `approved`           | (none)                                   |
| `changes_requested`   | `changes_requested`  | plain text feedback                      |
| `redesign`            | `rejected`           | prefix `[REDESIGN]` + direction          |
| `use_figma`           | `rejected`           | prefix `[USE_FIGMA:<fileId>:<nodeId>]`   |

The `parseDesignDecision` and `encodeDesignDecision` functions handle the mapping
in both directions.

## Consequences

- Core `HITLDecision` remains unchanged — no ripple to channels or governance.
- Channel UIs that support rich buttons can use `encodeDesignDecision` to present
  all 4 options natively.
- Channels that only support approve/reject use the feedback encoding as a fallback.
- The prefix convention (`[REDESIGN]`, `[USE_FIGMA:...]`) is a protocol that must
  be documented for any channel adapter that wants to support design approvals.
