import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { CHANNELS, redisSubscriber } from '../db/redis.js';

/**
 * Live feed of settled rounds. Clients authenticate with their access token;
 * other players' rounds are relayed without identifying anyone.
 */
export function attachWebsocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');

    let userId = null;
    try {
      userId = jwt.verify(token ?? '', config.auth.jwtSecret).sub;
    } catch {
      socket.close(4401, 'invalid token');
      return;
    }

    socket.userId = userId;
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });
    socket.send(JSON.stringify({ type: 'connected' }));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref();

  redisSubscriber.subscribe(CHANNELS.roundSettled).catch((error) => {
    logger.error({ err: error }, 'failed to subscribe to round feed');
  });

  redisSubscriber.on('message', (channel, raw) => {
    if (channel !== CHANNELS.roundSettled) return;

    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    for (const socket of wss.clients) {
      if (socket.readyState !== socket.OPEN) continue;
      const isOwn = socket.userId === event.userId;
      socket.send(
        JSON.stringify({
          type: isOwn ? 'round:own' : 'round:feed',
          round: {
            game: event.game,
            betCents: event.betCents,
            payoutCents: event.payoutCents,
            at: event.at,
            player: isOwn ? 'you' : maskName(event.displayName),
          },
        }),
      );
    }
  });

  return wss;
}

function maskName(name = '') {
  if (name.length <= 2) return `${name[0] ?? '?'}***`;
  return `${name.slice(0, 2)}***`;
}
