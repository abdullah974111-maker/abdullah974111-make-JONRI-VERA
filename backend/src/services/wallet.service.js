import { withTransaction } from '../db/pool.js';
import { ApiError } from '../middleware/errors.js';

const DEBIT_TYPES = new Set(['bet', 'withdrawal']);

export async function getOrCreateWallet(client, userId, currency = 'USD') {
  const existing = await client.query(
    'SELECT * FROM wallets WHERE user_id = $1 AND currency = $2',
    [userId, currency],
  );
  if (existing.rowCount > 0) return existing.rows[0];

  const created = await client.query(
    `INSERT INTO wallets (user_id, currency) VALUES ($1, $2)
     ON CONFLICT (user_id, currency) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [userId, currency],
  );
  return created.rows[0];
}

/** Locks the wallet row for the rest of the transaction. Always lock before reading a balance you intend to change. */
export async function lockWallet(client, walletId) {
  const { rows } = await client.query('SELECT * FROM wallets WHERE id = $1 FOR UPDATE', [walletId]);
  if (rows.length === 0) throw new ApiError(404, 'wallet_not_found', 'Wallet not found');
  return rows[0];
}

/**
 * Appends a ledger entry and moves the balance to match, inside the caller's
 * transaction. `reference` makes the write idempotent: replaying the same
 * reference for the same wallet and type returns the original entry and
 * leaves the balance alone.
 */
export async function postEntry(client, { walletId, type, amountCents, reference, roundId = null, metadata = {} }) {
  if (!Number.isInteger(amountCents) || amountCents === 0) {
    throw new ApiError(400, 'invalid_amount', 'Amount must be a non-zero integer number of cents');
  }
  const signed = DEBIT_TYPES.has(type) ? -Math.abs(amountCents) : Math.abs(amountCents);

  const wallet = await lockWallet(client, walletId);
  const balanceAfter = wallet.balance_cents + signed;
  if (balanceAfter < 0) {
    throw new ApiError(402, 'insufficient_funds', 'Insufficient balance');
  }

  const inserted = await client.query(
    `INSERT INTO wallet_transactions
       (wallet_id, type, amount_cents, balance_after_cents, reference, round_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (wallet_id, type, reference) DO NOTHING
     RETURNING *`,
    [walletId, type, signed, balanceAfter, reference, roundId, metadata],
  );

  if (inserted.rowCount === 0) {
    const { rows } = await client.query(
      'SELECT * FROM wallet_transactions WHERE wallet_id = $1 AND type = $2 AND reference = $3',
      [walletId, type, reference],
    );
    return { transaction: rows[0], wallet, duplicate: true };
  }

  const { rows } = await client.query(
    'UPDATE wallets SET balance_cents = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [walletId, balanceAfter],
  );
  return { transaction: inserted.rows[0], wallet: rows[0], duplicate: false };
}

export async function getWalletForUser(userId, currency = 'USD') {
  return withTransaction((client) => getOrCreateWallet(client, userId, currency));
}

export async function listTransactions(userId, { limit = 50, offset = 0 } = {}) {
  const wallet = await getWalletForUser(userId);
  const { rows } = await withTransaction((client) =>
    client.query(
      `SELECT id, type, amount_cents, balance_after_cents, round_id, metadata, created_at
         FROM wallet_transactions
        WHERE wallet_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [wallet.id, limit, offset],
    ),
  );
  return { wallet, transactions: rows };
}
