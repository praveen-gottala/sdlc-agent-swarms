# ADR-014: Generic Prompts Fallback for Unknown Stacks

## Date
2026-03-18

## Status
Rejected

## PRD Reference
Section 16.2 — "Each supported stack has a directory of prompt templates and configuration that agents use to generate idiomatic, consistent code." and "Adding new stacks (React Native, Angular, Vue) in future phases is an additive operation: a new directory with new prompts and templates, not a code change to the core framework."

Section 16 introduction — "AgentForge is explicit about which technology combinations are supported and tested. The stack choice drives a prompt template registry that provides stack-specific instructions to every agent."

## What the Implementation Does
The template renderer (`packages/cli/src/template-renderer.ts`) hardcodes the path to `stacks/react-node-prisma/templates/scaffold`. There is no mechanism to resolve an arbitrary stack directory from the project's `agentforge.yaml` stack configuration. If a non-existent stack is encountered, the framework does not fall back to generic prompts — it either skips template rendering silently or throws an error.

## Reasoning
Phase 1 only supports a single stack (react-node-prisma), so the hardcoded path was pragmatic during initial implementation. However, the PRD's intent is clear: the framework should degrade gracefully when a stack template is missing, and the architecture should support additive stack registration without core code changes.

## Downstream Impact
- **P19 Failure Modes**: Direct risk. Failure recovery tests may exercise error paths where an unknown stack is encountered. Without fallback, the framework throws instead of degrading gracefully.
- **P32 API Contract Dry Run**: Minor risk. Dry runs may exercise non-default stacks.
- **Future stack additions**: Would require code changes to `template-renderer.ts` instead of being purely additive.

## Decision
Reject deviation and fix implementation to match PRD intent.

## PRD Update Required
No — implementation will be fixed instead.

## Fix Applied
1. `packages/core/src/config/stack-resolver.ts` — New module that resolves stack directory from `agentforge.yaml` stack configuration and provides a fallback to empty prompts with a warning.
2. `packages/cli/src/template-renderer.ts` — Updated `getTemplatesDir()` to accept a stack name parameter and resolve dynamically. Falls back to empty templates with a console warning when the stack directory is missing.
3. `packages/core/src/config/stack-resolver.test.ts` — Tests for stack resolution and fallback behavior.
