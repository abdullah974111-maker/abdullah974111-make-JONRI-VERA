import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { validate } from '../middleware/validate.js';
import { publicUser } from '../services/auth.service.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

const profileSchema = z.object({ displayName: z.string().min(2).max(40) });

const kycSchema = z.object({
  documentType: z.enum(['passport', 'drivers_license', 'national_id']),
  // Identity documents stay with the KYC provider; we only keep their reference.
  providerRef: z.string().min(4).max(128),
});

const limitsSchema = z
  .object({
    dailyDepositLimitCents: z.number().int().nonnegative().nullable().optional(),
    dailyLossLimitCents: z.number().int().nonnegative().nullable().optional(),
    sessionLimitMinutes: z.number().int().positive().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one limit' });

const selfExcludeSchema = z.object({ days: z.number().int().min(1).max(3650) });

usersRouter.get('/profile', (req, res) => res.json({ user: publicUser(req.user) }));

usersRouter.put(
  '/profile',
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [req.user.id, req.body.displayName],
    );
    res.json({ user: publicUser(rows[0]) });
  }),
);

usersRouter.post(
  '/kyc',
  validate(kycSchema),
  asyncHandler(async (req, res) => {
    const submission = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO kyc_submissions (user_id, document_type, provider_ref)
         VALUES ($1, $2, $3) RETURNING id, document_type, status, created_at`,
        [req.user.id, req.body.documentType, req.body.providerRef],
      );
      await client.query(
        `UPDATE users SET kyc_status = 'pending', updated_at = now()
          WHERE id = $1 AND kyc_status IN ('unverified', 'rejected')`,
        [req.user.id],
      );
      return rows[0];
    });
    res.status(202).json({ submission });
  }),
);

usersRouter.get(
  '/limits',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM responsible_gaming_limits WHERE user_id = $1', [req.user.id]);
    res.json({ limits: rows[0] ?? null });
  }),
);

usersRouter.put(
  '/limits',
  validate(limitsSchema),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `INSERT INTO responsible_gaming_limits
         (user_id, daily_deposit_limit_cents, daily_loss_limit_cents, session_limit_minutes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         daily_deposit_limit_cents = COALESCE(EXCLUDED.daily_deposit_limit_cents, responsible_gaming_limits.daily_deposit_limit_cents),
         daily_loss_limit_cents    = COALESCE(EXCLUDED.daily_loss_limit_cents, responsible_gaming_limits.daily_loss_limit_cents),
         session_limit_minutes     = COALESCE(EXCLUDED.session_limit_minutes, responsible_gaming_limits.session_limit_minutes),
         updated_at = now()
       RETURNING *`,
      [
        req.user.id,
        req.body.dailyDepositLimitCents ?? null,
        req.body.dailyLossLimitCents ?? null,
        req.body.sessionLimitMinutes ?? null,
      ],
    );
    res.json({ limits: rows[0] });
  }),
);

/**
 * Self-exclusion is one-way: it can be extended at any time, but never shortened
 * from here. Lifting one early is a support action with its own review.
 */
usersRouter.post(
  '/self-exclude',
  validate(selfExcludeSchema),
  asyncHandler(async (req, res) => {
    const { rows } = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE users
            SET self_excluded_until = GREATEST(
                  COALESCE(self_excluded_until, now()),
                  now() + ($2 || ' days')::interval
                ),
                updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [req.user.id, String(req.body.days)],
      );
      await client.query('INSERT INTO audit_log (user_id, event, data) VALUES ($1, $2, $3)', [
        req.user.id,
        'user.self_excluded',
        { days: req.body.days },
      ]);
      return result;
    });
    res.json({ user: publicUser(rows[0]) });
  }),
);
