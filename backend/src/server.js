import { createServer } from 'node:http';
import { createApp } from './app.js';
import { assertProductionConfig, config } from './config/env.js';
import { logger } from './config/logger.js';
import { pool } from './db/pool.js';
import { redis, redisSubscriber } from './db/redis.js';
import { attachWebsocket } from './ws/index.js';

assertProductionConfig();

const server = createServer(createApp());
const wss = attachWebsocket(server);

server.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'royal reels api listening');
});

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close();
  for (const socket of wss.clients) socket.terminate();
  await Promise.allSettled([pool.end(), redis.quit(), redisSubscriber.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
