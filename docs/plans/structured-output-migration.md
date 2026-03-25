# Migration Plan: Upgrade All Agents to Anthropic SDK Structured Output

## Context

All agents in the monorepo manually parse JSON from LLM text output using regex extraction (`/```json\s*\n?([\s\S]*?)```/`) followed by `JSON.parse()`. This is fragile — the LLM can produce malformed JSON, extra text, or incorrect field values. The Anthropic SDK (v0.80.0, already installed) supports native structured output via `output_config` with `json_schema`, which **guarantees** the response matches the schema. A spike has already been completed for the UX Planning agent — this plan extends it to all remaining agents.

**What's already done (reference implementation):**
- `CompletionOptions.responseSchema` field added to provider types
- `CompletionResult.structured` field added for parsed output
- Claude provider passes `output_config` with graceful fallback for unsupported models
- UX Planning agent fully migrated with schema, dual-path parsing, and tests

---

## Anthropic Structured Output Constraints

These constraints MUST be followed when writing JSON Schemas for `output_config`:

1. **`additionalProperties` must be `false`** on ALL object types (root and nested)
2. **`additionalProperties: { type: "string" }` (object pattern) is NOT supported** — only boolean `false`
3. **No `$ref` or `definitions`** — all schemas must be fully inline
4. **Dynamic-key objects (`Record<string, T>`)** must be converted to arrays of `{key, value}` pairs
5. **Every object property must be explicitly listed** — the LLM cannot generate unlisted fields
6. **Graceful fallback required** — some models (e.g., `claude-sonnet-4`) don't support `output_config`, so text parsing must remain as fallback

---

## Reference Pattern (from UX Planning agent)

Every agent migration follows this 4-step pattern:

### Step A: Define the JSON Schema constant

```typescript
const MY_AGENT_OUTPUT_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      fieldA: { type: 'string' },
      fieldB: { type: 'array', items: { type: 'string' } },
      fieldC: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'number' },
          },
          required: ['name', 'value'],
          additionalProperties: false,
        },
      },
    },
    required: ['fieldA', 'fieldB', 'fieldC'],
    additionalProperties: false,
  },
};
```

### Step B: Add shared extraction function

```typescript
const extractMyAgentFields = (parsed: Record<string, unknown>): MyAgentOutput => ({
  fieldA: (parsed.fieldA as string) ?? '',
  fieldB: (parsed.fieldB as string[]) ?? [],
  fieldC: (parsed.fieldC as MyType[]) ?? [],
});
```

### Step C: Update text parser to use shared extraction

```typescript
export const parseMyAgentOutput = (output: string): Result<MyAgentOutput> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();
  try {
    return Ok(extractMyAgentFields(JSON.parse(jsonStr) as Record<string, unknown>));
  } catch {
    return Err({ code: 'LLM_MALFORMED_OUTPUT', message: '...', recoverable: true });
  }
};
```

### Step D: Update the work function

```typescript
const completionResult = await provider.complete(prompt, {
  model: MY_AGENT_CONTRACT.provider,
  maxTokens: 4096,
  temperature: 0,
  responseSchema: MY_AGENT_OUTPUT_SCHEMA,  // ← ADD THIS
});

const llmOutput = (completionResult.value as { content: string }).content;

// Prefer structured output, fall back to text parsing
const structured = (completionResult.value as { structured?: Record<string, unknown> }).structured;
const parseResult = structured
  ? Ok(extractMyAgentFields(structured))
  : parseMyAgentOutput(llmOutput);
```

### Step E: Update tests

For each agent, add 2 test cases:
1. **Structured path**: mock provider returns `{ content: '...', structured: {...} }` → verify fields extracted
2. **Fallback path**: mock provider returns `{ content: '...' }` (no `structured`) → verify text parsing still works

---

## Agent Migration Inventory

### Batch 1: Simple JSON parsers (low complexity, high impact)

These agents have straightforward JSON output with flat or shallow structures. Easy to define schemas for.

#### 1.1 Design Reviewer
- **File**: `packages/agents-design/src/design-reviewer/design-reviewer.ts`
- **Parser**: `parseReviewOutput` (lines 83-101)
- **Output shape**:
  ```json
  { "passed": boolean, "issues": ["string"], "score": number }
  ```
- **Schema complexity**: Very simple — 3 fields, all primitives/arrays
- **Effort**: Small

#### 1.2 Wireframe Generator
- **File**: `packages/agents-design/src/wireframe-generator/wireframe-generator.ts`
- **Parser**: `parseWireframeOutput` (lines 81-99)
- **Output shape**:
  ```json
  { "name": "string", "html": "string", "sections": [] }
  ```
- **Schema complexity**: Simple — `html` is a long string, `sections` is array of objects
- **Effort**: Small

#### 1.3 Visual Designer
- **File**: `packages/agents-design/src/visual-designer/visual-designer.ts`
- **Parser**: `parseVisualDesignOutput` (lines 81-99)
- **Output shape**:
  ```json
  { "name": "string", "html": "string", "appliedTokens": {} }
  ```
- **Schema note**: `appliedTokens` is `Record<string, unknown>` — must convert to array of `{key, value}` pairs (same pattern as tokenBindings)
- **Effort**: Small-Medium

#### 1.4 PR Reviewer
- **File**: `packages/agents-code/src/pr-reviewer/pr-reviewer.ts`
- **Parser**: `parseReviewOutput` (lines 108-114, heuristic-based)
- **Output shape**:
  ```json
  { "decision": "APPROVE|REQUEST_CHANGES", "body": "string" }
  ```
- **Schema complexity**: Very simple — 2 fields, one enum
- **Effort**: Small

#### 1.5 Task Decomposer
- **File**: `packages/agents-spec/src/task-decomposer/task-decomposer.ts`
- **Parser**: `parseTasksFromOutput` (lines 95-117)
- **Output shape**:
  ```json
  { "tasks": [{ "id": "string", "title": "string", "phase": "string", "agent": "string", "depends_on": ["string"], "spec_ref": "string" }] }
  ```
- **Schema note**: Currently expects a raw array — wrap in `{ "tasks": [...] }` object for structured output (root must be object, not array)
- **Effort**: Small-Medium

#### 1.6 Security Scanner
- **File**: `packages/agents-cicd/src/security-scanner/security-scanner.ts`
- **Parser**: `parseSecurityOutput` (lines 93-112)
- **Output shape**:
  ```json
  { "findings": [{ "file": "string", "line": number, "severity": "enum", "category": "string", "description": "string", "suggestedFix": "string" }] }
  ```
- **Schema note**: Currently expects raw array — wrap in `{ "findings": [...] }` for structured output
- **Effort**: Small-Medium

#### 1.7 Build Agent
- **File**: `packages/agents-cicd/src/build-agent/build-agent.ts`
- **Parser**: `parseBuildFixOutput` (lines 96-119)
- **Output shape**:
  ```json
  { "canFix": boolean, "fixType": "string", "files": [{ "path": "string", "content": "string" }], "description": "string" }
  ```
- **Schema complexity**: Medium — nested file objects
- **Effort**: Small-Medium

---

### Batch 2: UX agents (medium complexity)

These agents have more complex output structures with nested objects and arrays.

#### 2.1 UX Research
- **File**: `packages/agents-ux/src/ux-research/ux-dashboard-research.ts`
- **Parser**: `parseResearchOutput` (lines ~95-117)
- **Output shape**:
  ```json
  {
    "briefId": "string",
    "moduleId": "string",
    "requirementIds": ["string"],
    "designConstraints": ["string"],
    "referencePatterns": ["string"],
    "accessibilityRequirements": ["string"],
    "dataModelDependencies": ["string"]
  }
  ```
- **Schema complexity**: Simple — all string arrays
- **Effort**: Small

#### 2.2 UX Review
- **File**: `packages/agents-ux/src/ux-review/ux-dashboard-review.ts`
- **Parser**: `parseReviewOutput` (lines 90-125)
- **Output shape**:
  ```json
  {
    "reviewId": "string",
    "issues": [{ "id": "string", "severity": "string", "description": "string", "suggestion": "string" }]
  }
  ```
- **Schema complexity**: Medium — nested issue objects
- **Effort**: Small-Medium

#### 2.3 UX Design
- **File**: `packages/agents-ux/src/ux-design/ux-dashboard-design.ts`
- **Parser**: `parseDesignSteps` (lines 222-277)
- **Output shape**:
  ```json
  {
    "steps": [{ "tool": "string", "params": {}, "componentRef": "string", "description": "string" }],
    "breakpoints": ["string"]
  }
  ```
- **Schema note**: `params` is a dynamic object — this is the hardest one. Params vary by tool type (create_frame, set_fill_color, etc.). Options:
  - Use a flat params object with all possible fields + `additionalProperties: false`
  - Keep text parsing for this agent (structured output may over-constrain the LLM)
- **Effort**: Medium-High — needs careful schema design
- **Recommendation**: Migrate last or keep text parsing as primary with structured as optional

---

### Batch 3: Special cases (complex or non-JSON)

#### 3.1 UX Testing
- **File**: `packages/agents-ux/src/ux-testing/ux-dashboard-testing.ts`
- **Parser**: `extractJsonFromLLMOutput` + `parseTestFiles` + `recoverTruncatedTestFiles`
- **Output shape**: `{ "testFiles": [{ "filePath": "string", "content": "string" }] }`
- **Complexity**: HIGH — the `content` field contains full test file source code with backticks, which conflicts with markdown fence extraction. Has 3-strategy fallback.
- **Schema note**: Structured output would eliminate all the fence-extraction complexity. The content is just a string field in the schema.
- **Effort**: Medium (schema is simple, but testing edge cases is important)
- **Recommendation**: High priority — structured output eliminates the most fragile parser

#### 3.2 Spec Writer (YAML, not JSON)
- **File**: `packages/agents-spec/src/spec-writer/spec-writer.ts`
- **Parser**: `parseYamlSections` (lines 86-106)
- **Note**: This parses YAML sections in markdown, NOT JSON. Structured output can still help — the LLM can return `{ sections: { filename: "yaml content" } }` as JSON.
- **Effort**: Medium — requires rethinking the output format
- **Recommendation**: Defer — YAML extraction is a different pattern

#### 3.3 Code Agents (Frontend Coder, Backend Coder, Test Writer)
- **Files**: `packages/agents-code/src/frontend-coder/`, `backend-coder/`, `test-writer/`
- **Parser**: `extractCodeFromOutput` — extracts code blocks, NOT JSON
- **Note**: These extract source code from markdown fences, not JSON. Structured output could wrap it: `{ "files": [{ "path": "string", "content": "string" }] }`, but the content is code, not data.
- **Effort**: Medium — schema is simple, but code content may be long
- **Recommendation**: Good candidate — `{ files: [{path, content, language}] }` eliminates markdown fence issues

---

### Not applicable (no LLM JSON parsing)

- **PR Manager** (`agents-cicd/src/pr-manager/`) — orchestration only, no LLM parsing
- **Deploy Agent** (`agents-cicd/src/deploy-agent/`) — polls API status, no LLM parsing
- **UX Researcher** (`agents-design/src/ux-researcher/`) — no explicit parsing

---

## Execution Order

### Phase 1: Batch 1 — Simple parsers (6 agents)
**Estimated effort**: 1-2 days
**Files**: 6 agent files + 6 test files

| Order | Agent | Why first |
|-------|-------|-----------|
| 1 | Design Reviewer | Simplest schema (3 fields) |
| 2 | PR Reviewer | 2 fields, one enum |
| 3 | UX Research | All string arrays, simple |
| 4 | Task Decomposer | Array wrap needed |
| 5 | Security Scanner | Array wrap + enum field |
| 6 | Build Agent | Nested file objects |

For each agent:
1. Define `*_OUTPUT_SCHEMA` constant
2. Add `extract*Fields` function
3. Update existing parser to use shared extraction
4. Add `responseSchema` to `provider.complete()` call
5. Add structured/fallback path
6. Add 2 test cases (structured + fallback)
7. Run `nx test <package>` + `nx typecheck <package>`

### Phase 2: Batch 2 — UX agents (3 agents)
**Estimated effort**: 1-2 days
**Files**: 3 agent files + 3 test files

| Order | Agent | Notes |
|-------|-------|-------|
| 1 | UX Review | Medium nested objects |
| 2 | UX Testing | High priority — most fragile parser |
| 3 | UX Design | Hardest — dynamic params object |

### Phase 3: Batch 3 — Code agents + special cases (4 agents)
**Estimated effort**: 1-2 days

| Order | Agent | Notes |
|-------|-------|-------|
| 1 | Frontend Coder | `{ files: [{path, content, language}] }` |
| 2 | Backend Coder | Same schema as Frontend Coder |
| 3 | Test Writer | Same pattern |
| 4 | Wireframe Generator | Medium — HTML in content field |

### Phase 4: Cleanup + Documentation
**Estimated effort**: 0.5 days

1. Remove dead code — old regex patterns no longer needed as primary path
2. Update `docs/provider-abstraction.md` with structured output documentation
3. Update `docs/agent-contracts.md` with schema references
4. Add an ADR documenting the migration decision

---

## CLI Commands That Also Parse JSON

Several CLI commands directly call `provider.complete()` and parse JSON. These should also be migrated:

| File | Function | Notes |
|------|----------|-------|
| `packages/cli/src/commands/describe.ts` | Direct LLM call | Simple text output, not JSON |
| `packages/cli/src/commands/design-figma.ts` | Multiple LLM calls | Complex, shares parsers with agents |
| `packages/cli/src/commands/design-penpot.ts` | Multiple LLM calls | Same |
| `packages/cli/src/commands/design-generate.ts` | LLM call | Uses shared parsers |

**Recommendation**: CLI commands that use shared agent parsers will automatically benefit from the agent migration. CLI commands with inline parsing should be migrated after all agents are done.

---

## Testing Strategy

For each migrated agent:

1. **Unit tests** (in agent test file):
   - `it('passes responseSchema in completion options')` — verify schema is passed
   - `it('uses structured field when present')` — mock provider returns structured
   - `it('falls back to text parsing when structured is absent')` — mock without structured
   - Keep all existing parser tests unchanged (they test the fallback path)

2. **Integration smoke test** (`pipeline-wiring-smoke.test.ts`):
   - Update mock providers to return `structured` field
   - Verify pipeline data flow still works

3. **Full test suite**: After each batch, run:
   ```bash
   nx run-many -t test
   nx run-many -t typecheck
   ```

---

## Verification Checklist

After ALL agents are migrated:

- [ ] `nx run-many -t test` — all tests pass
- [ ] `nx run-many -t typecheck` — no type errors
- [ ] Every agent has responseSchema defined
- [ ] Every agent has structured + fallback dual path
- [ ] Every agent has at least 2 new test cases (structured + fallback)
- [ ] No remaining raw regex JSON extraction as primary path (only as fallback)
- [ ] docs/provider-abstraction.md updated
- [ ] ADR written for the migration decision
