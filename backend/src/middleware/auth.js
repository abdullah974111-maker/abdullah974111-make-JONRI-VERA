import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { ApiError, asyncHandler } from './errors.js';

function bearerToken(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = bearerToken(req);
  if (!token) throw new ApiError(401, 'missing_token', 'Authorization: Bearer <token> is required');

  let payload;
  try {
    payload = jwt.verify(token, config.auth.jwtSecret);
  } catch {
    throw new ApiError(401, 'invalid_token', 'Access token is invalid or expired');
  }

  const { rows } = await query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];
  if (!user) throw new ApiError(401, 'invalid_token', 'Access token is invalid or expired');
  if (user.status !== 'active') throw new ApiError(403, 'account_not_active', `Account is ${user.status}`);

  req.user = user;
  next();
});

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return next(new ApiError(403, 'forbidden', 'Admin role required'));
  }
  return next();
}

/** Blocks play (but not withdrawals or support actions) while self-exclusion is in force. */
export function requireNotSelfExcluded(req, res, next) {
  const until = req.user?.self_excluded_until;
  if (until && new Date(until) > new Date()) {
    return next(
      new ApiError(403, 'self_excluded', `Play is blocked until ${new Date(until).toISOString()}`),
    );
  }
  return next();
}
