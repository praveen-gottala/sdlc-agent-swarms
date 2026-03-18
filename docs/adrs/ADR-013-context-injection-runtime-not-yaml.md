# ADR-013: Context Injection Fields Are Runtime-Injected, Not Static YAML

## Date
2026-03-18

## Status
Accepted

## PRD Reference
Section 10.1 — "Every agent is defined by a YAML contract specifying what the agent can do, cannot do, and how it coordinates with humans and other agents."

Section 11.3 — "Each agent receives: relevant spec section, design context via Figma MCP, existing code context, architectural constraints, and agent learnings."

## What the Implementation Does
The agent contract YAML (`agentforge/agents.yaml`) contains 7 sections per agent: role/phase, provider, execution, tools, permissions/denied, hitl_policy, budget, on_complete, on_error. Context injection fields (which spec sections to inject, include_learnings, include_adrs, include_conventions) are NOT stored in the YAML contract. Instead, they are injected at runtime:

- **Learnings**: All agents automatically receive active learnings via `getActiveLearnings()` + `formatLearningsForPrompt()` in `base-agent.ts`.
- **Spec sections**: Determined by the task and passed as input to the agent's work function.
- **ADRs/conventions**: Injected via stack-specific prompt templates from the prompt template registry.

The `AgentContract` TypeScript interface includes a `context: Record<string, unknown>` field for extensibility, but it is not populated with static context injection flags.

## Reasoning
1. **Spec sections vary per task, not per agent.** A code_generator agent working on a dashboard component needs the dashboard spec section; the same agent working on an API endpoint needs the API spec. Making this a static contract field would be incorrect.

2. **Learnings are always injected.** Every agent receives learnings from `.agentforge/learnings/<role>.yaml` — there is no per-agent toggle to disable this. An `include_learnings: true` field would be redundant since it's always true.

3. **ADRs and conventions come from prompt templates.** The prompt template registry (PRD Section 16.2) injects stack-specific instructions including conventions. ADRs are project-level context, not agent-level.

4. **PRD Section 11.3 describes runtime behavior.** The PRD says each agent "receives" context at execution time, which is exactly what the implementation does. Section 10.1's contract example does not include context injection fields.

## Downstream Impact
- **P17 Agent Learnings**: No impact. Learnings are already injected at runtime via `formatLearningsForPrompt()`.
- **P31 Event Catalog**: No impact. Context injection is orthogonal to event definitions.
- **V3 Dashboard (S4.5.2 Section 3)**: The dashboard's "Context Injection" configuration panel should read these settings from the runtime configuration, not the agent YAML. If the dashboard needs to show context injection toggles, they should be stored in a separate runtime config or derived from the task.

## Decision
Accept deviation and update PRD to clarify that context injection is a runtime concern, not a static contract field.

## PRD Update Required
Yes — Section 10.1 needs a clarification note: "Context injection (spec sections, learnings, ADRs, conventions) is determined at runtime based on the task and injected by the agent runtime, not stored as static fields in the agent contract."
