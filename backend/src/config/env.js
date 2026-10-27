import 'dotenv/config';

function int(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.API_PORT, 3001),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: int(process.env.DB_PORT, 5432),
    user: process.env.DB_USER ?? 'reels_user',
    password: process.env.DB_PASSWORD ?? 'secure_password',
    database: process.env.DB_NAME ?? 'royal_reels',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: int(process.env.REDIS_PORT, 6379),
    db: int(process.env.REDIS_DB, 0),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? 'your_secret_key_here',
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTokenTtlSeconds: int(process.env.REFRESH_TOKEN_TTL_SECONDS, 60 * 60 * 24 * 30),
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10),
  },
  wallet: {
    // Lets the dev stack top up a balance without a payment provider.
    // Must stay false anywhere real money is involved.
    allowSimulatedDeposits: bool(process.env.ALLOW_SIMULATED_DEPOSITS, process.env.NODE_ENV !== 'production'),
    maxDepositCents: int(process.env.MAX_DEPOSIT_CENTS, 500_000),
    minWithdrawalCents: int(process.env.MIN_WITHDRAWAL_CENTS, 1_000),
  },
};

export function assertProductionConfig() {
  if (config.env !== 'production') return;

  const problems = [];
  if (config.auth.jwtSecret === 'your_secret_key_here' || config.auth.jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be set to a random value of at least 32 characters');
  }
  if (config.db.password === 'secure_password') {
    problems.push('DB_PASSWORD must not be the template default');
  }
  if (config.wallet.allowSimulatedDeposits) {
    problems.push('ALLOW_SIMULATED_DEPOSITS must be false in production');
  }
  if (problems.length > 0) {
    throw new Error(`Refusing to start in production:\n - ${problems.join('\n - ')}`);
  }
}
