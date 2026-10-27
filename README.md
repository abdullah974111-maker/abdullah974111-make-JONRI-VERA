# Royal Reels Casino

A reference implementation of an online casino platform: a React front end, an
Express API with a server-authoritative game engine, a double-entry wallet
ledger in PostgreSQL, and a Redis-backed live feed.

```bash
cp .env.example .env            # set JWT_SECRET
docker compose up -d
docker compose exec api npm run migrate
docker compose exec api npm run seed:games
docker compose exec api npm run seed:admin
open http://localhost:3000
```

Full instructions: [LAUNCH_GUIDE.md](LAUNCH_GUIDE.md).
System design and what is / isn't built: [ARCHITECTURE.md](ARCHITECTURE.md).

## Layout

```
backend/         Express API, WebSocket, game engine, migrations, seeds
  src/services/games/   slots, roulette, dice, coinflip — the house edge lives here
  src/services/rng.js   provably fair randomness
  src/db/migrations/    SQL schema
frontend/        React + Vite client
docker-compose.yml      Postgres, Redis, API, frontend, Adminer
```

## How a round works

1. On registration the server generates a secret seed and publishes only its
   SHA-256 hash. The player gets a client seed they can change.
2. `POST /api/games/play` takes a stake and a selection. The server locks the
   wallet, debits the stake, derives the outcome from
   `HMAC-SHA256(serverSeed, clientSeed:nonce:cursor)`, credits any win, and
   records the round — all in one database transaction.
3. The client is never asked for a result, and never sees the seed until it is
   retired.
4. Rotating the seed reveals it. `POST /api/games/fairness/verify` replays any
   past round from that seed and compares it with what was recorded.

## House edge

Every paytable is verified by enumeration rather than simulation, so the
declared RTP is exact (`backend/test/games.test.js`):

| Game | RTP |
|------|-----|
| High Roller Dice | 99.00% |
| Lucky Coin | 98.00% |
| Royal Roulette (European) | 97.30% |
| Royal Reels Classic (slots) | 95.93% |

Payouts round down, so rounding never pays more than the odds allow.

## Tests

```bash
cd backend && npm test      # game math, payout rounding, selection validation
cd frontend && npm run build
```

## Before taking real money

Deposits are simulated and gated behind `ALLOW_SIMULATED_DEPOSITS`; approving a
withdrawal does not move money; KYC submissions are stored but not screened.
Those integrations, a gaming licence, and an accredited RNG audit all come
before this platform is pointed at anyone's bank account. See
the "Not yet wired up" section of [LAUNCH_GUIDE.md](LAUNCH_GUIDE.md).
