import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { pool, withTransaction } from '../db/pool.js';
import { getOrCreateWallet, postEntry } from '../services/wallet.service.js';

/**
 * Makes sure every account has a wallet, and — in a non-production stack only —
 * tops up empty ones so there is something to play with.
 */
export async function seedWallets() {
  const topUpCents = Number.parseInt(process.env.SEED_BALANCE_CENTS ?? '100000', 10);
  const mayTopUp = config.wallet.allowSimulatedDeposits && topUpCents > 0;

  const summary = await withTransaction(async (client) => {
    const { rows: users } = await client.query('SELECT id FROM users');
    let created = 0;
    let toppedUp = 0;

    for (const user of users) {
      const before = await client.query('SELECT 1 FROM wallets WHERE user_id = $1', [user.id]);
      const wallet = await getOrCreateWallet(client, user.id);
      if (before.rowCount === 0) created += 1;

      if (mayTopUp && wallet.balance_cents === 0) {
        await postEntry(client, {
          walletId: wallet.id,
          type: 'bonus',
          amountCents: topUpCents,
          reference: `seed-${randomUUID()}`,
          metadata: { source: 'seed:wallets' },
        });
        toppedUp += 1;
      }
    }

    return { users: users.length, created, toppedUp };
  });

  logger.info(summary, mayTopUp ? 'wallets seeded' : 'wallets ensured (top-ups disabled)');
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await seedWallets();
  } catch (error) {
    logger.error({ err: error }, 'seeding wallets failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
