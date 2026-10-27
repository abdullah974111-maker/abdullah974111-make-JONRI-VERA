-- Royal Reels Casino - initial schema.
-- All monetary amounts are BIGINT minor units (cents). Never floats.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL,
    email_lower     TEXT GENERATED ALWAYS AS (lower(email)) STORED,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
    kyc_status      TEXT NOT NULL DEFAULT 'unverified'
                        CHECK (kyc_status IN ('unverified', 'pending', 'verified', 'rejected')),
    self_excluded_until TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_key ON users (email_lower);

CREATE TABLE responsible_gaming_limits (
    user_id                 UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    daily_deposit_limit_cents BIGINT CHECK (daily_deposit_limit_cents IS NULL OR daily_deposit_limit_cents >= 0),
    daily_loss_limit_cents    BIGINT CHECK (daily_loss_limit_cents IS NULL OR daily_loss_limit_cents >= 0),
    session_limit_minutes     INTEGER CHECK (session_limit_minutes IS NULL OR session_limit_minutes > 0),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    currency       TEXT NOT NULL DEFAULT 'USD',
    balance_cents  BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
    locked_cents   BIGINT NOT NULL DEFAULT 0 CHECK (locked_cents >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT wallets_locked_within_balance CHECK (locked_cents <= balance_cents)
);

CREATE UNIQUE INDEX wallets_user_currency_key ON wallets (user_id, currency);

CREATE TABLE games (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,
    rtp             NUMERIC(5, 4) NOT NULL CHECK (rtp > 0 AND rtp <= 1),
    min_bet_cents   BIGINT NOT NULL CHECK (min_bet_cents > 0),
    max_bet_cents   BIGINT NOT NULL CHECK (max_bet_cents >= min_bet_cents),
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Commitment scheme for provably fair play: the hash is published up front,
-- the seed itself is only revealed once the player rotates it.
CREATE TABLE server_seeds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    seed            TEXT NOT NULL,
    seed_hash       TEXT NOT NULL,
    client_seed     TEXT NOT NULL,
    nonce           BIGINT NOT NULL DEFAULT 0 CHECK (nonce >= 0),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revealed_at     TIMESTAMPTZ
);

CREATE UNIQUE INDEX server_seeds_one_active_per_user ON server_seeds (user_id) WHERE is_active;

CREATE TABLE game_rounds (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    game_id          UUID NOT NULL REFERENCES games (id),
    bet_cents        BIGINT NOT NULL CHECK (bet_cents > 0),
    payout_cents     BIGINT NOT NULL DEFAULT 0 CHECK (payout_cents >= 0),
    selection        JSONB NOT NULL DEFAULT '{}'::jsonb,
    outcome          JSONB NOT NULL,
    server_seed_id   UUID NOT NULL REFERENCES server_seeds (id),
    server_seed_hash TEXT NOT NULL,
    client_seed      TEXT NOT NULL,
    nonce            BIGINT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX game_rounds_seed_nonce_key ON game_rounds (server_seed_id, nonce);
CREATE INDEX game_rounds_user_created_idx ON game_rounds (user_id, created_at DESC);

CREATE TABLE wallet_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id           UUID NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
    type                TEXT NOT NULL
                            CHECK (type IN ('deposit', 'withdrawal', 'bet', 'payout', 'bonus', 'adjustment', 'refund')),
    -- Signed: negative debits the wallet, positive credits it.
    amount_cents        BIGINT NOT NULL,
    balance_after_cents BIGINT NOT NULL CHECK (balance_after_cents >= 0),
    -- Idempotency key supplied by the caller (payment intent id, round id, ...).
    reference           TEXT NOT NULL,
    round_id            UUID REFERENCES game_rounds (id) ON DELETE SET NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wallet_transactions_reference_key ON wallet_transactions (wallet_id, type, reference);
CREATE INDEX wallet_transactions_wallet_created_idx ON wallet_transactions (wallet_id, created_at DESC);

CREATE TABLE withdrawals (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    wallet_id      UUID NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
    amount_cents   BIGINT NOT NULL CHECK (amount_cents > 0),
    status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    destination    JSONB NOT NULL DEFAULT '{}'::jsonb,
    reviewed_by    UUID REFERENCES users (id),
    review_note    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at    TIMESTAMPTZ
);

CREATE INDEX withdrawals_status_created_idx ON withdrawals (status, created_at);

CREATE TABLE kyc_submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    document_type   TEXT NOT NULL,
    -- Reference into the KYC provider. Document images never land in our database.
    provider_ref    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'verified', 'rejected')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX kyc_submissions_user_idx ON kyc_submissions (user_id, created_at DESC);

CREATE TABLE audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     UUID REFERENCES users (id) ON DELETE SET NULL,
    event       TEXT NOT NULL,
    ip          INET,
    user_agent  TEXT,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_user_created_idx ON audit_log (user_id, created_at DESC);
CREATE INDEX audit_log_event_created_idx ON audit_log (event, created_at DESC);
