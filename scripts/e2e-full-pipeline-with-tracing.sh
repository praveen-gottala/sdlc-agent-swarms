#!/bin/bash
# E2E Full Pipeline Test with Langfuse Tracing
#
# Exercises the complete AgentForge design pipeline with real LLM calls:
#   1. Copies PET fixture to a temp directory
#   2. Runs design:page:all (research → planning → design for all pages)
#   3. All LLM calls are traced to Langfuse
#
# Prerequisites:
#   1. Start Langfuse:
#      docker compose -f docker/docker-compose.langfuse.yml up -d
#   2. Create API keys at http://localhost:3001
#   3. Set environment variables:
#      export LANGFUSE_SECRET_KEY=sk-lf-...
#      export LANGFUSE_PUBLIC_KEY=pk-lf-...
#      export LANGFUSE_BASE_URL=http://localhost:3001
#      export ANTHROPIC_API_KEY=sk-ant-...
#
# Usage:
#   ./scripts/e2e-full-pipeline-with-tracing.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Validate required env vars
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set. Required for real LLM calls."
  exit 1
fi

if [ -z "${LANGFUSE_SECRET_KEY:-}" ]; then
  echo "WARNING: LANGFUSE_SECRET_KEY is not set. Traces will NOT be sent to Langfuse."
  echo "         Pipeline will still run, but you won't see LLM I/O in the Langfuse UI."
  echo ""
fi

# Create temp working directory
WORK_DIR=$(mktemp -d)
echo "============================================================"
echo "  AgentForge E2E Pipeline Test with Langfuse Tracing"
echo "============================================================"
echo "  Monorepo: $MONOREPO_ROOT"
echo "  Work dir: $WORK_DIR"
echo "  Langfuse: ${LANGFUSE_BASE_URL:-not configured}"
echo "============================================================"
echo ""

# Copy PET fixture
echo "Copying fixture: personal-expense-tracker..."
cp -r "$MONOREPO_ROOT/fixtures/personal-expense-tracker/"* "$WORK_DIR/"
echo "Done."
echo ""

# Build CLI if needed
if [ ! -f "$MONOREPO_ROOT/packages/cli/dist/bin.js" ]; then
  echo "Building CLI..."
  (cd "$MONOREPO_ROOT" && npx nx build cli)
  echo ""
fi

# Run the full design pipeline
echo "============================================================"
echo "  Running design:page:all --tool=browser"
echo "  This makes real LLM calls (~3-5 min, ~$0.10-0.30)"
echo "============================================================"
echo ""

node "$MONOREPO_ROOT/packages/cli/dist/bin.js" design:page:all \
  --tool=browser \
  --project-root "$WORK_DIR"

echo ""
echo "============================================================"
echo "  E2E Pipeline Complete"
echo "============================================================"

# Show results
DESIGNS_DIR="$WORK_DIR/agentforge/designs"
if [ -d "$DESIGNS_DIR" ]; then
  DESIGN_COUNT=$(find "$DESIGNS_DIR" -maxdepth 1 -name "*.json" -not -name "prototype.json" -not -name "shared-chrome.json" | wc -l | tr -d ' ')
  echo "  Design specs generated: $DESIGN_COUNT"
  echo "  Artifacts dir: $DESIGNS_DIR"
  ls -la "$DESIGNS_DIR"/*.json 2>/dev/null | awk '{print "    " $NF}'
fi

echo ""

if [ -n "${LANGFUSE_SECRET_KEY:-}" ]; then
  LANGFUSE_URL="${LANGFUSE_BASE_URL:-http://localhost:3001}"
  echo "  View LLM traces at: $LANGFUSE_URL"
  echo ""
  echo "  Each trace shows:"
  echo "    - Full system prompt (research, planning, design)"
  echo "    - Full user message (page context, PRD, tokens)"
  echo "    - Full LLM response (JSON specs, component trees)"
  echo "    - Token usage & cost per call"
  echo "    - Latency per call"
  echo "    - Nested pipeline stages"
else
  echo "  Langfuse was not configured. To see LLM traces:"
  echo "    1. docker compose -f docker/docker-compose.langfuse.yml up -d"
  echo "    2. Create API keys at http://localhost:3001"
  echo "    3. Set LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL"
  echo "    4. Re-run this script"
fi

echo ""
echo "  Temp dir (clean up when done): $WORK_DIR"
echo "============================================================"
