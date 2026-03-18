# ADR-020: Status Update Failover Not Implemented

## Date
2026-03-18

## Status
Accepted

## PRD Reference
Section 14.2 — "Status updates go to the primary channel only. Critical alerts go to all channels."

Section 14.1 — "All messaging is abstracted behind a two-layer interface."

## What the Implementation Does
When the primary channel (e.g., Slack) is unavailable, the channel router returns a recoverable `CHANNEL_UNAVAILABLE` error for status updates instead of automatically failing over to a secondary channel (e.g., Telegram). Approval requests and critical alerts correctly route to all available channels. Only status updates have no failover path.

## Reasoning
The implementation follows PRD 14.2 literally: "Status updates go to the primary channel only." Failing over to a secondary channel would contradict this specification. The error is marked `recoverable: true`, allowing the orchestrator to log it and continue without blocking the pipeline. Critical alerts — which are safety-relevant — do route to all channels, ensuring developers are notified of failures even when the primary channel is down.

## Downstream Impact
- **Wave 6 (P30 Code Generation):** If Slack goes down during a multi-agent code generation run, developers lose real-time status visibility. However, critical alerts still reach all channels, and task state is persisted in `agentforge.tasks.yaml`. Developers can use `agentforge status` (CLI) as a fallback.
- **Production readiness:** For production use, status update failover should be configurable (e.g., `status_failover: true` in routing config). This is a Phase 2 enhancement.

## Decision
Accept deviation and update PRD to match implementation.

## PRD Update Required
Yes — Section 14.2 should clarify the failover behavior for status updates.

> Updated per ADR-020 (2026-03-18): When the primary channel is unavailable, status updates return a recoverable error. Automatic failover for status updates is deferred to Phase 2. Critical alerts and approval requests are unaffected.
