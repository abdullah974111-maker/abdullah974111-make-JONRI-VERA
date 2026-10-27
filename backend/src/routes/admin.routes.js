import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { postEntry } from '../services/wallet.service.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

const reviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
});

const kycReviewSchema = z.object({
  decision: z.enum(['verified', 'rejected']),
});

adminRouter.get(
  '/withdrawals',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const { rows } = await query(
      `SELECT w.id, w.amount_cents, w.status, w.created_at, u.email, u.display_name, u.kyc_status
         FROM withdrawals w JOIN users u ON u.id = w.user_id
        WHERE w.status = $1
        ORDER BY w.created_at ASC
        LIMIT 100`,
      [status],
    );
    res.json({ withdrawals: rows });
  }),
);

adminRouter.post(
  '/withdrawals/:id/review',
  validate(reviewSchema),
  asyncHandler(async (req, res) => {
    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      );
      const withdrawal = rows[0];
      if (!withdrawal) throw new ApiError(404, 'withdrawal_not_found', 'Withdrawal not found');
      if (withdrawal.status !== 'pending') {
        throw new ApiError(409, 'already_reviewed', `Withdrawal is already ${withdrawal.status}`);
      }

      if (req.body.decision === 'rejected') {
        // The funds were debited when the request was made, so give them back.
        await postEntry(client, {
          walletId: withdrawal.wallet_id,
          type: 'refund',
          amountCents: withdrawal.amount_cents,
          reference: withdrawal.id,
          metadata: { withdrawalId: withdrawal.id, reason: req.body.note ?? 'rejected' },
        });
      }

      const result = await client.query(
        `UPDATE withdrawals
            SET status = $2, reviewed_by = $3, review_note = $4, reviewed_at = now()
          WHERE id = $1 RETURNING *`,
        [withdrawal.id, req.body.decision, req.user.id, req.body.note ?? null],
      );

      await client.query('INSERT INTO audit_log (user_id, event, data) VALUES ($1, $2, $3)', [
        req.user.id,
        'withdrawal.reviewed',
        { withdrawalId: withdrawal.id, decision: req.body.decision },
      ]);

      return result.rows[0];
    });

    res.json({ withdrawal: updated });
  }),
);

adminRouter.post(
  '/kyc/:userId/review',
  validate(kycReviewSchema),
  asyncHandler(async (req, res) => {
    const { rows } = await withTransaction(async (client) => {
      const result = await client.query(
        'UPDATE users SET kyc_status = $2, updated_at = now() WHERE id = $1 RETURNING *',
        [req.params.userId, req.body.decision],
      );
      if (result.rowCount === 0) throw new ApiError(404, 'user_not_found', 'User not found');

      await client.query(
        `UPDATE kyc_submissions SET status = $2, resolved_at = now()
          WHERE user_id = $1 AND status = 'pending'`,
        [req.params.userId, req.body.decision === 'verified' ? 'verified' : 'rejected'],
      );
      await client.query('INSERT INTO audit_log (user_id, event, data) VALUES ($1, $2, $3)', [
        req.user.id,
        'kyc.reviewed',
        { userId: req.params.userId, decision: req.body.decision },
      ]);
      return result;
    });

    res.json({ userId: rows[0].id, kycStatus: rows[0].kyc_status });
  }),
);

adminRouter.get(
  '/metrics',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'player')                         AS players,
        (SELECT COUNT(*) FROM game_rounds WHERE created_at > now() - interval '24 hours') AS rounds_24h,
        (SELECT COALESCE(SUM(bet_cents), 0) FROM game_rounds WHERE created_at > now() - interval '24 hours')    AS wagered_24h_cents,
        (SELECT COALESCE(SUM(payout_cents), 0) FROM game_rounds WHERE created_at > now() - interval '24 hours') AS paid_out_24h_cents,
        (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending')               AS pending_withdrawals,
        (SELECT COALESCE(SUM(balance_cents), 0) FROM wallets)                     AS player_liability_cents
    `);
    res.json({ metrics: rows[0] });
  }),
);
