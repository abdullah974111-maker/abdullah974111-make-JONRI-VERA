import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/pool.js';
import { CHANNELS, redis } from '../db/redis.js';
import { ApiError } from '../middleware/errors.js';
import { getGame } from './games/index.js';
import { createClientSeed, createServerSeed, floatStream } from './rng.js';
import { getOrCreateWallet, postEntry } from './wallet.service.js';

async function activeSeedForUpdate(client, userId) {
  const { rows } = await client.query(
    'SELECT * FROM server_seeds WHERE user_id = $1 AND is_active FOR UPDATE',
    [userId],
  );
  if (rows.length > 0) return rows[0];

  const { seed, hash } = createServerSeed();
  const created = await client.query(
    `INSERT INTO server_seeds (user_id, seed, seed_hash, client_seed)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, seed, hash, createClientSeed()],
  );
  return created.rows[0];
}

/** Net loss (bets minus payouts) since midnight UTC, used for the daily loss limit. */
async function netLossToday(client, walletId) {
  const { rows } = await client.query(
    `SELECT COALESCE(-SUM(amount_cents), 0) AS net_loss_cents
       FROM wallet_transactions
      WHERE wallet_id = $1
        AND type IN ('bet', 'payout')
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
    [walletId],
  );
  return Number(rows[0].net_loss_cents);
}

export async function playRound({ user, gameSlug, betCents, selection }) {
  const game = getGame(gameSlug);
  if (!game) throw new ApiError(404, 'game_not_found', `Unknown game: ${gameSlug}`);

  if (!Number.isInteger(betCents) || betCents <= 0) {
    throw new ApiError(400, 'invalid_bet', 'betCents must be a positive integer');
  }

  let validatedSelection;
  try {
    validatedSelection = game.validateSelection(selection ?? {});
  } catch (error) {
    throw new ApiError(400, 'invalid_selection', error.message);
  }

  const result = await withTransaction(async (client) => {
    const { rows: gameRows } = await client.query(
      'SELECT * FROM games WHERE slug = $1 AND is_active',
      [gameSlug],
    );
    const gameRow = gameRows[0];
    if (!gameRow) throw new ApiError(404, 'game_not_found', `Game ${gameSlug} is not available`);

    if (betCents < gameRow.min_bet_cents || betCents > gameRow.max_bet_cents) {
      throw new ApiError(
        400,
        'bet_out_of_range',
        `Bet must be between ${gameRow.min_bet_cents} and ${gameRow.max_bet_cents} cents`,
      );
    }

    const wallet = await getOrCreateWallet(client, user.id);

    const { rows: limitRows } = await client.query(
      'SELECT daily_loss_limit_cents FROM responsible_gaming_limits WHERE user_id = $1',
      [user.id],
    );
    const dailyLossLimit = limitRows[0]?.daily_loss_limit_cents ?? null;
    if (dailyLossLimit !== null) {
      const lost = await netLossToday(client, wallet.id);
      if (lost + betCents > dailyLossLimit) {
        throw new ApiError(403, 'daily_loss_limit_reached', 'This bet would exceed your daily loss limit');
      }
    }

    const seed = await activeSeedForUpdate(client, user.id);
    const nonce = Number(seed.nonce) + 1;
    await client.query('UPDATE server_seeds SET nonce = $2 WHERE id = $1', [seed.id, nonce]);

    const nextFloat = floatStream(seed.seed, seed.client_seed, nonce);
    const { payoutCents, outcome } = game.play({ nextFloat, betCents, selection: validatedSelection });

    const roundId = randomUUID();
    await client.query(
      `INSERT INTO game_rounds
         (id, user_id, game_id, bet_cents, payout_cents, selection, outcome,
          server_seed_id, server_seed_hash, client_seed, nonce)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        roundId,
        user.id,
        gameRow.id,
        betCents,
        payoutCents,
        validatedSelection,
        outcome,
        seed.id,
        seed.seed_hash,
        seed.client_seed,
        nonce,
      ],
    );

    // The stake leaves the wallet before the win lands, so an insufficient
    // balance aborts the whole round rather than paying out an unfunded bet.
    let balance = await postEntry(client, {
      walletId: wallet.id,
      type: 'bet',
      amountCents: betCents,
      reference: roundId,
      roundId,
      metadata: { game: gameSlug },
    });

    if (payoutCents > 0) {
      balance = await postEntry(client, {
        walletId: wallet.id,
        type: 'payout',
        amountCents: payoutCents,
        reference: roundId,
        roundId,
        metadata: { game: gameSlug },
      });
    }

    return {
      roundId,
      game: gameSlug,
      betCents,
      payoutCents,
      netCents: payoutCents - betCents,
      outcome,
      selection: validatedSelection,
      balanceCents: balance.wallet.balance_cents,
      fairness: {
        serverSeedHash: seed.seed_hash,
        clientSeed: seed.client_seed,
        nonce,
      },
    };
  });

  // Best-effort live feed; a dropped Redis publish must not fail a settled round.
  redis
    .publish(
      CHANNELS.roundSettled,
      JSON.stringify({
        userId: user.id,
        displayName: user.display_name,
        game: gameSlug,
        betCents: result.betCents,
        payoutCents: result.payoutCents,
        at: new Date().toISOString(),
      }),
    )
    .catch(() => {});

  return result;
}

export async function listRounds(userId, { limit = 25, offset = 0 } = {}) {
  const { rows } = await withTransaction((client) =>
    client.query(
      `SELECT r.id, g.slug AS game, r.bet_cents, r.payout_cents, r.selection, r.outcome,
              r.server_seed_hash, r.client_seed, r.nonce, r.created_at
         FROM game_rounds r
         JOIN games g ON g.id = r.game_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
  );
  return rows;
}

/**
 * Reveals the player's current server seed and commits to a new one.
 * Past rounds stay verifiable; future rounds use the new commitment.
 */
export async function rotateSeed(userId, clientSeed) {
  return withTransaction(async (client) => {
    const current = await activeSeedForUpdate(client, userId);
    await client.query(
      'UPDATE server_seeds SET is_active = false, revealed_at = now() WHERE id = $1',
      [current.id],
    );

    const { seed, hash } = createServerSeed();
    const { rows } = await client.query(
      `INSERT INTO server_seeds (user_id, seed, seed_hash, client_seed)
       VALUES ($1, $2, $3, $4) RETURNING seed_hash, client_seed, nonce`,
      [userId, seed, hash, clientSeed || createClientSeed()],
    );

    return {
      revealed: {
        serverSeed: current.seed,
        serverSeedHash: current.seed_hash,
        clientSeed: current.client_seed,
        roundsPlayed: Number(current.nonce),
      },
      current: {
        serverSeedHash: rows[0].seed_hash,
        clientSeed: rows[0].client_seed,
        nonce: Number(rows[0].nonce),
      },
    };
  });
}

export async function currentFairness(userId) {
  return withTransaction(async (client) => {
    const seed = await activeSeedForUpdate(client, userId);
    return {
      serverSeedHash: seed.seed_hash,
      clientSeed: seed.client_seed,
      nonce: Number(seed.nonce),
    };
  });
}
