# Migrating from Claude Code to AgentForge

If you already have Claude Code configured with Google Vertex AI, **you don't need to reconfigure anything**. AgentForge is 100% compatible with Claude Code's environment variables.

## Your Existing .zshrc Setup ✅

```bash
# Google Cloud SDK completion
if [ -f '/Users/praveengottala/Documents/google-cloud-sdk/completion.zsh.inc' ]; then
  . '/Users/praveengottala/Documents/google-cloud-sdk/completion.zsh.inc'
fi

# Standard Google Cloud SDK variable (AgentForge auto-detects this)
export GOOGLE_APPLICATION_CREDENTIALS=/Users/praveengottala/.config/gcloud/application_default_credentials.json

# Alias for easy re-authentication
alias gauth="gcloud auth application-default login --login-config=/Users/praveengottala/.config/gcloud/gcp_login_config.json"

# Set default GCP project
alias gcp-set='gcloud config set project gen-ai-preview'

# Claude Code Vertex AI variables (AgentForge reads these too!)
export CLAUDE_CODE_USE_VERTEX=1
export CLOUD_ML_REGION=global
export ANTHROPIC_VERTEX_PROJECT_ID=gen-ai-preview
```

## What to Add for AgentForge

**Option 1: Zero changes (recommended)**

AgentForge will auto-detect your existing Claude Code variables. Just run:

```bash
agentforge init myApp
cd myApp
agentforge start design
```

That's it. AgentForge reads:
- ✅ `GOOGLE_APPLICATION_CREDENTIALS` (you have this)
- ✅ `ANTHROPIC_VERTEX_PROJECT_ID` (you have this)
- ✅ `CLOUD_ML_REGION` (you have this)
- ✅ `CLAUDE_CODE_USE_VERTEX` (you have this)

**Option 2: Add AgentForge-specific flag (optional)**

If you want to be explicit about using Vertex AI with AgentForge, add to your `.env`:

```bash
AGENTFORGE_USE_VERTEX=true
```

But this is **optional** — AgentForge auto-detects from `ANTHROPIC_VERTEX_PROJECT_ID` or `CLAUDE_CODE_USE_VERTEX`.

## What You DON'T Need

❌ Don't copy these to `.env`:
- `GOOGLE_APPLICATION_CREDENTIALS` (read from shell env)
- `ANTHROPIC_VERTEX_PROJECT_ID` (read from shell env)
- `CLOUD_ML_REGION` (read from shell env)

These are already in your shell environment via `.zshrc`, so AgentForge can see them.

## Environment Variable Priority

AgentForge checks these in order (first match wins):

### Project ID
1. `AGENTFORGE_VERTEX_PROJECT_ID`
2. `ANTHROPIC_VERTEX_PROJECT_ID` ← **You have this**
3. `GOOGLE_CLOUD_PROJECT`
4. `GCLOUD_PROJECT`

### Region
1. `AGENTFORGE_VERTEX_REGION`
2. `CLOUD_ML_REGION` ← **You have this**
3. Default: `us-central1`

### Credentials
1. `GOOGLE_APPLICATION_CREDENTIALS` ← **You have this**
2. `~/.config/gcloud/application_default_credentials.json`
3. Compute Engine metadata server (when in GCP)

## Verify Your Setup

```bash
# Check if credentials are valid
gcloud auth application-default print-access-token

# Should print an access token if authenticated
```

## Configure AgentForge to Use Vertex Models

In your project's `agentforge.yaml`:

```yaml
agents:
  providers:
    default: vertex/gemini-1.5-pro
    overrides:
      architecture: vertex/gemini-1.5-pro-002
      code_review: vertex/gemini-1.5-flash  # Cost-optimized
```

Or stick with Anthropic Claude:

```yaml
agents:
  providers:
    default: claude-sonnet-4
    overrides:
      architecture: claude-opus-4
      code_review: claude-haiku-4
```

You can **mix and match** providers per agent role!

## What If I Want to Switch Between Claude Code and AgentForge?

Both tools read the same variables, so you can use both simultaneously:

```bash
# Use Claude Code
claude-code --use-vertex

# Use AgentForge (same credentials)
agentforge start design
```

No conflicts. Your `ANTHROPIC_VERTEX_PROJECT_ID` and `CLOUD_ML_REGION` work for both.

## Troubleshooting

### Error: "Vertex AI project ID not set"

**Cause:** Shell env vars in `.zshrc` not loaded

**Fix:** Either:
1. Start a new terminal session (`. ~/.zshrc`)
2. Or add to `.env` in the project:
   ```bash
   ANTHROPIC_VERTEX_PROJECT_ID=gen-ai-preview
   CLOUD_ML_REGION=global
   ```

### Error: "Could not load Application Default Credentials"

**Cause:** ADC credentials expired

**Fix:** Re-run your gauth alias:
```bash
gauth
```

Or:
```bash
gcloud auth application-default login
```

### Check What AgentForge Detected

Run this to see detected config:

```bash
node -e "console.log('Project:', process.env.ANTHROPIC_VERTEX_PROJECT_ID); console.log('Region:', process.env.CLOUD_ML_REGION); console.log('Creds:', process.env.GOOGLE_APPLICATION_CREDENTIALS)"
```

Should print:
```
Project: gen-ai-preview
Region: global
Creds: /Users/praveengottala/.config/gcloud/application_default_credentials.json
```

## Summary

**You need to do: NOTHING.**

Your existing Claude Code + gcloud setup is already AgentForge-ready. Just run `agentforge init` and start building.
