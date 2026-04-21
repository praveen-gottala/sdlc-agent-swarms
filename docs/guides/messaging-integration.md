# AgentForge Messaging Integration

## Two-Layer Abstraction

### Layer 1: HITLChannel (Core — every channel MUST implement)

```typescript
interface HITLChannel {
  /** Channel identifier */
  readonly type: ChannelType;
  readonly priority: number;
  readonly capabilities: 'full' | 'approvals' | 'basic';

  /** Send a notification (no response expected) */
  sendNotification(message: string, severity: 'info' | 'warning' | 'critical'): Promise<Result<MessageRef>>;

  /** Request human approval (blocks until response or timeout) */
  requestApproval(task: Task, context: ApprovalContext): Promise<Result<MessageRef>>;

  /** Register callback for approval decisions */
  onDecision(callback: (taskId: string, decision: HITLDecision, feedback?: string) => void): void;

  /** Update an existing message with new status */
  updateStatus(ref: MessageRef, status: TaskStatus): Promise<Result<void>>;

  /** Check if channel is currently available */
  isAvailable(): Promise<boolean>;
}

type ChannelType = 'slack' | 'telegram' | 'cli';

interface MessageRef {
  channel: ChannelType;
  messageId: string;        // Platform-specific message ID
  threadId?: string;        // For threaded conversations
  timestamp: Date;
}

interface ApprovalContext {
  title: string;
  description: string;
  changes?: { files: number; additions: number; deletions: number };
  cost?: CostRecord;
  prUrl?: string;
  specRef?: string;
}

type HITLDecision = 'approved' | 'changes_requested' | 'rejected' | 'paused';
```

### Layer 2: RichHITLChannel (Optional — enhanced channels implement)

```typescript
interface RichHITLChannel extends HITLChannel {
  /** Post/update a live task board (updates in place) */
  sendTaskBoard(tasks: Task[], phaseSummary: PhaseSummary): Promise<Result<MessageRef>>;
  updateTaskBoard(ref: MessageRef, tasks: Task[], phaseSummary: PhaseSummary): Promise<Result<void>>;

  /** Send a code preview (syntax-highlighted) */
  sendCodePreview(code: string, language: string, description: string): Promise<Result<MessageRef>>;

  /** Start a threaded conversation for feedback */
  startThread(parentRef: MessageRef, message: string): Promise<Result<MessageRef>>;

  /** Listen for threaded replies (change request feedback) */
  onThreadReply(parentRef: MessageRef, callback: (text: string) => void): void;
}

interface PhaseSummary {
  phase: string;
  projectName: string;
  totalTasks: number;
  costSoFar: number;
  budgetLimit: number;
  elapsedMinutes: number;
}
```

## Channel Implementations

### Slack (implements RichHITLChannel)

- **Connection:** Socket Mode (recommended) or Events API
- **Messages:** Block Kit with interactive buttons
- **Task board:** Pinned message, updated via `chat.update`
- **Approvals:** Button actions with threaded change request flow
- **Rate limits:** 1 message update per second per channel
- **Dependencies:** @slack/bolt, @slack/web-api

### Telegram (implements HITLChannel + partial RichHITLChannel)

- **Connection:** Bot API with long polling or webhooks
- **Messages:** Markdown formatting with inline keyboards
- **Task board:** Pinned message, updated via `editMessageText` (aggressive rate limits)
- **Approvals:** Inline keyboard buttons
- **Limitations:** No rich formatting, limited button labels, rate-limited updates
- **Dependencies:** telegraf or node-telegram-bot-api

### CLI (implements HITLChannel)

- **Connection:** Direct terminal I/O
- **Messages:** Colored terminal output (chalk)
- **Task board:** Table format via `agentforge status --watch`
- **Approvals:** Polls for approval files or accepts `agentforge approve` command
- **Zero config:** Works without any external service

## Channel Routing Rules

```yaml
# From agentforge.yaml hitl.routing
routing:
  approval_requests: "all"      # Send to ALL channels, first response wins
  status_updates: "primary"     # Send to priority-1 channel only
  critical_alerts: "all"        # Send to ALL channels
```

When multiple channels receive an approval request, the first response is authoritative. All other channels are updated to show the decision was made elsewhere.

## Slack Message Examples

### Phase Summary (Live Task Board)

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🔨 AgentForge — Code Generation Phase" }
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*Project:* TaskFlow | *Tasks:* 6 total" }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "✅ task_001: Generate RevenueChart ($0.42)\n🔄 task_002: Generate ActivityFeed\n🔄 task_003: Generate QuickActions\n⏳ task_004: Generate API routes\n⏳ task_005: Write unit tests\n⏳ task_006: Create DB migrations"
      }
    },
    {
      "type": "context",
      "elements": [
        { "type": "mrkdwn", "text": "💰 $0.42 / $25.00 | ⏱️ 12 min" }
      ]
    },
    {
      "type": "actions",
      "elements": [
        { "type": "button", "text": { "type": "plain_text", "text": "View Spec" }, "action_id": "view_spec" },
        { "type": "button", "text": { "type": "plain_text", "text": "Pause All" }, "action_id": "pause_all", "style": "danger" }
      ]
    }
  ]
}
```

### Approval Request

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🔔 Approval Required" }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*task_002: ActivityFeed Component*\n3 files | +142 lines | Tests: 4/4 passing\nCost: $0.38 | Model: claude-sonnet-4-6"
      }
    },
    {
      "type": "actions",
      "elements": [
        { "type": "button", "text": { "type": "plain_text", "text": "✅ Approve" }, "action_id": "approve", "style": "primary" },
        { "type": "button", "text": { "type": "plain_text", "text": "🔄 Request Changes" }, "action_id": "request_changes" },
        { "type": "button", "text": { "type": "plain_text", "text": "👁️ View PR" }, "action_id": "view_pr", "url": "https://github.com/..." },
        { "type": "button", "text": { "type": "plain_text", "text": "⏸️ Pause" }, "action_id": "pause", "style": "danger" }
      ]
    }
  ]
}
```
