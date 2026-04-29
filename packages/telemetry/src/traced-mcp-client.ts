/**
 * @module @agentforge/telemetry/traced-mcp-client
 *
 * Langfuse-instrumented wrapper for MCPClient. Every `callTool()` call
 * produces a Langfuse tool observation with server, method, latency,
 * and success/error. Uses @langfuse/tracing's startActiveObservation
 * (not raw @opentelemetry/api) because Langfuse's LangfuseSpanProcessor
 * drops raw OTel spans.
 *
 * Returns client unchanged when Langfuse is not configured (graceful no-op).
 */

import { startActiveObservation } from '@langfuse/tracing';
import type { MCPClient } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import { isLangfuseConfigured } from './otel-init.js';

/**
 * Wrap an MCPClient with Langfuse instrumentation.
 * Returns the client unchanged when Langfuse is not configured.
 */
export function createTracedMCPClient(client: MCPClient): MCPClient {
  if (!isLangfuseConfigured()) return client;

  return {
    async callTool(
      server: string,
      method: string,
      params: Readonly<Record<string, unknown>>,
    ): Promise<Result<unknown>> {
      return startActiveObservation(
        `mcp:${server}.${method}`,
        async (tool) => {
          tool.update({
            input: { server, method },
            metadata: { 'mcp.server': server, 'mcp.method': method },
          });

          const start = Date.now();
          const result = await client.callTool(server, method, params);
          const latencyMs = Date.now() - start;

          if (result.ok) {
            tool.update({
              output: { success: true, latencyMs },
              metadata: { 'mcp.latency_ms': latencyMs, 'mcp.success': true },
            });
          } else {
            tool.update({
              output: { success: false, error: String(result.error), latencyMs },
              level: 'ERROR',
              metadata: { 'mcp.latency_ms': latencyMs, 'mcp.success': false, 'mcp.error': String(result.error) },
            });
          }

          return result;
        },
        { asType: 'tool' },
      );
    },

    listTools(server: string) {
      return client.listTools(server);
    },

    isAvailable(server: string) {
      return client.isAvailable(server);
    },
  };
}
