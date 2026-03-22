FROM oven/bun:1-alpine

WORKDIR /app

# Clone the TalkToFigma repository
RUN apk add --no-cache git && \
    git clone --depth 1 https://github.com/sonnylazuardi/cursor-talk-to-figma-mcp.git . && \
    apk del git

# Patch: add /channels discovery endpoint for AgentForge auto-connect
COPY patch-channels-endpoint.js /app/patch-channels-endpoint.js
RUN node /app/patch-channels-endpoint.js && rm /app/patch-channels-endpoint.js

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Expose WebSocket bridge port
EXPOSE 3055

# Start the WebSocket bridge server
CMD ["bun", "socket"]
