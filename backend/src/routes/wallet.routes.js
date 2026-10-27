import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/env.js';
import { withTransaction } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { getOrCreateWallet, listTransactions, postEntry } from '../services/wallet.service.js';

export const walletRouter = Router();

walletRouter.use(requireAuth);

const depositSchema = z.object({
  amountCents: z.number().int().positive(),
  // Supplied by the client so a retried request cannot deposit twice.
  idempotencyKey: z.string().min(8).max(100).optional(),
});

const withdrawSchema = z.object({
  amountCents: z.number().int().positive(),
  destination: z.record(z.unknown()).default({}),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

walletRouter.get(
  '/balance',
  asyncHandler(async (req, res) => {
    const wallet = await withTransaction((client) => getOrCreateWallet(client, req.user.id));
    res.json({
      balanceCents: wallet.balance_cents,
      lockedCents: wallet.locked_cents,
      availableCents: wallet.balance_cents - wallet.locked_cents,
      currency: wallet.currency,
    });
  }),
);

walletRouter.get(
  '/transactions',
  validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { transactions } = await listTransactions(req.user.id, req.query);
    res.json({ transactions });
  }),
);

/**
 * Development top-up. Real money arrives through the payment provider's
 * webhook, which is the only thing that should ever credit a wallet; this
 * route exists so the local stack has a balance to play with.
 */
walletRouter.post(
  '/deposit',
  validate(depositSchema),
  asyncHandler(async (req, res) => {
    if (!config.wallet.allowSimulatedDeposits) {
      throw new ApiError(
        501,
        'deposits_not_configured',
        'Simulated deposits are disabled. Wire up the payment provider webhook to credit wallets.',
      );
    }
    if (req.body.amountCents > config.wallet.maxDepositCents) {
      throw new ApiError(400, 'amount_too_large', `Deposits are capped at ${config.wallet.maxDepositCents} cents`);
    }

    const result = await withTransaction(async (client) => {
      const wallet = await getOrCreateWallet(client, req.user.id);

      const { rows } = await client.query(
        'SELECT daily_deposit_limit_cents FROM responsible_gaming_limits WHERE user_id = $1',
        [req.user.id],
      );
      const limit = rows[0]?.daily_deposit_limit_cents ?? null;
      if (limit !== null) {
        const { rows: todayRows } = await client.query(
          `SELECT COALESCE(SUM(amount_cents), 0) AS deposited
             FROM wallet_transactions
            WHERE wallet_id = $1 AND type = 'deposit'
              AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
          [wallet.id],
        );
        if (Number(todayRows[0].deposited) + req.body.amountCents > limit) {
          throw new ApiError(403, 'daily_deposit_limit_reached', 'This deposit would exceed your daily limit');
        }
      }

      return postEntry(client, {
        walletId: wallet.id,
        type: 'deposit',
        amountCents: req.body.amountCents,
        reference: req.body.idempotencyKey ?? randomUUID(),
        metadata: { source: 'simulated' },
      });
    });

    res.status(result.duplicate ? 200 : 201).json({
      balanceCents: result.wallet.balance_cents,
      transactionId: result.transaction.id,
      duplicate: result.duplicate,
    });
  }),
);

/**
 * Queues a withdrawal for review. The amount is debited immediately so it
 * cannot be staked while the request is pending; a rejection refunds it.
 */
walletRouter.post(
  '/withdraw',
  validate(withdrawSchema),
  asyncHandler(async (req, res) => {
    if (req.body.amountCents < config.wallet.minWithdrawalCents) {
      throw new ApiError(
        400,
        'amount_too_small',
        `Minimum withdrawal is ${config.wallet.minWithdrawalCents} cents`,
      );
    }
    if (req.user.kyc_status !== 'verified') {
      throw new ApiError(403, 'kyc_required', 'Identity verification must be completed before withdrawing');
    }

    const withdrawal = await withTransaction(async (client) => {
      const wallet = await getOrCreateWallet(client, req.user.id);
      const { rows } = await client.query(
        `INSERT INTO withdrawals (user_id, wallet_id, amount_cents, destination)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.user.id, wallet.id, req.body.amountCents, req.body.destination],
      );
      const created = rows[0];

      await postEntry(client, {
        walletId: wallet.id,
        type: 'withdrawal',
        amountCents: req.body.amountCents,
        reference: created.id,
        metadata: { withdrawalId: created.id },
      });

      await client.query('INSERT INTO audit_log (user_id, event, data) VALUES ($1, $2, $3)', [
        req.user.id,
        'withdrawal.requested',
        { withdrawalId: created.id, amountCents: req.body.amountCents },
      ]);

      return created;
    });

    res.status(201).json({
      withdrawal: {
        id: withdrawal.id,
        amountCents: withdrawal.amount_cents,
        status: withdrawal.status,
        createdAt: withdrawal.created_at,
      },
    });
  }),
);

walletRouter.get(
  '/withdrawals',
  asyncHandler(async (req, res) => {
    const { rows } = await withTransaction((client) =>
      client.query(
        `SELECT id, amount_cents, status, review_note, created_at, reviewed_at
           FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.user.id],
      ),
    );
    res.json({ withdrawals: rows });
  }),
);
