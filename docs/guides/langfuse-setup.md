# Langfuse Setup — LLM Observability

Langfuse provides a web UI to inspect every LLM call in the design pipeline:
full system prompts, user messages, model responses, token usage, cost, and latency.

## Architecture

```
CLI / Dashboard
    │
    ├─ TracedProvider ── wraps provider.complete() with OTel spans
    │                    captures: system prompt, user message, response, tokens, cost
    │
    ├─ LangfuseSink ─── creates OTel spans for pipeline lifecycle
    │                    captures: stage start/complete/fail, timing
    │
    └─ OTel SDK ──────── exports spans to Langfuse via LangfuseSpanProcessor
                         │
                    Langfuse (self-hosted)
                    ├── Web UI (trace viewer, cost dashboard)
                    ├── PostgreSQL (metadata)
                    ├── ClickHouse (trace OLAP)
                    ├── Redis (cache)
                    └── MinIO (blob storage)
```

## Quick Start

### 1. Start Langfuse

```bash
docker compose -f docker/docker-compose.langfuse.yml up -d
```

Wait ~30 seconds for all services to start. Verify with:
```bash
docker compose -f docker/docker-compose.langfuse.yml logs langfuse-web | grep "Ready"
# Expected: ✓ Ready in 0ms
```

Check all 6 containers are running:
```bash
docker compose -f docker/docker-compose.langfuse.yml ps
# langfuse-web, langfuse-worker, postgres, clickhouse, redis, minio
```

### 2. Create API Keys

1. Open **http://localhost:3001** in your browser
2. Create an account (first user becomes admin)
3. Go to **Settings → API Keys → Create API Key**
4. Copy the secret key and public key

### 3. Set Environment Variables

```bash
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_BASE_URL=http://localhost:3001
export ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Run the Pipeline

```bash
# Design a single page
agentforge design:page dashboard --tool=browser

# Or design all pages
agentforge design:page:all --tool=browser
```

The CLI will print `Langfuse traces: http://localhost:3001` after completion.

### 5. View Traces

Open Langfuse UI → **Traces** tab. Each pipeline run appears as a trace with nested spans:

- **Pipeline** → top-level trace
  - **stage:research** → research stage timing
    - **llm:claude-sonnet-4-6** → full LLM call with prompt/response
  - **stage:planning** → planning stage timing
    - **llm:claude-sonnet-4-6** → full LLM call
  - **stage:design** → design stage timing
    - **llm:claude-sonnet-4-6** → full LLM call

Click any LLM call span to see:
- Full system prompt text
- Full user message text
- Complete model response
- Token usage (input, output, cache)
- Cost breakdown (input, output, total USD)
- Latency in milliseconds

## Graceful Degradation

When `LANGFUSE_SECRET_KEY` is not set:
- `initLangfuseTracing()` is a no-op
- `createTracedProvider()` returns the original provider unchanged
- `createLangfuseSink()` returns null — CompositeSink falls back to CLI-only
- Zero behavior change from the pre-telemetry codebase

## Configuration Reference

| Env Var | Required | Default | Description |
|---------|----------|---------|-------------|
| `LANGFUSE_SECRET_KEY` | Yes | — | API secret key from Langfuse Settings |
| `LANGFUSE_PUBLIC_KEY` | Yes | — | API public key from Langfuse Settings |
| `LANGFUSE_BASE_URL` | No | `https://cloud.langfuse.com` | Langfuse server URL |

## Package Structure

```
packages/telemetry/
├── src/
│   ├── otel-init.ts         # NodeSDK + LangfuseSpanProcessor
│   ├── traced-provider.ts   # LLMProvider wrapper — asType: 'generation' spans
│   ├── langfuse-sink.ts     # PipelineTelemetrySink for pipeline lifecycle
│   ├── composite-sink.ts    # Multi-sink forwarding
│   └── index.ts             # Barrel exports + re-exports propagateAttributes
```

## Best Practices (per langfuse/skills)

These practices are enforced in the implementation:

| Practice | How we follow it |
|----------|-----------------|
| Correct observation types | `TracedProvider` uses `asType: 'generation'` for LLM calls |
| Model name captured | `generation.update({ model })` on every call |
| Token usage tracked | `usageDetails: { input, output, total, cacheRead, cacheWrite }` |
| Cost details captured | `costDetails: { input, output, total }` in USD |
| Input set explicitly | Only system prompt + user message — not all function args |
| Descriptive names | `llm:claude-sonnet-4-6` — not `trace-1` |
| Graceful no-op | Returns unwrapped provider when env vars missing |
| Flush before exit | `shutdownTracing()` called in CLI `finally` blocks |

To add trace-level metadata (userId, sessionId, tags), use `propagateAttributes`:
```typescript
import { propagateAttributes } from '@agentforge/telemetry';

await propagateAttributes(
  { traceName: 'design:page', userId: 'user-123', tags: ['cli'] },
  async () => { /* traced code */ },
);
```

## Docker Compose Services

| Service | Image | Purpose | Port |
|---------|-------|---------|------|
| `langfuse-web` | `langfuse/langfuse:3` | Web UI + API | 3001 → 3000 |
| `langfuse-worker` | `langfuse/langfuse-worker:3` | Async trace processing | internal |
| `postgres` | `postgres:16` | Transactional data (users, projects, API keys) | internal |
| `clickhouse` | `clickhouse/clickhouse-server:24` | OLAP trace storage (observations, scores) | internal |
| `redis` | `redis:7` | Cache + job queue | internal |
| `minio` | `minio/minio:latest` | Blob storage (events, media) | 9090 (console) |

ClickHouse runs in **single-node mode** (`CLICKHOUSE_CLUSTER_ENABLED=false`) — no Zookeeper needed for local dev.

MinIO auto-creates the `langfuse` and `langfuse-media` buckets on first startup via the entrypoint script.

## Upgrading Langfuse

```bash
docker compose -f docker/docker-compose.langfuse.yml down
docker compose -f docker/docker-compose.langfuse.yml up --pull always -d
```

Data is persisted in Docker volumes (`langfuse-pg-data`, `langfuse-ch-data`, `langfuse-minio-data`).

## Resetting (fresh start)

```bash
docker compose -f docker/docker-compose.langfuse.yml down -v
docker compose -f docker/docker-compose.langfuse.yml up -d
```

The `-v` flag removes all volumes — all data (users, traces, API keys) will be lost.

## Troubleshooting

**Langfuse web not starting:** Check logs for startup errors:
```bash
docker compose -f docker/docker-compose.langfuse.yml logs langfuse-web
```

Common causes:
- `CLICKHOUSE_MIGRATION_URL` not set → add `clickhouse://default:clickhouse@clickhouse:9000`
- `CLICKHOUSE_CLUSTER_ENABLED` not set to `false` → single-node ClickHouse needs this
- `ENCRYPTION_KEY` too short → must be 64 hex chars, generate with `openssl rand -hex 32`
- `LANGFUSE_S3_EVENT_UPLOAD_BUCKET` missing → Langfuse v3 requires S3 bucket configs for events and media

**No traces appearing:** Verify env vars are set before running the pipeline. Check that `LANGFUSE_SECRET_KEY` is not empty. Also ensure the process ran to completion — `shutdownTracing()` flushes spans on exit. If the process was killed or interrupted before shutdown, spans are lost.

**Verify traces programmatically:**
```bash
npx langfuse-cli api traces list --limit 5 --server http://localhost:3001 --json \
  | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')); \
    console.log('Traces:', d.body.meta.totalItems); \
    d.body.data.forEach(t => console.log(' ', t.name, '|', t.timestamp, \
      '| input:', Object.keys(t.input||{}).join(',') || 'none', \
      '| output:', Object.keys(t.output||{}).join(',') || 'none'));"
```

## Traced Commands

| Command | Traced | Notes |
|---------|--------|-------|
| `design:page` | Yes | All 3 stages (research, planning, design) |
| `design:page:all` | Yes | All pages + Chrome Pass |
| `design:generate` | Yes | App spec generation from PRD |
| `generate-design-options` | Yes | Design theme generation |
| Dashboard design route | Yes | Same pipeline via API |

**Port 3001 in use:** The AgentForge dashboard uses port 3000, so Langfuse is mapped to 3001. Adjust the port mapping in `docker-compose.langfuse.yml` if needed.

**Docker Hub pull failures:** If images fail to pull (timeout/DNS), try:
```bash
docker system prune
docker compose -f docker/docker-compose.langfuse.yml pull
```
