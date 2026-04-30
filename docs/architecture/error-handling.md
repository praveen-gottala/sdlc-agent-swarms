# CHIP Error Handling

## Core Principle: Result Pattern (Never Throw)

AgentForge uses the Result pattern for all operations. Functions return `Result<T>` instead of throwing exceptions. This makes error handling explicit and composable.

```typescript
type Result<T, E = AgentForgeError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Helper constructors
const Ok = <T>(value: T): Result<T> => ({ ok: true, value });
const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

## Error Types

```typescript
interface AgentForgeError {
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
  cause?: Error;              // Original error if wrapping
  recoverable: boolean;       // Can the operation be retried?
  agentId?: string;           // Which agent caused this?
  taskId?: string;            // Which task was affected?
}

type ErrorCode =
  // LLM Provider Errors
  | 'LLM_RATE_LIMIT'         // 429 from provider
  | 'LLM_API_ERROR'          // 5xx from provider
  | 'LLM_MALFORMED_OUTPUT'   // Response doesn't parse
  | 'LLM_CONTEXT_OVERFLOW'   // Prompt too large
  | 'LLM_TIMEOUT'            // Provider didn't respond

  // Budget Errors
  | 'BUDGET_EXCEEDED_TASK'   // Per-task limit hit
  | 'BUDGET_EXCEEDED_PHASE'  // Per-phase limit hit
  | 'BUDGET_EXCEEDED_PROJECT'// Monthly limit hit

  // Permission Errors
  | 'PERMISSION_DENIED'      // Agent lacks required permission
  | 'HITL_TIMEOUT'           // Human didn't respond in time
  | 'HITL_REJECTED'          // Human rejected the action

  // Git/CI Errors
  | 'GIT_CONFLICT'           // Merge conflict
  | 'GIT_PUSH_FAILED'        // Branch push failed
  | 'CI_FAILED'              // GitHub Actions failed
  | 'CI_TIMEOUT'             // CI didn't complete in time

  // MCP/Integration Errors
  | 'MCP_UNAVAILABLE'        // MCP server not responding
  | 'MCP_SCHEMA_MISMATCH'    // Unexpected response format
  | 'CHANNEL_UNAVAILABLE'    // Slack/Telegram API down

  // State Errors
  | 'SPEC_LOCK_FAILED'       // Could not acquire file lock
  | 'SPEC_CONFLICT'          // Human edit detected during agent write
  | 'TASK_NOT_FOUND'         // Referenced task doesn't exist
  | 'INVALID_STATE'          // Task in unexpected state for operation

  // Agent Errors
  | 'AGENT_LOOP_DETECTED'    // Circuit breaker triggered
  | 'AGENT_ABORTED'          // Manual abort requested
  | 'AGENT_UNKNOWN';         // Catch-all
```

## Usage Patterns

```typescript
// Returning errors
async function executeAgent(contract: AgentContract, context: AgentContext): Promise<Result<AgentOutput>> {
  const permCheck = governance.checkPermission(contract, action);
  if (!permCheck.ok) return permCheck; // Propagate error

  const budgetCheck = governance.checkBudget(contract, estimate);
  if (!budgetCheck.ok) return budgetCheck;

  try {
    const output = await provider.complete(prompt, options);
    if (!output.ok) return output;
    return Ok(output.value);
  } catch (e) {
    return Err({
      code: 'LLM_API_ERROR',
      message: `Provider ${contract.provider} failed: ${e.message}`,
      cause: e as Error,
      recoverable: true,
      agentId: contract.role,
      taskId: context.taskId,
    });
  }
}

// Consuming results
const result = await agentRuntime.executeAgent(contract, context);
if (result.ok) {
  await eventBus.emit({ type: 'CodeGenComplete', payload: result.value });
} else {
  if (result.error.recoverable && attempts < maxAttempts) {
    // Retry with error context injected into prompt
    return retry(contract, context, result.error);
  } else {
    // Escalate to human
    await channels.sendNotification(
      `Agent ${result.error.agentId} failed on ${result.error.taskId}: ${result.error.message}`,
      'critical'
    );
    await taskState.updateStatus(taskId, 'failed', result.error.message);
  }
}
```

## Circuit Breaker

```typescript
interface CircuitBreaker {
  /** Track an LLM call. Returns false if circuit is open (too many failures). */
  recordCall(agentId: string, success: boolean): boolean;

  /** Check if agent has made >N calls without state change */
  isLooping(agentId: string, maxCallsWithoutProgress: number): boolean;

  /** Reset circuit for an agent */
  reset(agentId: string): void;
}

// Default thresholds:
// - 5 consecutive failures -> circuit opens (agent paused)
// - 5 LLM calls without task state change -> loop detected (agent force-stopped)
// - Circuit auto-resets after 5 minutes
```
