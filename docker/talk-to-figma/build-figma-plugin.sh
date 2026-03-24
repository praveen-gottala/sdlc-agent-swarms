#!/bin/bash
# Build a deployable Figma plugin with AgentForge's custom command patches.
#
# The upstream cursor-talk-to-figma-mcp plugin doesn't include our 37 custom
# commands (create_ellipse, set_effects, etc.). This script clones the upstream
# plugin, applies patch-plugin-commands.js, and outputs a ready-to-load plugin
# directory.
#
# A .build-meta.json is written alongside the output so the preflight can
# detect when the build is stale (upstream changed or patch file changed).
#
# Usage:
#   bash docker/talk-to-figma/build-figma-plugin.sh
#   # or: npm run figma:build-plugin
#
# Output: docker/talk-to-figma/figma-plugin/dist/
#   Load in Figma: Plugins > Development > Import plugin from manifest...
#   Select: docker/talk-to-figma/figma-plugin/dist/manifest.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/figma-plugin/dist"
TMP_DIR="/tmp/agentforge-figma-plugin-build"
META_FILE="$OUT_DIR/.build-meta.json"

echo "[build-figma-plugin] Starting plugin build..."

# Clean previous build
rm -rf "$TMP_DIR"
rm -rf "$OUT_DIR"

# Clone upstream plugin
echo "[build-figma-plugin] Cloning upstream cursor-talk-to-figma-mcp..."
git clone --depth 1 https://github.com/sonnylazuardi/cursor-talk-to-figma-mcp.git "$TMP_DIR" 2>&1 | tail -1

# Capture upstream commit SHA
UPSTREAM_SHA=$(cd "$TMP_DIR" && git rev-parse HEAD)
echo "[build-figma-plugin] Upstream commit: ${UPSTREAM_SHA:0:12}"

# Compute patch file hash
PATCH_HASH=$(shasum -a 256 "$SCRIPT_DIR/patch-plugin-commands.js" | cut -d' ' -f1)
echo "[build-figma-plugin] Patch hash: ${PATCH_HASH:0:12}"

# Apply the AgentForge command patches to code.js
# The upstream package.json has "type": "module" which breaks our CommonJS patch
# script. Remove it so Node treats .js files as CommonJS.
echo "[build-figma-plugin] Applying AgentForge patches..."
sed -i.bak '/"type": "module"/d' "$TMP_DIR/package.json"
cp "$SCRIPT_DIR/patch-plugin-commands.js" "$TMP_DIR/"
cd "$TMP_DIR" && node patch-plugin-commands.js

# Copy plugin files to output directory
mkdir -p "$OUT_DIR"
cp src/cursor_mcp_plugin/manifest.json "$OUT_DIR/"
cp src/cursor_mcp_plugin/code.js "$OUT_DIR/"
cp src/cursor_mcp_plugin/ui.html "$OUT_DIR/" 2>/dev/null || true
cp src/cursor_mcp_plugin/setcharacters.js "$OUT_DIR/" 2>/dev/null || true

# Write build metadata for staleness detection
cat > "$META_FILE" <<METAEOF
{
  "upstreamSha": "$UPSTREAM_SHA",
  "patchHash": "$PATCH_HASH",
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
METAEOF

# Cleanup temp directory
rm -rf "$TMP_DIR"

echo ""
echo "[build-figma-plugin] Plugin built successfully!"
echo "  Output: $OUT_DIR"
echo ""
echo "  To load in Figma:"
echo "    1. Open Figma Desktop"
echo "    2. Go to Plugins > Development > Import plugin from manifest..."
echo "    3. Select: $OUT_DIR/manifest.json"
