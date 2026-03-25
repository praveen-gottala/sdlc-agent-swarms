# ADR-033: Configurable Model Resolution

## Status
Accepted

## Context

Agent contracts hardcoded `provider: 'claude-sonnet-4-6'` (or `'claude-opus-4-6'`) in 30+ places.
Per CLAUDE.md: "Per-entity configurations must be data-driven... never hardcoded."

The infrastructure for configurable models already existed in `agentforge.yaml`
(`agents.providers.default` + `overrides`) and the `ProjectManifest` types, but
nothing wired it to agent contract resolution or LLM call sites.

## Decision

Introduce a `resolveModelForRole()` utility in `@agentforge/core` with a clear
priority chain (highest wins):

1. **`AGENTFORGE_DEFAULT_MODEL` env var** — global override for testing/cost control
2. **`agentforge.yaml` → `agents.providers.overrides[role]`** — per-role configuration
3. **`agentforge.yaml` → `agents.providers.default`** — project-wide default
4. **Contract's `provider` field** — hardcoded fallback, retained for backward compatibility

### Integration points

- **`runAgent()` in `base-agent.ts`**: Automatically resolves the model before
  provider resolution and cost estimation. Passes `resolvedModel` to work
  functions via `AgentContext.resolvedModel`.
- **Agent work functions**: Use `context.resolvedModel ?? CONTRACT.provider` in
  `provider.complete()` / `provider.stream()` options.
- **CLI commands**: Use `resolveCLIModel()` helper that loads the manifest and
  calls `resolveModelForRole()`.
- **Direct LLM call sites**: Use `DEFAULT_MODEL` constant instead of raw string
  literals.

### New types/fields

- `AgentContext.manifest?: Pick<ProjectManifest, 'agents'>` — optional, backward-compatible
- `AgentContext.resolvedModel?: string` — set by `runAgent`, consumed by work functions
- `DEFAULT_MODEL` constant (`'claude-sonnet-4-6'`)
- `ENV_MODEL_OVERRIDE` constant (`'AGENTFORGE_DEFAULT_MODEL'`)

## Consequences

### Positive
- All 24+ agents using `runAgent()` are now configurable via YAML or env var
- Zero-change deployment: no manifest = works exactly as before
- Single env var can switch all agents to a cheaper model for testing
- Per-role overrides allow using Opus for spec-writing and Haiku for simple tasks

### Negative
- Slightly more indirection in model resolution (one function call)
- Contract `provider` fields are now fallback defaults, not the actual model used

### Backward compatibility
- Fully backward compatible: if no manifest is provided and no env var is set,
  behavior is identical to before this change
- `AgentContext.manifest` and `AgentContext.resolvedModel` are optional fields
