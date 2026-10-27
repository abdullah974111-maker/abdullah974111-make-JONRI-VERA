import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import {
  authenticate,
  publicUser,
  refreshTokens,
  registerUser,
  revokeRefreshToken,
} from '../services/auth.service.js';

export const authRouter = Router();

// Credential endpoints are the ones worth guessing at, so they get their own budget.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many attempts, try again later' } },
});

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  displayName: z.string().min(2).max(40),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({ refreshToken: z.string().min(10).max(256) });

authRouter.post(
  '/register',
  credentialLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { user, tokens } = await registerUser(req.body);
    res.status(201).json({ user: publicUser(user), ...tokens });
  }),
);

authRouter.post(
  '/login',
  credentialLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { user, tokens } = await authenticate(req.body);
    await query('INSERT INTO audit_log (user_id, event, ip, user_agent) VALUES ($1, $2, $3, $4)', [
      user.id,
      'user.login',
      req.ip,
      req.get('user-agent') ?? null,
    ]);
    res.json({ user: publicUser(user), ...tokens });
  }),
);

authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { user, tokens } = await refreshTokens(req.body.refreshToken);
    res.json({ user: publicUser(user), ...tokens });
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await revokeRefreshToken(req.body?.refreshToken);
    res.status(204).end();
  }),
);

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
