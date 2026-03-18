# ADR-006: File Locking Human Edit Detection via Content Hashing

## Date
2026-03-18

## Status
Accepted

## PRD Reference
Section 8.3 — "Human always wins. If a human edits the spec while an agent is also writing to it, the agent discards its changes and re-reads the human's version. File locking during agent writes prevents concurrent corruption, but human edits detected mid-agent-write take priority unconditionally."

## What the Implementation Does
The lock manager stores a SHA-256 content hash of the file at lock acquisition time (`contentHash` field on `LockInfo`). A new `checkHumanEdit()` function compares the stored hash against the current file content hash. If they differ, the function returns `{ humanEdited: true, currentContent: string }`, enabling the agent to detect the human edit, discard its changes, and re-read the human's version. The lock manager itself does not execute git operations — spec sync git commits are handled at the orchestration layer, not within the locking primitive.

## Reasoning
The PRD specifies the *behavior* (detect human edits, discard agent changes, re-read human version) but not the *mechanism*. Content hashing is a lightweight, reliable detection mechanism that works with the existing YAML lock file infrastructure. Embedding git operations in the lock manager would violate separation of concerns — the lock manager is a state primitive, while git operations belong to the spec-sync orchestration layer.

## Downstream Impact
- **P16 Spec Sync:** Should call `checkHumanEdit()` before writing spec updates. If human edit detected, discard agent changes and re-read.
- **P11 Agent Runtime:** Should call `checkHumanEdit()` before committing any file write that was performed under a lock.
- No impact on P29, P31, P32.

## Decision
Accept deviation and update PRD to match implementation.

## PRD Update Required
Yes — Section 8.3 should clarify that human edit detection uses content hashing at the lock-manager level, and that git commit operations for spec sync are handled by the orchestration layer.
