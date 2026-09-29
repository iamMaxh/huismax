/**
 * Starts the live chat bridge: `node bridge/server.mjs` (or `npm run bridge`), with the settings from
 * bridge/chat-bridge.env.example in the environment. bridge/chat-bridge.service runs it under systemd.
 */
import { createBridge, isLoopback, loadConfig, MODEL, PATH } from './chat-bridge.mjs';

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(`chat-bridge: ${e.message}`);
  process.exit(1);
}

const server = createBridge(config);
server.listen(config.port, config.host, () => {
  console.error(`chat-bridge: listening on http://${config.host}:${config.port}${PATH} (${MODEL})`);
  if (!isLoopback(config.host)) console.error('chat-bridge: HOST is not loopback; only cloudflared should reach this port');
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close();
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
