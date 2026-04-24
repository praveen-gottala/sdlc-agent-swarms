# Web Dashboard

> Part of the [AgentForge PRD](./PRD.md). Phase 2 feature specification covering
> dashboard architecture, all feature panels, API endpoints, and milestones.

## 1. Executive Summary

This document specifies the **AgentForge Web Dashboard**, the Phase 2 visual command center that replaces the messaging-first Phase 1 experience with a full-featured browser-based interface. Phase 1 (CLI + Slack/Telegram) is assumed to be implemented and operational.

The dashboard is not a replacement for the messaging channels. It is an **additive layer** that provides capabilities impossible in Slack or a terminal: inline code diffs, drag-and-drop task management, agent reasoning traces, living spec browsing, and full agent contract configuration with behavioral fields.

> **Milestone deliverable:** A team lead can open the AgentForge dashboard, view the SDLC pipeline in real time, drag tasks across a dependency-aware kanban board, approve PRs with inline diffs, configure custom agents with full behavioral contracts, browse and edit the living spec, trace agent reasoning chains, and monitor costs with budget governance visualizations.

### 1.1 Why the Dashboard Exists

Phase 1 proves the framework works through Slack, Telegram, and CLI. Phase 2 addresses three limitations of the messaging-first approach:

- **Depth:** Slack Block Kit cannot render code diffs, spec YAML, or agent reasoning traces. Developers must leave the channel to review PRs, read specs, or debug agent behavior.

- **Configuration:** Agent contracts have 20+ configurable fields (Section 6). Editing YAML files is the only way to configure agents in Phase 1. The dashboard provides a visual contract editor.

- **Observability:** The live task board in Slack shows task status but not *why*. The dashboard adds agent thought logs, dependency graphs, progressive trust indicators, and full audit history.

---

## 2. Scope and Assumptions

### 2.1 Assumptions

- Phase 1 core framework is implemented: orchestration engine (LangGraph), agent runtime, governance middleware, event bus (in-memory), all Phase 1 agents, Slack/Telegram/CLI channels, GitHub Actions sandbox.
- The data model from `data-model.md` is stable: `agentforge.yaml`, living spec files, `agentforge.tasks.yaml`, agent learnings files, and trust state files all exist and are populated.
- The agent contract schema from `agent-contracts.md` is finalized: role, description, category, provider, execution, tools, permissions, denied, hitl_policy, budget, lifecycle events, and context injection fields.
- The architecture from `architecture.md` is implemented: CLI layer, orchestration layer, agent runtime, governance middleware, event bus, MCP client layer.

### 2.2 What This PRD Covers

- Web dashboard application (React + TypeScript)
- Dashboard REST API layer and WebSocket real-time transport
- All dashboard views: Pipeline, Tasks (Kanban + List), Approvals, Agents, Spec Viewer, Reasoning Trace, Costs, Audit Trail, Trust, Integrations
- Full agent contract configuration UI with behavioral fields
- Integrations management: messaging channels, MCP servers, LLM providers, and design tools
- Data model extensions required for the dashboard

### 2.3 What This PRD Does Not Cover

- Redis Streams event bus migration (separate Phase 2 work item)
- PostgreSQL state store migration (separate Phase 2 work item)
- React Native mobile support (separate Phase 2 work item)
- Observability platform integration (Langfuse/OpenLIT)

---

## 3. Dashboard Architecture

### 3.1 System Context

The dashboard is a React SPA served by a lightweight Node.js/Express backend. The backend acts as a bridge between the browser and the existing AgentForge engine. It does not duplicate orchestration logic. It reads state from YAML files (Phase 2 early) or PostgreSQL (Phase 2 late), and forwards commands to the orchestration engine.

### 3.2 Layer Placement

The dashboard sits above the existing architecture as a new presentation layer:

| **Layer** | **Responsibility** | **Technology** |
|---|---|---|
| **Dashboard UI** | Visual presentation, user interaction, real-time updates | React 19, TypeScript, Tailwind, TanStack Query |
| **Dashboard API** | REST endpoints, WebSocket relay, state reads, command forwarding | Express.js, ws, chokidar (file watching) |
| **Existing Engine** | Orchestration, agent runtime, governance (unchanged) | LangGraph, TypeScript packages |

### 3.3 Real-Time Communication

The dashboard API watches the event bus (in-memory in Phase 2 early, Redis Streams in Phase 2 late) and relays domain events to connected browsers via WebSocket. The browser renders updates without polling.

**Events relayed to the browser:**

`TaskStatusChanged`, `AgentStateChanged`, `CIResult`, `PRCreated`, `PRMerged`, `HITLApproved`, `HITLTimeout`, `BudgetAlert`, `TrustEscalated`, `SpecDriftDetected`, `AgentAborted`, `AgentLogStream`

`AgentLogStream` is a high-frequency event streamed only when a client subscribes to a specific agent's live feed (see Section 4.11). It is not broadcast to all connected clients — only to clients that have opened the Live Agent Monitor for that specific agent.

All events from the canonical registry in `architecture.md` are available.

### 3.4 Command Flow

User actions in the dashboard (approve, abort, configure agent, edit spec, configure channels, manage MCP servers, rotate provider keys) are sent as REST API calls to the dashboard backend. The backend validates the request, then calls the corresponding function on the orchestration engine or writes to the YAML state files. The governance middleware validates all commands before execution, exactly as it does for CLI and messaging channel commands. The dashboard has no special privileges.

---

## 4. Feature Specifications

### 4.0 Global Layout Shell

The dashboard uses a persistent three-panel layout visible on every screen. This layout provides consistent navigation, context, and real-time feedback regardless of the active view.

#### 4.0.1 Left Sidebar Navigation

- **Logo and version:** AgentForge logo at the top with the current version number.
- **Navigation items:** 10 nav items with icons, displayed vertically:
  1. **Pipeline** — SDLC phase pipeline (landing page)
  2. **Tasks** — Kanban board and list view
  3. **Approvals** — HITL approval queue (shows pending count badge)
  4. **Spec** — Living specification viewer
  5. **Agents** — Agent configuration and status
  6. **Traces** — Agent execution traces
  7. **Costs** — Budget and cost governance
  8. **Audit** — Full audit trail
  9. **Trust** — Progressive trust visualization
  10. **Integrations** — External system connections
- **Active state:** The currently active nav item is highlighted with a left accent bar and background color change.
- **Pending count badge:** The Approvals nav item shows a numeric badge when there are pending approvals (e.g., "3").
- **Project context footer:** At the bottom of the sidebar, a section displays the current project context:
  - Project name (from `agentforge.yaml`)
  - Repository path
  - Stack tags (e.g., React, Node, Prisma) rendered as colored pills

#### 4.0.2 Global Header Bar

- **Page title:** Dynamic title matching the current view (e.g., "Pipeline Overview", "Task Board", "Approval Center").
- **Current phase badge:** Shows the currently active SDLC phase (e.g., "Code Gen Phase") with a colored indicator.
- **Budget summary:** Compact display showing current spend vs. budget limit (e.g., "$27.50 / $200") with a micro progress bar.
- **Active agent count:** Shows the number of currently executing agents (e.g., "3 active") with a pulse indicator when agents are running.
- **Real-time clock:** Current time display, updating every second.

#### 4.0.3 Right Activity Sidebar

A persistent right panel providing real-time context. The sidebar is collapsible via a toggle button.

- **Live event feed:** A scrolling list of recent domain events with timestamps and colored icons per event type:
  - PR Created (blue)
  - CI Passed (green)
  - Tests Running (amber)
  - PR Merged (purple)
  - Spec Synced (teal)
  - Budget Alert (red)
  - Agent Started/Completed (gray)
  - HITL Approval Requested (orange)
- **HITL configuration summary:** Below the event feed, a compact summary showing per-phase HITL policy levels:
  - Design: `full_approval`
  - Code Gen: `review_and_override`
  - Tests: `notify_only`
  - Deploy: `full_approval`
  Each level is displayed with a colored badge matching its restrictiveness.
- **Data source:** Events are received via the WebSocket connection (Section 3.3). HITL config is read from `agentforge.yaml`.

---

### 4.1 Pipeline View

The Pipeline View is the landing page. It shows the five SDLC phases (Design, Spec, Code Gen, CI/CD, Observe) as a horizontal progression with real-time status indicators.

#### 4.1.1 Requirements

- Each phase card shows: phase name, status (`pending`/`active`/`complete`), task count (done/total), accumulated cost, and a progress bar.
- The active phase card has a visual pulse/glow treatment and a top accent bar.
- Click a phase card to navigate to the Tasks view filtered to that phase.
- Summary statistics row below: total tasks, phase cost vs budget, active agent count, average task completion time, and trend indicators.
- **Real-time:** phase status and task counts update via WebSocket without page refresh.

---

### 4.2 Task Management (Kanban + List)

The Tasks view provides two modes: a Kanban board and a sortable list table. The Kanban board is the default. The view header includes a **Board | List** toggle button pair in the top-right. The selected mode persists in dashboard user preferences (Section 5.2). Both modes share the same filter state — switching between Board and List does not reset active filters.

#### 4.2.1 Kanban Board

- Five columns: **Backlog** (pending), **Blocked**, **In Progress**, **In Review** (awaiting_approval), **Done**.
- Cards are draggable between columns with visual drop zone indicators.
- **Dependency enforcement:** When a user drags a task, the board validates against the `depends_on` field from `agentforge.tasks.yaml`. If the task has unresolved dependencies, the drop is rejected with a toast notification explaining which tasks must complete first. Blocked tasks cannot be dragged to In Progress.
- **Dependency visualization:** Tasks with dependencies show a small chain icon. Hovering the icon highlights all upstream and downstream tasks in the board with connecting lines (rendered as SVG overlay). Clicking opens a dependency detail popover.
- **Inline approval:** Cards in the In Review column show compact **Approve** / **Request Changes** buttons directly on the card. Clicking Approve triggers the governance middleware. Clicking Request Changes expands an inline text input for feedback.
- **Agent identification:** Each card shows a colored agent badge (dot + abbreviated name). Agents have consistent colors across the board for visual grouping.
- **Priority indicators:** Cards show a colored priority dot: red (high), amber (medium), green (low).
- Cards show: task ID, title, agent, PR link, CI status with progress bar, cost, blocked-by reference.
- **Real-time:** new tasks appear, status changes animate, CI progress bars update live.

#### 4.2.2 List View

- Sortable table with columns: ID, Task, Agent, Branch, CI, Cost, Status, Priority.
- Filter chips for each status, with counts.
- Click a row to expand task detail inline: full description, spec reference, git branch, PR link, attempt count, error message if failed, HITL feedback.

#### 4.2.3 Data Source

Task data is read from `agentforge.tasks.yaml` (Phase 2 early) or the PostgreSQL tasks table (Phase 2 late). Task status changes are received via WebSocket events: `TaskStatusChanged`, `CIResult`, `PRCreated`, `PRMerged`.

---

### 4.3 Approval Center

The Approval Center is the dashboard equivalent of Slack approval messages. It is the primary HITL surface.

#### 4.3.1 Requirements

- Approval queue showing all tasks with `hitl_status = awaiting_approval`.
- Each approval card shows: task title, agent, HITL policy level, severity indicator, time elapsed since request, cost of the task.
- **Inline diff viewer:** Each approval card embeds a truncated code diff (first 50 lines). The diff is fetched from the GitHub API via the MCP layer. Syntax highlighting using a lightweight highlighter (Shiki or Prism). Full diff available via a **View Full Diff** expandable section.
- **Spec context panel:** A collapsible panel showing the spec section that the agent was working from. Rendered as formatted YAML. This lets the reviewer compare what was requested (spec) with what was produced (diff).
- **Agent reasoning summary:** Each approval card shows the agent reasoning trace: what context the agent received, what decisions it made, and why. This is fetched from the agent execution log (Section 4.6).
- Three action buttons: **Approve and Merge**, **Request Changes** (with text input), **Reject** (with reason).
- Approval decisions are routed through the governance middleware, same as Slack/Telegram approvals. The first response from any channel wins.
- **Decision history:** Below the active queue: a scrollable list of recent decisions with: action, task, time, channel source (dashboard/Slack/Telegram/CLI), and approver.

> **Cross-channel consistency:** If a developer approves a PR from Slack while the dashboard is open, the dashboard approval card updates in real time via the `HITLApproved` WebSocket event. The card shows the decision was made via Slack. This is the same first-response-wins model from `messaging-integration.md`.

---

### 4.4 Living Spec Viewer

The Spec Viewer makes the living specification visible and editable. This is the most critical missing surface from the Phase 1 messaging experience.

#### 4.4.1 Requirements

- Tree navigation panel showing the spec directory structure: `project.yaml`, `pages.yaml`, `components/<page>.yaml`, `api.yaml`, `models.yaml`.
- YAML viewer with syntax highlighting, collapsible sections, and inline annotations showing which agent last modified each section.
- **Spec editing:** Developers can edit spec files directly in the dashboard. Edits are committed to git as human edits, triggering the spec sync conflict resolution rules from Part I, Section 8.3: **human always wins**.
- **Drift indicators:** When the spec sync agent detects drift between spec and code (`SpecDriftDetected` event), the affected spec section shows a warning badge. Clicking reveals the deviation description and a link to the relevant code.
- **Component status tracking:** Each component, endpoint, and model in the spec shows its pipeline status: `designed`, `specced`, `coded`, `tested`, `deployed`. This maps directly to the status field in the data model.
- ADR viewer: Architecture Decision Records from `project.yaml` rendered as a timeline with status badges.
- Search across all spec files with result highlighting.

---

### 4.5 Agent Configuration

The Agent Configuration view provides full CRUD for agent contracts. This is the visual equivalent of editing YAML files in `agents/<category>/<role>.yaml`. The configuration modal must cover every field in the agent contract schema from `agent-contracts.md`.

> **Design principle:** The agent config modal must answer the question: *what does this agent DO, what can it ACCESS, and what are its GUARDRAILS?* The previous dashboard version only answered access and guardrails. It completely missed behavior.

#### 4.5.1 Agent Card Grid

- Grid of agent cards showing: name, provider, status (`idle`/`active`/`blocked`/`executing`), tasks completed, average cost, quality score, HITL policy, execution mode.
- Custom agents show a `CUSTOM` badge. Built-in agents show `CORE`.
- Click a card to expand a detail panel with full contract view.
- **New Agent** button opens the configuration modal.
- **Edit** and **Delete** actions available on the detail panel.
- **Copy as YAML:** Export the agent contract as a valid YAML file matching the schema from `agent-contracts.md`. This enables round-tripping between dashboard and file-based configuration.

#### 4.5.2 Configuration Modal: Full Contract Editor

The modal is organized into **seven sections**, each mapping to a section of the agent contract schema. All fields are configurable. No field from `agent-contracts.md` is omitted.

##### Section 1: Identity and Role

| **Field** | **Type** | **Description** |
|---|---|---|
| **Agent Name** | string, required | Human-readable name. Auto-generates the role ID as snake_case. |
| **Description** | textarea, required | What this agent does. Injected into the system prompt. This is the single most important behavioral field. Maps to `description` in the contract. |
| **Category** | select, required | `design` │ `spec` │ `code` │ `cicd` │ `observe` │ `research`. Determines which agent package the agent belongs to. |
| **System Prompt** | code editor | Full system prompt override. If blank, the default is generated from description + conventions + learnings. This is the agent persona, voice, and behavioral constraints. Supports Markdown preview. |

##### Section 2: LLM Configuration

| **Field** | **Type** | **Description** |
|---|---|---|
| **Provider** | select | LLM provider string. Dropdown populated from the provider registry (`provider-abstraction.md`). Shows availability status. |
| **Execution Mode** | toggle | `stream` (for progress visibility, real-time budget enforcement) or `complete` (for simple tasks). Maps to `execution.mode`. |
| **Progress Events** | boolean | Emit progress messages to HITL channels during execution. Maps to `execution.progress_events`. |
| **Max Context Tokens** | number | Max tokens for context injection. Prevents context overflow. Maps to `execution.max_context_tokens`. |
| **Temperature** | slider 0–1 | LLM temperature. Default: 0 for code agents, 0.7 for design agents. Shown as a slider with a numeric readout. |

##### Section 3: Context Injection

This section controls what information the agent receives alongside the task. These fields are completely missing from the previous dashboard version and are critical for agent behavior.

| **Field** | **Type** | **Description** |
|---|---|---|
| **Spec Sections** | multi-select | Which spec files to inject. Populated from the actual spec directory. Supports glob patterns like `components/*.yaml`. |
| **Include Learnings** | boolean | Inject the agent learnings file (`.agentforge/learnings/<role>.yaml`). Default: true. |
| **Include ADRs** | boolean | Inject Architecture Decision Records from `project.yaml`. Default: true for architecture-sensitive agents. |
| **Include Conventions** | boolean | Inject stack conventions from the prompt template registry (Part I, Section 16.2). Default: true. |
| **Prompt Template** | select | Override prompt template. Populated from `stacks/<stack>/prompts/`. Select which prompt file to use for task formatting. |

##### Section 4: Permissions (Least Privilege)

Two-panel tag selector identical in function to the previous version but with the full permission set from `agent-contracts.md`. Toggling a permission in Allowed auto-removes it from Denied and vice versa.

**Full permission set:**

`read_spec`, `write_spec`, `read_design`, `write_design`, `read_code`, `write_code`, `read_design_system`, `create_branch`, `create_pr`, `merge_pr`, `trigger_ci`, `read_ci_logs`, `deploy_staging`, `deploy_production`, `send_notification`

##### Section 5: HITL Policy

Four-card selector with visual treatment per level. Unchanged from previous version but with an added description tooltip per level and a link to the Progressive Trust configuration (Section 4.9).

##### Section 6: Budget and Guardrails

| **Field** | **Type** | **Description** |
|---|---|---|
| **Max Tokens Per Task** | number | Token limit per individual task execution. Maps to `budget.max_tokens_per_task`. |
| **Max Cost Per Task (USD)** | number | USD limit per task. Hard stop with output discard per `failure-modes.md` F3. |
| **Max Retries** | number, default 3 | Maximum retry attempts before escalating to human. Maps to `on_error` retry count. |
| **Retry Strategy** | select | `retry(max=N) then notify_human + pause` │ `notify_human + pause` │ `escalate`. Maps to `on_error`. |
| **Circuit Breaker Threshold** | number, default 5 | Max LLM calls without task state change before force-stopping. From `error-handling.md`. |
| **Execution Timeout (min)** | number | Max wall-clock time for a single task before auto-abort. |

##### Section 7: MCP Tools and Event Hooks

- **MCP Tools:** Tag selector populated from the MCP adapter registry. Each tool shows its server name and method. Tools are filtered by category (a design agent should not see CI tools by default). Maps to `tools` array in the contract.
- **Event Hooks:** Two fields mapping to `on_complete` and `on_error`. The `on_complete` field is a dropdown populated from the canonical event registry in `architecture.md`. The `on_error` field uses the strategy selector from Section 6.
- **Allow Delegation:** Boolean toggle. Controls whether this agent can request task delegation to other agents. Default: false.

#### 4.5.3 Agent Learnings Manager

Below the agent grid, a **Learnings** section shows accumulated observations from `.agentforge/learnings/<role>.yaml`. Each observation shows: source (human feedback or pattern detected), the learning text, confidence level, and date. Developers can manually add, edit, or delete learnings. This trains the agent over time.

---

### 4.6 Agent Reasoning Trace

The Reasoning Trace is the transparency layer that builds progressive trust. It answers the question: *why did the agent do what it did?*

#### 4.6.1 Requirements

- **Execution log:** Every agent execution is logged with: the full system prompt sent, the spec context injected, the learnings injected, the LLM response, tool calls made, files changed, events emitted, cost incurred, and wall-clock time.
- **Trace viewer:** Accessible from any task card or agent detail panel. Shows a step-by-step timeline: Context Assembled → Permission Check (pass/fail) → Budget Check (pass/fail) → HITL Check → LLM Call (with token counts) → Self-Test → CI Wait → Review. Each step is expandable.
- **LLM reasoning:** The actual LLM response is available in full, with syntax highlighting for code blocks. This is the chain-of-thought that explains the agent decision.
- **Diff between attempts:** If an agent retried (CI failure, error feedback), the trace shows what changed between attempts: what error was injected, how the agent adjusted.
- Accessible from: task cards (click to trace), approval cards (see reasoning before approving), agent detail panel (recent traces).

#### 4.6.2 Data Source

Agent execution logs are a new data structure introduced by the dashboard. The agent runtime in `packages/core` writes execution logs to `.agentforge/traces/<task_id>.json` after each execution. Schema defined in Section 5.

---

### 4.7 Cost Governance Dashboard

- Three-tier budget visualization: monthly, per-phase, per-task limits with animated progress bars.
- Budget bars change color at 80% threshold (matching the `alert_threshold` from `agentforge.yaml`).
- Cost breakdown by phase: **horizontal bar chart** showing spend per phase (Design, Spec, Code Gen, CI/CD, Observe) with colored bars. Not a time-series chart — this is a snapshot of cumulative spend per phase.
- Cost breakdown by agent: **horizontal bar chart** showing spend per agent, sorted by highest spend. Each bar shows agent name and USD amount.
- Cost trend chart showing daily spend over the current month (Phase 2c): **line chart** with date on x-axis and USD on y-axis. This is the only time-series chart in the Costs view.
- Token usage breakdown per provider and model.
- **Real-time:** `BudgetAlert` events update the bars live.

---

### 4.8 Audit Trail

Full searchable history of every agent action, governance decision, and human intervention. This is the UI for the audit log described in Part I, Section 19.3.

- Filterable by: agent, action type, time range, task, cost threshold.
- Each entry shows: timestamp, agent identity, action taken, input context summary, output summary, approving human (if HITL), cost incurred, git commit SHA.
- Export to CSV for compliance reporting.
- Paginated with infinite scroll. Backed by the event bus history (in-memory) or the audit table (PostgreSQL).

---

### 4.9 Progressive Trust Visualization

Visualizes the trust model from Part I, Section 13.2 and the trust state from `data-model.md` Section 5.

- Per-agent trust card showing: current HITL level, consecutive approval count, threshold to next level, last outcome.
- Visual progress bar toward the next trust level (e.g., 14/20 consecutive approvals toward `notify_only`).
- Trust history timeline showing when levels changed and why.
- Opt-in toggle matching `progressive_trust.enabled` in `agentforge.yaml`.
- Manual override controls: a team lead can manually escalate or degrade trust per agent, overriding the automatic counter.

---

### 4.10 Integrations Management

The Integrations view provides a unified configuration surface for all external systems AgentForge connects to. It replaces manual YAML editing for channel configuration, MCP server setup, LLM provider management, and design tool connections. It is organized into four sub-sections accessible via top-level tabs within the view.

#### 4.10.1 Messaging Channels

Manages the HITL messaging channels defined in `agentforge.yaml` `hitl.channels`. This is the visual equivalent of the channel configuration from `messaging-integration.md`.

- **Channel cards:** One card per configured channel (Slack, Telegram, CLI, WhatsApp). Each card shows: connection status with live ping indicator, priority level, capability tier (`full`/`approvals`/`basic`/`notify-only`), channel-specific configuration (workspace, channel name, chat ID, bot name), message count, and last ping time.
- **Routing rules:** Each channel card displays its routing configuration as colored tags: which event types (approvals, status updates, critical alerts) are routed to this channel, matching the `routing` section in `agentforge.yaml`. Tags are color-coded: green for all, purple for primary, gray for none/fallback.
- **Channel actions:** Connected channels show **Settings** (opens config panel) and **Test** (sends a test message and verifies round-trip). Unconfigured channels show a **Configure** button that opens a setup wizard collecting channel-specific credentials.
- **Escalation policy:** Below the channel cards, a dedicated panel configures the escalation behavior from Part I, Section 13.3: approval timeout (default 60 min), on-timeout action (pause and notify secondary), and secondary escalation timeout. The panel prominently displays the hard rule: **auto-approve on timeout is never allowed**.
- Adding a new channel writes to `agentforge.yaml` `hitl.channels` and triggers the channel adapter registration in the orchestration engine.
- The first-response-wins model from `messaging-integration.md` applies: approval requests go to all channels, the first response is authoritative, and all other channels are updated.

#### 4.10.2 MCP Servers

Manages Model Context Protocol server connections defined in `agentforge.yaml` `mcp`. This is the visual equivalent of the MCP client configuration from `architecture.md`.

- **Server cards:** One card per MCP server (Penpot, GitHub, Storybook, Jira, Slack Notify, Telegram Notify). Each card shows: server name, URI, connection status, authentication method and validity, rate limit usage (current/max RPM), 24-hour call count, error count, and a description.
- **Tool inventory:** Each card lists the MCP tools exposed by that server, rendered as `server.tool_name` tags. These are the same tools available in the agent contract `tools` field (Section 4.5.2 Section 7). This provides visibility into what capabilities each MCP server provides.
- **Health metrics:** Four stat boxes per card: auth status, rate limit usage, 24h calls, and 24h errors. Rate limit usage turns red when above 80% capacity.
- **Server actions:** Connected servers show **Config**, **Ping** (sends a health check), and **Disconnect** buttons. Unconfigured servers show a **Connect** button that collects URI, auth credentials, and rate limit settings.
- **Middleware pipeline visualization:** Below the server cards, a horizontal pipeline diagram shows the 7-step MCP adapter middleware from `architecture.md`: Governance Check → Authentication → Rate Limiting → Cache Check → MCP Call → Cache Store → Observability. This makes the security model visible: governance blocks before any external call is made.
- Adding a new MCP server writes to `agentforge.yaml` `mcp` array and registers the adapter in the MCP client layer.

#### 4.10.3 LLM Providers

Manages LLM provider connections defined in `agentforge.yaml` `agents.providers`. This is the visual equivalent of the provider registry from `provider-abstraction.md`.

- **Provider cards:** One card per provider (Anthropic/Claude, OpenAI, Google/Gemini, Ollama). Each card shows: provider name, API key status (masked), available models as tags, connection status, and which agents default to this provider.
- **Cost table:** Each card displays the per-model cost table from `provider-abstraction.md`: input and output cost per 1M tokens. This helps teams make informed provider choices for budget optimization.
- **Usage metrics:** 24-hour call count and 24-hour spend per provider. Enables quick comparison of which providers are consuming budget.
- **Provider actions:** Available providers show **Rotate Key** and **Test** (sends a minimal completion request to verify connectivity). Unconfigured providers show **Add API Key**. Ollama shows a connection test to localhost.
- **Provider resolution:** An explanatory panel shows how provider strings are resolved: `claude-sonnet-4-6` maps to the Claude provider with the sonnet model, `ollama/codellama` maps to the Ollama provider with codellama. References `agentforge.yaml` `agents.providers.default` for the project default.

#### 4.10.4 Design Tools

Manages the design tool configuration from `agentforge.yaml` `design`. Surfaces the DesignSurface abstraction from Part I, Section 11.1.3.

- **Penpot card:** Shows connection status, workspace ID, design system type (Tailwind/custom), bidirectional mode (read + write via Plugin API), and the capability list: read designs, write designs, extract tokens, sync DesignSpec JSON. Shows the DesignSurface interface methods: `createWorkspace()`, `readDesign()`, `writeDesign()`, `getTokens()`, `onUserEdit()`, `lockForAgent()`.
- **Browser Renderer card:** Shows the primary design rendering surface (port 4100). Displays DesignSpec v2 rendering status, prototype mode availability, and shared chrome configuration. The browser renderer is the source of truth for layout fidelity — not an optional tool.
- **Abstraction panel:** Below the tool cards, a panel shows the DesignSurface interface and which adapters are implemented (Penpot, Browser Renderer) vs planned (Framer Phase 3). Emphasizes that switching design tools requires zero changes to agent contracts.

#### 4.10.5 Data Source

Channel configuration is read from and written to `agentforge.yaml` `hitl.channels`. MCP server configuration is read from `agentforge.yaml` `mcp`. Provider configuration is read from `agentforge.yaml` `agents.providers`. Design tool configuration is read from `agentforge.yaml` `design`. All writes go through the dashboard API, which validates configuration before committing to the YAML file.

---

### 4.11 Live Agent Monitor

The Live Agent Monitor provides a real-time execution console for observing an active agent. This is distinct from the post-execution Trace Viewer (Section 4.6): the Trace Viewer shows completed execution logs as JSON files, while the Live Agent Monitor streams log output in real time during active execution.

#### 4.11.1 Layout

Three-panel layout within the main content area:

- **Left panel — Agent Status:**
  - Agent identity: agent ID, role name, status badge (`executing`/`idle`/`blocked`/`error`), uptime counter.
  - Current objective: the task description the agent is currently working on, with a progress bar showing estimated completion.
  - Pending task queue: list of queued tasks assigned to this agent, with drag-to-reorder capability for priority adjustment.

- **Center panel — Live Log Console:**
  - Streaming log output rendered as a scrollable terminal-style console.
  - Log entries are color-coded by level:
    - `INFO` — white: general status messages
    - `WARN` — yellow: warning conditions
    - `REQ` — blue: HTTP/API requests with status code and timing (e.g., `POST /api/chat 200 1.2s`)
    - `DATA` — gray: JSON payload previews (truncated, expandable on click)
    - `ERROR` — red: error messages with stack traces
    - `EXEC` — cyan: tool/command executions with arguments
  - Auto-scrolls to bottom as new entries arrive. Scrolling up pauses auto-scroll; scrolling back to bottom resumes it.
  - Each log entry shows: timestamp (HH:MM:SS.mmm), log level tag, and message content.

- **Top-right controls:**
  - **HALT PROCESS** button (red): Sends an abort command through the governance middleware. Requires confirmation dialog before executing. Maps to `POST /api/agents/:id/halt`.
  - **FILTER** button: Opens a dropdown to filter visible log entries by level (checkboxes for each level). Filter state is local to the session.
  - **EXPORT** button: Downloads the current log buffer as a `.log` text file.

#### 4.11.2 Data Source

The Live Agent Monitor uses a dedicated WebSocket stream. When a client opens the monitor for a specific agent, it sends a subscription request to `GET /api/agents/:id/live` (WebSocket upgrade). The server streams `AgentLogStream` events for that agent only. This is a high-frequency stream separate from the general domain event WebSocket (Section 3.3).

#### 4.11.3 Navigation

The Live Agent Monitor is accessible from:
- **Agent cards** (Section 4.5.1): Click a "Focus" button on any agent card with `executing` status.
- **Traces view** (Section 4.6): Click a "Live" button on any running task's trace entry.
- **Direct URL:** `/agents/:id/live`

---

## 5. Data Model Extensions

The dashboard introduces one new data structure and extends one existing structure.

### 5.1 Agent Execution Trace (New)

**File:** `.agentforge/traces/<task_id>.json`
**Written by:** the agent runtime after each execution.

| **Field** | **Type** | **Description** |
|---|---|---|
| `task_id` | string | Task this trace belongs to |
| `agent_role` | string | Agent that executed |
| `attempt` | number | Attempt number (1, 2, 3...) |
| `started_at` | ISO8601 | Execution start time |
| `completed_at` | ISO8601 | Execution end time |
| `system_prompt` | string | Full system prompt sent to LLM |
| `context_injected` | object | Spec sections, learnings, ADRs, conventions included |
| `llm_request` | object | Prompt messages and tool definitions sent |
| `llm_response` | string | Full LLM response text |
| `tool_calls` | `ToolCall[]` | MCP tool calls made during execution |
| `files_changed` | `FileChange[]` | Files created or modified |
| `self_test_result` | `object │ null` | Lint/typecheck results if applicable |
| `error` | `AgentForgeError │ null` | Error if execution failed |
| `cost` | `CostRecord` | Token usage and USD cost |
| `governance_checks` | object | Permission, budget, HITL check results |

### 5.2 Dashboard User Preferences (New)

**File:** `.agentforge/dashboard-preferences.yaml`
Per-user UI preferences (kanban/list default, collapsed sidebar, theme).

---

## 6. Dashboard API

The dashboard backend exposes REST endpoints and a WebSocket connection. All endpoints require authentication (Phase 2: API key from `agentforge.yaml`; Phase 2 late: token-based auth).

### 6.1 REST Endpoints

| **Method** | **Path** | **Description** |
|---|---|---|
| `GET` | `/api/pipeline` | Phase statuses, task counts, costs |
| `GET` | `/api/tasks` | All tasks with filters (status, agent, phase) |
| `PATCH` | `/api/tasks/:id/status` | Update task status (with dependency validation) |
| `GET` | `/api/approvals` | Pending approval queue |
| `POST` | `/api/approvals/:gateId/decide` | Submit approval decision (routed through governance) |
| `GET` | `/api/agents` | All agent contracts with runtime status |
| `POST` | `/api/agents` | Create custom agent (writes YAML contract) |
| `PUT` | `/api/agents/:id` | Update agent contract |
| `DELETE` | `/api/agents/:id` | Delete custom agent (built-in agents cannot be deleted) |
| `GET` | `/api/spec/:path` | Read spec file content |
| `PUT` | `/api/spec/:path` | Update spec file (human edit, triggers conflict resolution) |
| `GET` | `/api/traces/:taskId` | Agent execution trace for a task |
| `GET` | `/api/costs` | Cost summary (monthly, per-phase, per-agent) |
| `GET` | `/api/audit` | Audit log with pagination and filters |
| `GET` | `/api/trust` | Progressive trust state per agent |
| `POST` | `/api/commands/abort` | Abort task or all tasks |
| `GET` | `/api/providers` | Available LLM providers with status and cost tables |
| `PUT` | `/api/providers/:id/key` | Update or rotate API key for a provider |
| `POST` | `/api/providers/:id/test` | Test provider connectivity (sends minimal completion) |
| `GET` | `/api/channels` | All messaging channels with status and routing config |
| `PUT` | `/api/channels/:id` | Update channel configuration (writes to `agentforge.yaml`) |
| `POST` | `/api/channels/:id/test` | Send test message to channel and verify round-trip |
| `GET` | `/api/mcp` | All MCP servers with status, tools, and health metrics |
| `PUT` | `/api/mcp/:id` | Update MCP server config (URI, auth, rate limit) |
| `POST` | `/api/mcp/:id/ping` | Health check an MCP server (verifies connectivity) |
| `DELETE` | `/api/mcp/:id` | Disconnect an MCP server |
| `GET` | `/api/design` | Design tool configuration (Penpot, Browser Renderer) |
| `PUT` | `/api/design` | Update design tool config (writes to `agentforge.yaml`) |
| `GET` | `/api/escalation` | Escalation policy settings |
| `PUT` | `/api/escalation` | Update escalation timeouts and behavior |
| `GET` | `/api/diffs/:prNumber` | Code diff for a PR (via GitHub MCP) |
| `GET` | `/api/agents/:id/live` | Subscribe to live agent log stream (WebSocket upgrade). Streams `AgentLogStream` events for the specified agent. |
| `POST` | `/api/agents/:id/halt` | Halt a running agent. Routed through governance middleware. Returns confirmation or rejection. |
| `GET` | `/api/preferences` | Get dashboard user preferences (view modes, sidebar state, theme). |
| `PUT` | `/api/preferences` | Update dashboard user preferences. Writes to `.agentforge/dashboard-preferences.yaml`. |

### 6.2 WebSocket Events

Single WebSocket connection at `ws://localhost:<port>/ws`. Server relays all domain events from the event bus. Client receives JSON frames matching the `DomainEvent` schema from `architecture.md`. No client-to-server messages over WebSocket; all commands go through REST.

---

## 7. Technical Stack

| **Layer** | **Technology** | **Rationale** |
|---|---|---|
| **Frontend** | React 19, TypeScript | Matches Phase 1 stack. Team already knows it. |
| **Styling** | Tailwind CSS 4 | Matches Phase 1 stack. Utility-first for rapid iteration. |
| **State** | TanStack Query + Zustand | Query for server state (cache, refetch). Zustand for UI state. |
| **Code Diff** | react-diff-viewer-continued | Side-by-side and unified diff rendering with syntax highlighting. |
| **YAML Editor** | Monaco Editor (yaml mode) | Full-featured editor for spec editing. Same editor as VS Code. |
| **DnD** | @dnd-kit/core | Accessible, performant drag-and-drop for kanban. |
| **Charts** | Recharts | React-native charting for cost trends. |
| **Backend** | Express.js, ws | Lightweight API server. ws for WebSocket relay. |
| **File Watching** | chokidar | Watch YAML files for changes (Phase 2 early, before PostgreSQL). |
| **Package** | @agentforge/dashboard | New package in the monorepo. Depends on core, governance. |

---

## 8. Milestones

### 8.1 Phase 2a: Core Dashboard (Weeks 1–4)

- Global layout shell with three-panel layout: left sidebar navigation (10 items with icons and badges), global header bar (page title, phase badge, budget summary, active agents, clock), and right activity sidebar (live event feed and HITL config summary).
- Dashboard backend with REST API and WebSocket relay.
- Pipeline View with real-time phase status.
- Task Management: Kanban board with drag-and-drop and dependency enforcement. List view with filters.
- Approval Center: approval queue with approve/reject actions. No inline diff yet.
- Cost Governance: three-tier budget bars, cost-by-phase, cost-by-agent tables.
- Activity sidebar with live event feed.
- Integrations: Messaging Channels view with connection status, routing display, and test connectivity. Escalation policy configuration panel.

### 8.2 Phase 2b: Depth Features (Weeks 5–8)

- Agent Configuration: full contract modal with all seven sections (identity, LLM, context injection, permissions, HITL, budget/guardrails, tools/events).
- Living Spec Viewer: tree navigation, YAML viewer, drift indicators, component status tracking.
- Inline diff viewer in Approval Center (GitHub MCP integration).
- Agent Reasoning Trace: execution log viewer, step-by-step timeline, LLM response viewer.
- Audit Trail: full searchable history with filters and CSV export.
- Live Agent Monitor: streaming log console with colored log levels, halt controls, log filtering, and export. WebSocket-based real-time agent execution observation.
- Integrations: MCP Servers view with health metrics, tool inventory, middleware pipeline visualization. LLM Providers view with cost tables, usage metrics, key rotation.

### 8.3 Phase 2c: Trust and Polish (Weeks 9–12)

- Progressive Trust Visualization: per-agent trust cards, approval streaks, manual overrides.
- Spec editing: Monaco editor integration, git commit on save, conflict resolution.
- Cost trend charts (daily/weekly spend over time).
- Agent learnings CRUD: add, edit, delete observations.
- Integrations: Design Tools view with Penpot and Browser Renderer configuration, DesignSurface abstraction panel.
- Integrations polish: channel setup wizards, MCP server auto-discovery, provider health monitoring.
- Dashboard user preferences persistence.
- Accessibility audit: keyboard navigation, screen reader support, color contrast compliance.

---

## 9. Success Metrics

| **Metric** | **Target** | **Measurement** |
|---|---|---|
| Approval response time | 50% faster than Slack-only | Median time from request to decision |
| Agent config adoption | 80% of custom agents created via dashboard | Dashboard vs. YAML file creation ratio |
| Spec viewer usage | 70% of spec reads happen in dashboard | Dashboard views vs. git file reads |
| Reasoning trace views | 60% of approvals include trace view | Trace panel opens before approval click |
| Dashboard uptime | 99.5% during active phases | Health check monitoring |
| Page load time | Under 2 seconds initial load | Lighthouse performance score |
| WebSocket latency | Under 500ms event-to-render | Event timestamp vs. DOM update timestamp |
| Integration config via dashboard | 90% of channel/MCP/provider changes via UI | Dashboard API writes vs. manual YAML edits |
| MCP server uptime | 99% availability for connected servers | Ping health checks from integrations view |

---

## 10. Risks and Mitigations

| **Risk** | **Severity** | **Mitigation** |
|---|---|---|
| YAML file watching is fragile at scale | Medium | Phase 2 late migrates to PostgreSQL. File watching is a known-temporary bridge. |
| WebSocket disconnects lose events | High | Client reconnects with last-seen event timestamp. Server replays missed events from event bus history. |
| Cross-channel race conditions | Medium | Same first-response-wins model. Governance middleware is the single authority. Dashboard defers to governance. |
| Agent trace files grow large | Low | Trace files are per-task and auto-pruned after 30 days. LLM responses are stored truncated (first 10K chars) with full response available on demand. |
| Spec editing conflicts with agents | Medium | Human always wins (Part I, Section 8.3). Dashboard edits are human edits. File locking prevents concurrent corruption. |
| Dashboard becomes the only interface | Low | CLI and messaging channels remain fully functional. Dashboard is additive, never required. |
| Integration credentials exposed in UI | High | API keys are always masked in the UI. Full keys are never sent to the browser. Rotation and test operations are server-side only. Dashboard API validates auth before any credential write. |

---

## Appendix A: Audit Findings from Dashboard Prototype

The following gaps were identified during prototyping and directly informed this PRD:

| **#** | **Gap** | **Severity** | **Addressed in Section** |
|---|---|---|---|
| 1 | No system prompt / backstory / goal fields in agent config | **Critical** | 4.5.2 Section 1 |
| 2 | No prompt template configuration | **Critical** | 4.5.2 Section 3 |
| 3 | No delegation or coordination config | **Critical** | 4.5.2 Section 7 |
| 4 | No memory / learnings configuration | **Major** | 4.5.2 Section 3, 4.5.3 |
| 5 | No retry / error handling config | **Major** | 4.5.2 Section 6 |
| 6 | No sandbox / execution environment config | **Major** | Deferred (sandbox is project-level, not per-agent) |
| 7 | No task dependency visualization in kanban | **Major** | 4.2.1 |
| 8 | No inline approval from kanban cards | **Major** | 4.2.1 |
| 9 | No agent reasoning / thought log | **Critical** | 4.6 |
| 10 | No spec viewer / living spec integration | **Critical** | 4.4 |
| 11 | No audit trail / history view | **Major** | 4.8 |
| 12 | No diff viewer in approval cards | **Major** | 4.3.1 |
| 13 | No progressive trust indicator | **Major** | 4.9 |
| 14 | No real-time streaming indicators | **Minor** | 4.6.1 (via trace viewer) |
| 15 | No agent avatar / grouping on kanban cards | **Minor** | 4.2.1 |

---

## Appendix B: Referenced Documents

- **Part I** (Core Platform) — Phase 1 specification
- **agent-contracts.md** — Full agent contract schema and Phase 1 agent definitions
- **architecture.md** — Layer diagram, API contracts, event bus, communication flow
- **data-model.md** — Project manifest, living spec, task state, learnings, trust state schemas
- **error-handling.md** — Result pattern, error types, circuit breaker
- **failure-modes.md** — F1–F15 failure modes and recovery strategies
- **messaging-integration.md** — HITLChannel interface, Slack/Telegram/CLI implementations
- **provider-abstraction.md** — LLM provider interface, streaming, budget enforcement, cost table

---
