# ADR-009: AuditEntry PRD Fields Are Optional with Export Support

## Date
2026-03-18

## Status
Accepted

## PRD Reference
Section 19.3 — "Every agent action is logged to an immutable audit trail: agent identity, action taken, input context, output produced, approving human, cost incurred, and timestamp. The audit trail is queryable and exportable for compliance."

## What the Implementation Does
The `AuditEntry` interface adds three fields from the PRD as optional: `inputContext` (maps to PRD's "input context"), `outputProduced` (maps to PRD's "output produced"), and `gitCommitSha` (derived from PRD Section 5's statement that "every agent action that changes the spec or creates a task is a git commit"). Additionally, `costThresholdUsd` was added to `AuditFilter` for cost-based querying, and an `exportAudit(filter, format)` method was added to `AuditLogger` supporting JSON and CSV export formats. The `AuditExportFormat` type alias was added.

## Reasoning
The PRD lists 7 required fields. Of those, `agent identity` (agentId), `action taken` (action), `timestamp`, `cost incurred` (cost), and `approving human` (approvedBy) were already present or present as optional. Adding `inputContext` and `outputProduced` as required would break all existing `AuditEntry` construction sites across the codebase. Making them optional allows incremental adoption — callers can start populating these fields without a breaking change. The `gitCommitSha` field is not explicitly listed in Section 19.3 but is implied by the PRD's emphasis on git-based audit trails; it is optional because not all agent actions produce git commits. The export functionality (JSON/CSV) implements the PRD's "exportable for compliance" requirement.

## Downstream Impact
- **P11 Agent Runtime:** Should populate `inputContext` and `outputProduced` on every audit entry it creates. Context should include the prompt/spec content fed to the agent; output should include a summary of what was produced.
- **P32 API Contract Dry Run:** Can use `exportAudit()` for compliance reporting.
- **P31 Event Catalog:** No direct impact — audit entries are separate from domain events.

## Decision
Accept deviation and update PRD to match implementation.

## PRD Update Required
Yes — Section 19.3 should list all fields explicitly (including git_commit_sha where applicable) and note that fields which are not applicable to all action types are optional.
