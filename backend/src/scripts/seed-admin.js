import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { pool, withTransaction } from '../db/pool.js';
import { createClientSeed, createServerSeed } from '../services/rng.js';
import { getOrCreateWallet } from '../services/wallet.service.js';

/**
 * Creates (or promotes) the admin account. Set ADMIN_EMAIL and ADMIN_PASSWORD
 * to choose the credentials; otherwise a random password is generated and
 * printed once.
 */
export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@royalreels.local';
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);

  const user = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, display_name, role, kyc_status)
       VALUES ($1, $2, $3, 'admin', 'verified')
       ON CONFLICT (email_lower) DO UPDATE SET role = 'admin', updated_at = now()
       RETURNING *`,
      [email, passwordHash, process.env.ADMIN_NAME ?? 'Floor Manager'],
    );
    const created = rows[0];

    await getOrCreateWallet(client, created.id);
    const { seed, hash } = createServerSeed();
    await client.query(
      `INSERT INTO server_seeds (user_id, seed, seed_hash, client_seed)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [created.id, seed, hash, createClientSeed()],
    );
    return created;
  });

  logger.info({ email: user.email, id: user.id }, 'admin account ready');
  if (generated) {
    // Printed to stdout on purpose: this is the only time the password exists in the clear.
    process.stdout.write(`\nAdmin login: ${email}\nAdmin password: ${password}\n\n`);
  }
  return user;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await seedAdmin();
  } catch (error) {
    logger.error({ err: error }, 'seeding admin failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
