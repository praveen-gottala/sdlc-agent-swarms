# TalkToFigma Plugin Installation

The TalkToFigma Figma plugin enables bidirectional communication between AgentForge
and your Figma desktop app via a WebSocket bridge.

## Plugin Files

The plugin files are located in the cloned TalkToFigma repo at
`src/cursor_mcp_plugin/`. You need these 4 files:

- `manifest.json`
- `code.js`
- `ui.html`
- `setcharacters.js`

## Installation Steps

1. **Start the WebSocket bridge** (from the AgentForge repo root):

   ```bash
   npm run figma:start
   ```

2. **Install the plugin in Figma**:

   - Open the Figma desktop app
   - Go to **Plugins > Development > Import plugin from manifest...**
   - Navigate to the cloned repo inside the Docker container, or clone
     [talk-to-figma-mcp](https://github.com/sonnylazuardi/cursor-talk-to-figma-mcp)
     locally and point to `src/cursor_mcp_plugin/manifest.json`

3. **Connect the plugin**:

   - Open any Figma file
   - Run the TalkToFigma plugin from the Plugins menu
   - The plugin UI will show a channel ID — this is auto-detected by
     AgentForge's preflight system

4. **Verify the connection**:

   ```bash
   npm run figma:status
   npx tsx packages/agents-ux/src/scripts/figma-preflight.ts
   ```

## Troubleshooting

- **Port 3055 in use**: Stop any existing bridge with `npm run figma:stop`
- **Plugin not connecting**: Ensure the bridge container is running (`npm run figma:logs`)
- **Channel mismatch**: The preflight script auto-detects the channel; manual
  override via `AGENTFORGE_MCP_FIGMA_CHANNEL` env var
