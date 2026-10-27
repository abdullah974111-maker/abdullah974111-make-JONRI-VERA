# Royal Reels Casino - Launch Guide

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose installed
- Node.js 18+ (only for running the services outside Docker)
- Git

### Step 1: Clone & Setup
```bash
git clone https://github.com/abdullah974111-maker/abdullah974111-make-JONRI-VERA.git
cd abdullah974111-make-JONRI-VERA
```

### Step 2: Configure Environment
```bash
cp .env.example .env
# At minimum, set JWT_SECRET: openssl rand -hex 32
```

### Step 3: Launch with Docker Compose
```bash
docker compose up -d
```

This will start:
- ✅ PostgreSQL Database (Port 5432)
- ✅ Redis Cache (Port 6379)
- ✅ Node.js API Server (Port 3001)
- ✅ React Frontend (Port 3000)
- ✅ Adminer Database UI (Port 8080)

### Step 4: Create the schema and seed the floor
```bash
docker compose exec api npm run migrate
docker compose exec api npm run seed:games
docker compose exec api npm run seed:admin   # prints the admin password once
```

### Step 5: Access the Platform
- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001
- **Health**: http://localhost:3001/health/ready
- **Database Admin**: http://localhost:8080

Register a player in the UI, deposit from the wallet page, and play.

---

## 📋 Services Overview

### Frontend (React + Vite)
- Lobby, game tables, wallet, and provably-fair verification pages
- WebSocket live feed of settled rounds
- Responsive down to phone width

### Backend API (Node.js/Express)
- REST endpoints + WebSocket at `/ws`
- JWT access tokens with single-use refresh tokens held in Redis
- Server-authoritative game engine (slots, roulette, dice, coinflip)
- Double-entry wallet ledger with idempotent transactions
- Admin review queues for withdrawals and KYC

### Database (PostgreSQL)
- Users, wallets, wallet_transactions, game_rounds, server_seeds
- Withdrawals, KYC submissions, responsible-gaming limits, audit log
- Money is stored as `BIGINT` cents — never floating point

### Cache Layer (Redis)
- Refresh-token store
- Pub/sub channel behind the live round feed

---

## 🔧 Development Commands

### View Logs
```bash
docker compose logs -f api
docker compose logs -f frontend
```

### Run the test suite
```bash
docker compose exec api npm test        # game math, payout rounding, RTP enumeration
```

### Stop Services
```bash
docker compose down
```

### Reset Database
```bash
docker compose down -v
docker compose up -d
docker compose exec api npm run migrate && docker compose exec api npm run seed:games
```

### Run Migrations
```bash
docker compose exec api npm run migrate
```

### Run without Docker
```bash
# Terminal 1 — needs Postgres and Redis reachable per your .env
cd backend && npm install && npm run migrate && npm run seed:games && npm run dev

# Terminal 2
cd frontend && npm install && npm run dev
```

---

## 🔐 Security Checklist

- [ ] Set `JWT_SECRET` to 32+ random bytes (`openssl rand -hex 32`)
- [ ] Set a strong `DB_PASSWORD`
- [ ] Set `ALLOW_SIMULATED_DEPOSITS=false` outside development
- [ ] Point `CORS_ORIGIN` at your real frontend origin
- [ ] Terminate TLS in front of the API and frontend
- [ ] Review the rate limits in `backend/src/routes/*.routes.js`
- [ ] Configure firewall rules; do not expose Postgres, Redis, or Adminer publicly
- [ ] Wire a payment provider (see *Not yet wired up* below)
- [ ] Wire a KYC provider and review queue

`NODE_ENV=production` refuses to start while `JWT_SECRET` is the template
default, `DB_PASSWORD` is `secure_password`, or simulated deposits are on.

---

## 📊 Initial Setup

### 1. Create Admin User
```bash
docker compose exec api npm run seed:admin
```
Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` to choose the credentials, or
leave `ADMIN_PASSWORD` unset and the command prints a generated one once.

### 2. Load Game Templates
```bash
docker compose exec api npm run seed:games
```
Upserts the catalogue from `backend/src/services/games/`, so the database and
the code cannot drift apart.

### 3. Initialize Wallets
```bash
docker compose exec api npm run seed:wallets
```
Ensures every account has a wallet, and tops up empty ones by
`SEED_BALANCE_CENTS` when simulated deposits are enabled.

---

## 🚨 Troubleshooting

### Port Already in Use
```bash
# Change ports in docker-compose.yml, or free the port
lsof -i :3000
kill -9 <PID>
```

### Database Connection Error
```bash
docker compose logs postgres
curl -s http://localhost:3001/health/ready   # reports postgres and redis separately
```

### Frontend Can't Reach the API
The API only accepts browser origins listed in `CORS_ORIGIN`. Visiting the app
on `http://127.0.0.1:3000` while `CORS_ORIGIN` says `http://localhost:3000`
will fail every request — use the same hostname, or list both (comma separated).

```bash
# Update REACT_APP_API_URL / REACT_APP_WS_URL in .env, then
docker compose up -d --build frontend
```

### "Insufficient balance" on every bet
Deposit first: the wallet page, or
`POST /api/wallet/deposit` with `ALLOW_SIMULATED_DEPOSITS=true`.

---

## 📱 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user (password: 12+ characters)
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Exchange a refresh token (single use, rotated)
- `POST /api/auth/logout` - Revoke the refresh token
- `GET  /api/auth/me` - Current user

### Games
- `GET  /api/games` - List all games
- `GET  /api/games/:slug` - Game details, limits, and config
- `POST /api/games/play` - Place a bet; the server decides the outcome and
  settles it against the wallet in one transaction
- `GET  /api/games/rounds/history` - Your settled rounds

### Provably fair
- `GET  /api/games/fairness/current` - Published server-seed hash and client seed
- `POST /api/games/fairness/rotate` - Reveal the current seed, commit to a new one
- `POST /api/games/fairness/verify` - Replay a round from a revealed seed (public)
- `POST /api/games/fairness/check-seed` - Confirm a seed matches its hash (public)

> There is deliberately no "submit result" endpoint. Outcomes are computed on
> the server from a committed seed; a client that could report its own result
> could report a win.

### Wallet
- `GET  /api/wallet/balance` - Get user balance
- `GET  /api/wallet/transactions` - Ledger history
- `POST /api/wallet/deposit` - Deposit funds (simulated; see below)
- `POST /api/wallet/withdraw` - Request a withdrawal (debited immediately, refunded if rejected)
- `GET  /api/wallet/withdrawals` - Your withdrawal requests

### Users
- `GET  /api/users/profile` - Get user profile
- `PUT  /api/users/profile` - Update profile
- `POST /api/users/kyc` - Submit KYC verification
- `GET  /api/users/limits` - Responsible-gaming limits
- `PUT  /api/users/limits` - Set daily deposit / loss / session limits
- `POST /api/users/self-exclude` - Self-exclude for N days (extendable, never shortened here)

### Admin (role `admin`)
- `GET  /api/admin/withdrawals` - Review queue
- `POST /api/admin/withdrawals/:id/review` - Approve or reject
- `POST /api/admin/kyc/:userId/review` - Verify or reject identity
- `GET  /api/admin/metrics` - Rounds, handle, payouts, player liability

### Health
- `GET /health/live` - Process is up
- `GET /health/ready` - Postgres and Redis reachable

---

## 🎮 What's implemented

✅ Registration, login, token refresh and rotation
✅ Four games with enumerated, test-verified RTP
✅ Provably fair commitments, reveal, and public verification
✅ Wallet ledger with idempotent, transactional settlement
✅ Withdrawal and KYC review queues
✅ Responsible gaming: deposit and loss limits, self-exclusion
✅ Live round feed over WebSocket
✅ Audit log of logins, withdrawals, KYC decisions, self-exclusion

## ⚠️ Not yet wired up

These are deliberate gaps, not bugs. Each one needs a real provider and a
compliance review before this platform takes money from anyone:

- **Payments.** `POST /api/wallet/deposit` credits the wallet directly and is
  gated behind `ALLOW_SIMULATED_DEPOSITS`. Real deposits must be credited from
  a verified payment-provider webhook, never from a client request.
- **Withdrawal payouts.** Approving a withdrawal marks it approved; it does not
  move money. Connect a payout rail and mark the row `paid` on settlement.
- **KYC/AML.** Submissions store a provider reference. No document is sent
  anywhere, and no screening runs.
- **Licensing.** Operating a real-money casino requires a licence in each
  jurisdiction you serve, certified RNG audits, and reporting obligations.
- **Email, fraud scoring, and analytics** are described in ARCHITECTURE.md but
  not built.

---

## 📞 Support

1. Check logs: `docker compose logs`
2. Review ARCHITECTURE.md for system design
3. Check `.env` configuration
4. Verify all services are running: `docker compose ps`

---

**Status**: 🟡 Runs end to end locally; see *Not yet wired up* before going live
**Last Updated**: 2026-10-27
**Version**: 1.0
