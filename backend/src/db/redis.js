import Redis from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

function createClient(role) {
  const client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    db: config.redis.db,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
  });
  client.on('error', (error) => logger.error({ err: error, role }, 'redis error'));
  return client;
}

export const redis = createClient('commands');
// Subscriber connections cannot issue regular commands, so game events get their own.
export const redisSubscriber = createClient('subscriber');

export const CHANNELS = {
  roundSettled: 'royal-reels:round-settled',
};
