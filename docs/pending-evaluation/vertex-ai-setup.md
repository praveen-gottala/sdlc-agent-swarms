> **EVALUATION STATUS: Pending Review**
> - **What it contains:** Google Vertex AI provider setup (ADC, service account, Workload Identity, IAM, cost comparison)
> - **Why flagged:** Provider-specific setup guide, not core architecture.
> - **Counter-argument:** Only place this info exists. Saves hours for Vertex AI setup.
> - **Recommendation:** Keep in docs/ — unique operational content.

# Using Google Vertex AI with CHIP

AgentForge supports Google Vertex AI as an LLM provider using **Application Default Credentials (ADC)** for authentication.

## Setup Methods

### Method 1: gcloud CLI (Development)

**Best for local development on your machine.**

```bash
# Authenticate with your Google account
gcloud auth application-default login

# Set environment variables in .env
AGENTFORGE_VERTEX_PROJECT_ID=my-gcp-project
AGENTFORGE_VERTEX_REGION=us-central1
AGENTFORGE_VERTEX_USE_ADC=true

# Run AgentForge
agentforge start design
```

**How it works:** The Vertex AI provider uses the Google Auth Library to automatically discover credentials from:
1. `~/.config/gcloud/application_default_credentials.json` (created by `gcloud auth application-default login`)
2. Environment variable `GOOGLE_APPLICATION_CREDENTIALS` (if set)
3. Compute Engine/Cloud Run metadata server (when running in GCP)

### Method 2: Service Account Key File (CI/CD)

**Best for servers, CI/CD pipelines, and production deployments.**

```bash
# Download service account key from Google Cloud Console
# IAM & Admin → Service Accounts → Create Key → JSON

# Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export AGENTFORGE_VERTEX_PROJECT_ID=my-gcp-project
export AGENTFORGE_VERTEX_REGION=us-central1
export AGENTFORGE_VERTEX_USE_ADC=true

# Run AgentForge
agentforge start design
```

### Method 3: Workload Identity (GKE)

**Best for running AgentForge in Google Kubernetes Engine.**

```yaml
# Kubernetes pod uses workload identity - no keys needed
apiVersion: v1
kind: Pod
metadata:
  annotations:
    iam.gke.io/gcp-service-account: agentforge-sa@my-project.iam.gserviceaccount.com
spec:
  serviceAccountName: agentforge-ksa
  containers:
    - name: agentforge
      env:
        - name: AGENTFORGE_VERTEX_PROJECT_ID
          value: my-gcp-project
        - name: AGENTFORGE_VERTEX_USE_ADC
          value: "true"
```

## Required IAM Permissions

The service account needs:

```
roles/aiplatform.user  # Use Vertex AI models
```

Or create a custom role with:
```
aiplatform.endpoints.predict
```

## Supported Models

Configure in `agentforge.yaml`:

```yaml
agents:
  providers:
    default: vertex/gemini-1.5-pro
    overrides:
      architecture: vertex/gemini-1.5-pro-002
      code_review: vertex/gemini-1.5-flash
```

## Why NOT Browser OAuth?

❌ **Browser OAuth is NOT recommended for CLI tools** because:

1. **Breaks automation** — CI/CD pipelines can't open browsers
2. **Poor UX** — Forces context switching from terminal to browser
3. **Token refresh complexity** — Refresh tokens expire, requiring re-auth
4. **Security risk** — Storing refresh tokens locally is less secure than ADC

✅ **Application Default Credentials is the Google-recommended pattern** for:
- CLI tools
- Server applications
- CI/CD pipelines
- Any headless environment

## Cost Comparison

Vertex AI pricing (as of 2026):

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Gemini 1.5 Pro | $3.50 | $10.50 |
| Gemini 1.5 Flash | $0.35 | $1.05 |

Compare to Anthropic Claude:
| Model | Input | Output |
|-------|-------|--------|
| Claude Opus | $15 | $75 |
| Claude Sonnet | $3 | $15 |
| Claude Haiku | $0.25 | $1.25 |

Vertex AI Flash is competitive with Claude Haiku for cost-optimized agents.

## Troubleshooting

### Error: "Could not automatically determine credentials"

**Solution:** Run `gcloud auth application-default login`

### Error: "Permission denied on project"

**Solution:** Check IAM permissions — service account needs `roles/aiplatform.user`

### Error: "Quota exceeded"

**Solution:** Request quota increase in Google Cloud Console → IAM & Admin → Quotas

## Phase 2: `agentforge setup` Command

Future enhancement (Phase 2):

```bash
# Interactive setup wizard
agentforge setup vertex

# Prompts:
# - Project ID
# - Region
# - Auth method (gcloud / service account / workload identity)
# - Validates connection
# - Writes to .env
```

This will provide a guided experience but still use ADC under the hood (no browser OAuth).
