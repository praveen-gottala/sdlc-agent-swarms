#!/usr/bin/env bash
# Install git hooks for the AgentForge monorepo.
# Run once after cloning: bash scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_DIR="$REPO_ROOT/.git/hooks"

# Pre-commit: prompt version check
cat > "$HOOK_DIR/pre-commit" << 'HOOK'
#!/usr/bin/env bash
npx tsx scripts/check-prompt-versions.ts
HOOK
chmod +x "$HOOK_DIR/pre-commit"

echo "Git hooks installed."
