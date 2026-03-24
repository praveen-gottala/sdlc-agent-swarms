FROM node:22-alpine

WORKDIR /app

# Clone the Penpot MCP server (mcp-prod branch) directly into /app
RUN apk add --no-cache git && \
    git clone --depth 1 --branch mcp-prod https://github.com/penpot/penpot.git /tmp/penpot && \
    cp -a /tmp/penpot/mcp/. . && \
    rm -rf /tmp/penpot .git && \
    apk del git

# Install dependencies using the exact pnpm version from packageManager field
RUN corepack enable && \
    corepack prepare pnpm@10.28.2 --activate && \
    pnpm install --no-frozen-lockfile

# Build all packages (common → plugin → server)
RUN pnpm run build

# Expose HTTP/SSE port and WebSocket port
EXPOSE 4401 4402

# Start the MCP server
CMD ["pnpm", "start"]
