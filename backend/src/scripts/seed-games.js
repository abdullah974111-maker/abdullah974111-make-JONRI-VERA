import { logger } from '../config/logger.js';
import { pool, withTransaction } from '../db/pool.js';
import { games } from '../services/games/index.js';

/** Upserts the game catalogue from the code definitions, so the two cannot drift. */
export async function seedGames() {
  await withTransaction(async (client) => {
    for (const game of games) {
      await client.query(
        `INSERT INTO games (slug, name, category, rtp, min_bet_cents, max_bet_cents, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           rtp = EXCLUDED.rtp,
           min_bet_cents = EXCLUDED.min_bet_cents,
           max_bet_cents = EXCLUDED.max_bet_cents,
           config = EXCLUDED.config`,
        [
          game.slug,
          game.name,
          game.category,
          game.rtp,
          game.minBetCents,
          game.maxBetCents,
          game.config,
        ],
      );
    }
  });
  logger.info({ count: games.length }, 'game catalogue seeded');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await seedGames();
  } catch (error) {
    logger.error({ err: error }, 'seeding games failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
