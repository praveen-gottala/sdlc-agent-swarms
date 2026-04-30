# CHIP Failure Modes and Recovery

## Phase 1 Critical Failures (Must Handle)

### F1: LLM Returns Malformed/Garbage Code
- **Trigger:** Agent produces code that doesn't parse, has syntax errors, or is completely wrong
- **Detection:** Self-test (lint + type check on generated code before push)
- **Recovery:**
  1. Inject error message into agent context as feedback
  2. Retry with error context (max 3 attempts)
  3. If all retries fail: mark task as `failed`, create `needs_human` task, notify all channels
- **Error code:** `LLM_MALFORMED_OUTPUT`

### F2: LLM Rate Limit / API Outage
- **Trigger:** Provider returns 429 or 5xx
- **Detection:** HTTP status code from provider adapter
- **Recovery:**
  1. Exponential backoff: 1s, 2s, 4s, 8s, 16s
  2. After 5 retries: failover to secondary provider (if configured in overrides)
  3. If no secondary: pause phase, notify human
- **Error code:** `LLM_RATE_LIMIT` or `LLM_API_ERROR`

### F3: Budget Exceeded Mid-Task
- **Trigger:** Agent hits per-task or per-phase budget during streaming execution
- **Detection:** Real-time cost tracking during streaming (see provider-abstraction.md)
- **Recovery:**
  1. Hard stop. Break the stream immediately.
  2. Do NOT commit partial work. Discard generated output.
  3. Notify human with: cost breakdown, what was completed, what remains
  4. Human can: increase budget, take over manually, or abort the task
- **Error code:** `BUDGET_EXCEEDED_TASK` or `BUDGET_EXCEEDED_PHASE`
- **IMPORTANT:** At 80% threshold, send warning notification. At 100%, hard stop.

### F4: HITL Approval Timeout
- **Trigger:** Human doesn't respond within configured timeout (default: 60 min)
- **Detection:** Timer set when approval request is sent
- **Recovery:**
  1. Pause ALL dependent tasks (not just the one awaiting approval)
  2. Send escalation to secondary channel with urgency flag
  3. If secondary also times out (another 60 min): full project pause
  4. Send "project stalled" notification to all channels
  5. **NEVER auto-approve.** This is a hard rule. No exceptions.
- **Error code:** `HITL_TIMEOUT`

### F5: Git Merge Conflict Between Agents
- **Trigger:** Two agents modify overlapping files in parallel
- **Detection:** Git push fails with conflict error
- **Recovery:**
  1. Orchestrator detects conflict before merge
  2. Second agent (chronologically) attempts auto-rebase
  3. If auto-rebase succeeds: re-run CI, continue
  4. If auto-rebase fails: create `resolve_conflict` task for human
  5. Blocked tasks remain blocked until conflict is resolved
- **Error code:** `GIT_CONFLICT`
- **Prevention:** Per-module spec splitting reduces conflict probability

### F6: CI Pipeline Fails on Generated Code
- **Trigger:** Agent code passes self-test but fails in GitHub Actions
- **Detection:** CI webhook / GitHub API polling
- **Recovery:**
  1. CI agent captures full error logs
  2. Logs injected into coding agent's context as feedback
  3. Coding agent fixes in the same branch
  4. Re-triggers CI
  5. Max 3 CI retry cycles
  6. After 3 failures: escalate to human with full diagnostic context
- **Error code:** `CI_FAILED`

### F10: Slack/Telegram API Failure
- **Trigger:** Can't deliver notifications or receive approvals
- **Detection:** API call returns error / timeout
- **Recovery:**
  1. Retry 3x with backoff
  2. Fall back to next-priority channel
  3. If ALL messaging channels fail: CLI polling mode
     - Agent status printed to terminal
     - Approval via `agentforge approve <task_id>` command
  4. Ugly but functional. Framework never stops because Slack is down.
- **Error code:** `CHANNEL_UNAVAILABLE`

### F11: Agent Stuck in Loop
- **Trigger:** Agent makes repeated LLM calls without meaningful progress
- **Detection:** Circuit breaker: >5 LLM calls without task state change
- **Recovery:**
  1. Force-stop the agent immediately
  2. Log the full loop context (last 5 prompts + responses)
  3. Mark task as `failed` with loop diagnostic
  4. Notify human with context
  5. Human can: retry with different instructions, reassign, or abort
- **Error code:** `AGENT_LOOP_DETECTED`

## Phase 2+ High Severity Failures (Log and Notify)

### F7: Figma MCP Server Unavailable
- Recovery: Retry 3x -> fall back to Storybook code-first mode -> notify human

### F8: Architecturally Wrong But Passing Code
- Recovery: PR reviewer catches -> if missed, human review catches -> HITL full_approval for architecture

### F9: Spec Ambiguous or Contradictory
- Recovery: Spec agent flags ambiguity -> creates clarification task -> blocks dependent tasks

### F12: Concurrent Spec Edits (Human + Agent)
- Recovery: File locking during agent writes -> human edit detected: agent discards, re-reads human version

### F13: Design Token Mismatch
- Recovery: Design agent validates mapping -> unknown tokens flagged for human

### F14: GitHub Actions Runner Quota Exhausted
- Recovery: Queue with backoff -> notify of delay -> suggest self-hosted runners

### F15: MCP Server Returns Unexpected Schema
- Recovery: Adapter validates response -> log warning -> fall back to cached behavior -> notify human
