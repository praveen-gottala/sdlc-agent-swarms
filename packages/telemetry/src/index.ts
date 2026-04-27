/**
 * @module @agentforge/telemetry
 *
 * LLM observability via OpenTelemetry + Langfuse (vision Layer 11).
 *
 * Architecture:
 *   - TracedProvider wraps LLMProvider to auto-capture LLM call I/O as OTel spans
 *   - LangfuseSink implements PipelineTelemetrySink for pipeline lifecycle spans
 *   - CompositeSink forwards to multiple sinks (e.g., CLI stdout + Langfuse)
 *   - OTel init configures NodeSDK with LangfuseSpanProcessor
 *
 * Configuration:
 *   LANGFUSE_SECRET_KEY  — Langfuse API secret key (required)
 *   LANGFUSE_PUBLIC_KEY  — Langfuse API public key (required)
 *   LANGFUSE_BASE_URL    — Langfuse URL (default: cloud; http://localhost:3000 for self-hosted)
 *
 * When LANGFUSE_SECRET_KEY is not set, all exports are no-ops or
 * return unwrapped originals — zero behavior change from the
 * pre-telemetry codebase.
 *
 * Setup (self-hosted):
 *   docker compose -f docker/docker-compose.langfuse.yml up -d
 *   See docs/guides/langfuse-setup.md for full instructions.
 */

export { initLangfuseTracing, shutdownTracing, isLangfuseConfigured } from './otel-init.js';
export { createTracedProvider } from './traced-provider.js';
export { LangfuseSink, createLangfuseSink } from './langfuse-sink.js';
export { CompositeSink } from './composite-sink.js';

// Re-export Langfuse v5 tracing primitives for callers that need
// trace-level metadata (userId, sessionId, tags).
export { propagateAttributes } from '@langfuse/tracing';
