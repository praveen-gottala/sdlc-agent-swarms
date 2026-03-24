FROM oven/bun:1-alpine

WORKDIR /app

# Clone the TalkToFigma repository
RUN apk add --no-cache git && \
    git clone --depth 1 https://github.com/sonnylazuardi/cursor-talk-to-figma-mcp.git . && \
    apk del git

# Patch 1: add /channels + /tools discovery endpoints for AgentForge auto-connect
COPY patch-channels-endpoint.js /app/patch-channels-endpoint.js
RUN node /app/patch-channels-endpoint.js && rm /app/patch-channels-endpoint.js

# Patch 2: add extended Figma Plugin API commands (vectors, effects, gradients, fonts, etc.)
COPY patch-plugin-commands.js /app/patch-plugin-commands.js
RUN node /app/patch-plugin-commands.js && rm /app/patch-plugin-commands.js

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Expose WebSocket bridge port
EXPOSE 3055

# Start the WebSocket bridge server
CMD ["bun", "socket"]
