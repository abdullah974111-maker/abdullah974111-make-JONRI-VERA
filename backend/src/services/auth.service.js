import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { withTransaction } from '../db/pool.js';
import { redis } from '../db/redis.js';
import { ApiError } from '../middleware/errors.js';
import { createClientSeed, createServerSeed } from './rng.js';
import { getOrCreateWallet } from './wallet.service.js';

const REFRESH_PREFIX = 'refresh:';

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
    kycStatus: user.kyc_status,
    selfExcludedUntil: user.self_excluded_until,
    createdAt: user.created_at,
  };
}

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.auth.jwtSecret, {
    expiresIn: config.auth.accessTokenTtl,
  });
}

async function issueRefreshToken(userId) {
  const token = `${randomUUID()}.${randomBytes(32).toString('hex')}`;
  await redis.set(`${REFRESH_PREFIX}${token}`, userId, 'EX', config.auth.refreshTokenTtlSeconds);
  return token;
}

export async function registerUser({ email, password, displayName }) {
  const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);

  const user = await withTransaction(async (client) => {
    const existing = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
    if (existing.rowCount > 0) {
      throw new ApiError(409, 'email_taken', 'That email is already registered');
    }

    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3) RETURNING *`,
      [email, passwordHash, displayName],
    );
    const created = rows[0];

    await getOrCreateWallet(client, created.id);
    const { seed, hash } = createServerSeed();
    await client.query(
      `INSERT INTO server_seeds (user_id, seed, seed_hash, client_seed) VALUES ($1, $2, $3, $4)`,
      [created.id, seed, hash, createClientSeed()],
    );
    await client.query('INSERT INTO audit_log (user_id, event) VALUES ($1, $2)', [created.id, 'user.registered']);
    return created;
  });

  return { user, tokens: await issueTokens(user) };
}

export async function issueTokens(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: await issueRefreshToken(user.id),
    tokenType: 'Bearer',
  };
}

export async function authenticate({ email, password }) {
  const { rows } = await withTransaction((client) =>
    client.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]),
  );
  const user = rows[0];

  // Hash even when the user is unknown, so a missing account and a wrong
  // password take the same amount of time.
  const hash = user?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const matches = await bcrypt.compare(password, hash);

  if (!user || !matches) {
    throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect');
  }
  if (user.status !== 'active') {
    throw new ApiError(403, 'account_not_active', `Account is ${user.status}`);
  }

  return { user, tokens: await issueTokens(user) };
}

export async function refreshTokens(refreshToken) {
  const key = `${REFRESH_PREFIX}${refreshToken}`;
  const userId = await redis.get(key);
  if (!userId) throw new ApiError(401, 'invalid_refresh_token', 'Refresh token is invalid or expired');

  // One use per token: rotate so a stolen token cannot be replayed.
  await redis.del(key);

  const { rows } = await withTransaction((client) => client.query('SELECT * FROM users WHERE id = $1', [userId]));
  const user = rows[0];
  if (!user || user.status !== 'active') {
    throw new ApiError(401, 'invalid_refresh_token', 'Refresh token is invalid or expired');
  }
  return { user, tokens: await issueTokens(user) };
}

export async function revokeRefreshToken(refreshToken) {
  if (refreshToken) await redis.del(`${REFRESH_PREFIX}${refreshToken}`);
}
