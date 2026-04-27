/**
 * @module @agentforge/telemetry/otel-init
 *
 * OpenTelemetry SDK initialization with LangfuseSpanProcessor.
 * Idempotent — safe to call multiple times. No-op when LANGFUSE_SECRET_KEY
 * is not set, enabling graceful degradation.
 *
 * Env vars:
 *   LANGFUSE_SECRET_KEY  — required for Langfuse export
 *   LANGFUSE_PUBLIC_KEY  — required for Langfuse export
 *   LANGFUSE_BASE_URL    — defaults to Langfuse cloud; set to
 *                          http://localhost:3000 for self-hosted
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

let sdk: NodeSDK | null = null;

/** Whether Langfuse environment variables are configured. */
export function isLangfuseConfigured(): boolean {
  return Boolean(process.env.LANGFUSE_SECRET_KEY);
}

/**
 * Initialize the OTel SDK with LangfuseSpanProcessor.
 * No-op if already initialized or LANGFUSE_SECRET_KEY is not set.
 */
export function initLangfuseTracing(): void {
  if (sdk || !isLangfuseConfigured()) return;
  sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
  });
  sdk.start();
}

/**
 * Flush pending spans and shut down the OTel SDK.
 * Must be called before process exit for short-lived CLIs.
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
