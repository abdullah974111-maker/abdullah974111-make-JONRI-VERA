import pino from 'pino';
import { config } from './env.js';

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.password_hash'],
    remove: true,
  },
});
