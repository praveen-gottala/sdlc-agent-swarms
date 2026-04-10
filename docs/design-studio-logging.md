# Design Studio — Logging Architecture

How logs flow from each layer of the design studio into the unified Logs panel.

## Log Entry Shape

Every log entry stored by the system has this structure:

```typescript
interface DesignLogEntry {
  id: string;                          // monotonic, e.g. "dlog-42"
  timestamp: string;                   // HH:MM:SS.mmm
  level: 'INFO' | 'WARN' | 'ERROR' | 'REQ' | 'BRIDGE';
  source: 'registry' | 'studio' | 'canvas' | 'bridge' | 'renderer' | 'pipeline';
  message: string;
  metadata?: Record<string, unknown>;  // optional structured data
}
```

The panel renders each entry as: `[HH:MM:SS.mmm] [LEVEL] [source] message`

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│  Vite Renderer (iframe, port 4100)                      │
│                                                         │
│  main.tsx / DesignSpecRenderer                          │
│    └─ sendLog(level, message)                           │
│         └─ window.parent.postMessage({                  │
│              type: 'log', level, message,               │
│              source: 'agentforge'                       │
│            })                                           │
│                                                         │
│  iframe-bridge.ts                                       │
│    └─ postMessage({ type: 'ready' })                    │
│    └─ postMessage({ type: 'render-complete', ... })     │
│    └─ sendLog('INFO', 'load-spec received from parent') │
└────────────────────┬────────────────────────────────────┘
                     │ postMessage (cross-origin)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Dashboard (Next.js, port 3000)                         │
│                                                         │
│  useRendererBridge hook                                 │
│    └─ window.addEventListener('message', handler)       │
│    └─ Filters: source === 'agentforge'                  │
│    └─ type 'log'    → onLog(level, message)             │
│    └─ type 'ready'  → onLog('INFO', 'Renderer ...')     │
│    └─ type 'render-complete' → onLog(level, summary)    │
│                     │                                   │
│  DesignCanvas (bridgeOnLog)                             │
│    └─ onLog(level, logSource ?? 'bridge', message)      │
│    └─ onLog('INFO', 'canvas', '...')   ← canvas events  │
│                     │                                   │
│  design/page.tsx (handleCanvasLog)                      │
│    └─ log(safeLevel, safeSource, message)               │
│    └─ log('REQ', 'studio', 'Fetching spec...')          │
│    └─ log('INFO', 'registry', 'Page selected: ...')     │
│    └─ log('INFO', 'pipeline', '...')                    │
│                     │                                   │
│  DesignLogProvider (React context)                      │
│    └─ Appends to entries[], caps at 200                 │
│    └─ Also mirrors to browser console via console.log   │
│                     │                                   │
│  DesignLogPanel (UI)                                    │
│    └─ Reads entries from context                        │
│    └─ Renders via <LogEntry> component                  │
└─────────────────────────────────────────────────────────┘
```

## Log Sources

Each source identifies **where** in the system the log originated.

| Source | Emitted by | Examples |
|------------|---------------------------------------|---------------------------------------------|
| `registry` | `design/page.tsx` | Page selected, page list loaded |
| `studio` | `design/page.tsx` | Fetching spec, spec loaded, generate started, bridge ready |
| `canvas` | `design-canvas.tsx` | Renderer health checks, auto-start, restart, loading spec into bridge |
| `bridge` | `useRendererBridge` via `DesignCanvas` | Iframe ready, render complete, bridge init, load-spec received |
| `renderer` | Reserved for renderer app logs | Spec parsing, node rendering, render errors |
| `pipeline` | `design/page.tsx` pipeline callbacks | Design generation progress, LLM calls |

### Source detail

**`registry`** — Page management events from the page list sidebar.

**`studio`** — Top-level orchestration in the design page: fetching data from APIs, managing the generate/correct workflow, detecting bridge readiness.

**`canvas`** — The `DesignCanvas` component managing the iframe lifecycle: health checks against `/api/renderer/status`, auto-starting or restarting the Vite process, loading specs into the bridge.

**`bridge`** — Messages that cross the iframe boundary via `postMessage`, tagged as bridge lifecycle or protocol summaries in `useRendererBridge`: iframe `ready`, `render-complete` summary lines, and `sendLog()` calls from `iframe-bridge.ts` (e.g. bridge initialized, load-spec received).

**`renderer`** — Application logs from `main.tsx` via `sendLog(..., 'renderer')`: spec parsing, per-frame DOM node counts, parse/render errors. Distinguished from `bridge` by the `logSource` field on `type: 'log'` postMessages.

**`pipeline`** — Design generation pipeline progress. Emitted by the `handlePipelineEvent` callback when the dashboard drives a `design:generate` run.

## Log Levels

| Level | Color | Usage |
|---------|---------|-------|
| `INFO` | Slate | Normal operational events |
| `WARN` | Yellow | Degraded state (stale renderer, missing data) |
| `ERROR` | Red | Failures (spec parse error, renderer crash, API error) |
| `REQ` | Blue | Outgoing API requests (fetch spec, start renderer) |
| `BRIDGE` | Purple | Bridge-specific protocol events |

## Key Files

| File | Role |
|------|------|
| `packages/dashboard/src/lib/hooks/use-design-log.ts` | `DesignLogProvider` context, `DesignLogEntry` types, 200-entry ring buffer |
| `packages/dashboard/src/components/design/design-log-panel.tsx` | Collapsible UI panel, renders `<LogEntry>` per entry |
| `packages/dashboard/src/components/live-monitor/log-entry.tsx` | Presentational `<LogEntry>` component with color-coded levels |
| `packages/dashboard/src/lib/hooks/use-renderer-bridge.ts` | `useRendererBridge` hook, `postMessage` listener, `OnLogCallback` type |
| `packages/dashboard/src/components/design/design-canvas.tsx` | `DesignCanvas`, bridges `useRendererBridge` logs to `onLog` prop |
| `packages/dashboard/src/app/(dashboard)/design/page.tsx` | `DesignStudioContent`, `handleCanvasLog`, direct `log()` calls |
| `packages/designspec-renderer/.../iframe-bridge.ts` | `sendLog()`, `initIframeBridge()`, child-to-parent protocol |
| `packages/designspec-renderer/.../main.tsx` | Renderer app entry, calls `sendLog()` for spec/render events |

## Console Mirroring

Every log entry is also written to the browser console with a `[DesignLog][source]` prefix. This means:
- `console.log('[DesignLog][bridge]', 'Renderer iframe ready')` for INFO
- `console.warn('[DesignLog][canvas]', 'Renderer stale: ...')` for WARN
- `console.error('[DesignLog][studio]', 'Failed to fetch spec')` for ERROR

This ensures logs are visible in DevTools even when the Logs panel is collapsed.

## Renderer Process Logs

The Vite renderer process (`npx vite --port 4100`) writes to stderr, which is captured by `renderer-manager.ts` (last 500 chars). These are **not** surfaced in the Logs panel — they're only used for error reporting when the process exits with a non-zero code. The renderer-manager surfaces these through the `/api/renderer/status` endpoint's `error` field, which `DesignCanvas` displays in the "Renderer unavailable" error state.
