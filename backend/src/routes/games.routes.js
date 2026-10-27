import { isDeepStrictEqual } from 'node:util';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, requireNotSelfExcluded } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { getGame } from '../services/games/index.js';
import { hashSeed, floatStream, verifySeed } from '../services/rng.js';
import { currentFairness, listRounds, playRound, rotateSeed } from '../services/round.service.js';

export const gamesRouter = Router();

const playLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: { error: { code: 'rate_limited', message: 'Slow down — too many rounds per minute' } },
});

const playSchema = z.object({
  game: z.string().min(1).max(40),
  betCents: z.number().int().positive().max(10_000_000),
  selection: z.record(z.unknown()).optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const rotateSchema = z.object({ clientSeed: z.string().min(4).max(64).optional() });

const verifySchema = z.object({
  game: z.string().min(1).max(40),
  serverSeed: z.string().min(16).max(128),
  clientSeed: z.string().min(1).max(64),
  nonce: z.number().int().nonnegative(),
  betCents: z.number().int().positive().max(10_000_000),
  selection: z.record(z.unknown()).optional(),
});

gamesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT slug, name, category, rtp, min_bet_cents, max_bet_cents, config
         FROM games WHERE is_active ORDER BY category, name`,
    );
    res.json({ games: rows });
  }),
);

gamesRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT slug, name, category, rtp, min_bet_cents, max_bet_cents, config
         FROM games WHERE slug = $1 AND is_active`,
      [req.params.slug],
    );
    if (rows.length === 0) throw new ApiError(404, 'game_not_found', 'Game not found');
    res.json({ game: rows[0] });
  }),
);

/**
 * Plays one round. The outcome is decided here and settled against the wallet
 * in the same transaction — the client never submits a result.
 */
gamesRouter.post(
  '/play',
  requireAuth,
  requireNotSelfExcluded,
  playLimiter,
  validate(playSchema),
  asyncHandler(async (req, res) => {
    const round = await playRound({
      user: req.user,
      gameSlug: req.body.game,
      betCents: req.body.betCents,
      selection: req.body.selection,
    });
    res.status(201).json({ round });
  }),
);

gamesRouter.get(
  '/rounds/history',
  requireAuth,
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ rounds: await listRounds(req.user.id, req.query) });
  }),
);

gamesRouter.get(
  '/fairness/current',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ fairness: await currentFairness(req.user.id) });
  }),
);

gamesRouter.post(
  '/fairness/rotate',
  requireAuth,
  validate(rotateSchema),
  asyncHandler(async (req, res) => {
    res.json(await rotateSeed(req.user.id, req.body.clientSeed));
  }),
);

/**
 * Replays a round from a revealed seed. Needs no account: anyone holding the
 * published hash can confirm the result was fixed before the bet was placed.
 */
gamesRouter.post(
  '/fairness/verify',
  validate(verifySchema),
  asyncHandler(async (req, res) => {
    const game = getGame(req.body.game);
    if (!game) throw new ApiError(404, 'game_not_found', `Unknown game: ${req.body.game}`);

    let selection;
    try {
      selection = game.validateSelection(req.body.selection ?? {});
    } catch (error) {
      throw new ApiError(400, 'invalid_selection', error.message);
    }

    const nextFloat = floatStream(req.body.serverSeed, req.body.clientSeed, req.body.nonce);
    const { payoutCents, outcome } = game.play({ nextFloat, betCents: req.body.betCents, selection });

    const { rows } = await query(
      `SELECT id, bet_cents, payout_cents, outcome
         FROM game_rounds
        WHERE server_seed_hash = $1 AND nonce = $2`,
      [hashSeed(req.body.serverSeed), req.body.nonce],
    );

    res.json({
      serverSeedHash: hashSeed(req.body.serverSeed),
      recomputed: { payoutCents, outcome },
      recordedRound: rows[0] ?? null,
      // jsonb does not preserve key order, so compare structurally.
      matchesRecord:
        rows.length === 0
          ? null
          : rows[0].payout_cents === payoutCents && isDeepStrictEqual(rows[0].outcome, outcome),
    });
  }),
);

/** Confirms a revealed seed matches the hash that was published before play. */
gamesRouter.post(
  '/fairness/check-seed',
  validate(z.object({ serverSeed: z.string().min(16).max(128), serverSeedHash: z.string().length(64) })),
  (req, res) => {
    res.json({ valid: verifySeed(req.body.serverSeed, req.body.serverSeedHash) });
  },
);
