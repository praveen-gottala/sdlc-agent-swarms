/**
 * @module @agentforge/providers/vertex-config
 *
 * Auto-detection of Google Cloud / Vertex AI credentials from environment.
 * Compatible with gcloud SDK and Claude Code conventions.
 */

import type { ProviderConfig, AuthMethod } from './types.js';

/**
 * Detect Vertex AI configuration from environment variables.
 *
 * Checks for credentials in this order:
 * 1. GOOGLE_APPLICATION_CREDENTIALS (standard Google SDK)
 * 2. ADC default location (~/.config/gcloud/application_default_credentials.json)
 * 3. Compute Engine metadata server (when running in GCP)
 *
 * Compatible with:
 * - gcloud SDK standard variables
 * - Claude Code vertex variables (ANTHROPIC_VERTEX_PROJECT_ID, CLOUD_ML_REGION)
 * - AgentForge-specific variables (AGENTFORGE_VERTEX_*)
 */
export function detectVertexConfig(): ProviderConfig | null {
  const useVertex =
    process.env.AGENTFORGE_USE_VERTEX === 'true' ||
    process.env.CLAUDE_CODE_USE_VERTEX === '1' ||
    process.env.ANTHROPIC_VERTEX_PROJECT_ID !== undefined;

  if (!useVertex) {
    return null;
  }

  // Project ID: check multiple sources for compatibility
  const projectId =
    process.env.AGENTFORGE_VERTEX_PROJECT_ID ||
    process.env.ANTHROPIC_VERTEX_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;

  if (!projectId) {
    throw new Error(
      'Vertex AI requires project ID. Set one of: ' +
      'AGENTFORGE_VERTEX_PROJECT_ID, ANTHROPIC_VERTEX_PROJECT_ID, or GOOGLE_CLOUD_PROJECT'
    );
  }

  // Region: check multiple sources
  const region =
    process.env.AGENTFORGE_VERTEX_REGION ||
    process.env.CLOUD_ML_REGION ||
    'us-central1';  // Default

  // Auth: ADC is auto-detected by Google Auth Library
  // It checks GOOGLE_APPLICATION_CREDENTIALS, then default locations
  const auth: AuthMethod = { type: 'adc' };

  return {
    auth,
    projectId,
    region,
    timeout: 120000,  // 2 minutes for large model responses
  };
}

/**
 * Get helpful message for missing Vertex AI setup.
 */
export function getVertexSetupHelp(): string {
  return `
Vertex AI is not configured. To use Google Cloud models:

1. Authenticate with gcloud:
   gcloud auth application-default login

2. Set environment variables (in .env or .zshrc):
   export ANTHROPIC_VERTEX_PROJECT_ID=your-gcp-project
   export CLOUD_ML_REGION=us-central1

3. Or use AgentForge-specific variables:
   export AGENTFORGE_VERTEX_PROJECT_ID=your-gcp-project
   export AGENTFORGE_VERTEX_REGION=us-central1
   export AGENTFORGE_USE_VERTEX=true

Your current configuration detected:
- GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'not set'}
- ANTHROPIC_VERTEX_PROJECT_ID: ${process.env.ANTHROPIC_VERTEX_PROJECT_ID || 'not set'}
- CLOUD_ML_REGION: ${process.env.CLOUD_ML_REGION || 'not set'}
`.trim();
}
