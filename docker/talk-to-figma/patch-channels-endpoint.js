/**
 * Post-clone patch: adds a GET /channels endpoint to the TalkToFigma bridge.
 * Returns active channels (those with 1+ connected clients).
 *
 * This enables AgentForge's preflight to discover which channel the Figma
 * plugin is connected to, without requiring manual channel ID copying.
 */

const fs = require('fs');
const path = require('path');

const socketPath = path.join(__dirname, 'src', 'socket.ts');
let source = fs.readFileSync(socketPath, 'utf-8');

// Find the fetch handler that returns "WebSocket server running"
// and add a /channels endpoint before it
const marker = '"WebSocket server running"';

if (!source.includes('/channels')) {
  const patchCode = `
      // --- AgentForge patch: channel discovery endpoint ---
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/channels") {
        const activeChannels: string[] = [];
        for (const [name, clients] of channels.entries()) {
          if (clients.size > 0) {
            activeChannels.push(name);
          }
        }
        return new Response(JSON.stringify({ channels: activeChannels }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      // --- end AgentForge patch ---
`;

  // Insert before the "WebSocket server running" return
  source = source.replace(
    `return new Response(${marker}`,
    `${patchCode}\n      return new Response(${marker}`
  );

  fs.writeFileSync(socketPath, source);
  console.log('[patch] Added /channels endpoint to socket.ts');
} else {
  console.log('[patch] /channels endpoint already present, skipping');
}
