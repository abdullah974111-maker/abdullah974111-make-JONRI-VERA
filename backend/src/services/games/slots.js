import { weightedPick } from '../rng.js';
import { payoutFor } from './payout.js';

/**
 * Three-reel slot. Every reel uses the same weighted strip, so the exact RTP
 * is computable by enumeration (see test/games.test.js) rather than estimated.
 */
export const REELS = 3;

export const SYMBOLS = [
  { symbol: 'cherry', weight: 24, three: 5, pair: 1 },
  { symbol: 'lemon', weight: 20, three: 8, pair: 0 },
  { symbol: 'bell', weight: 14, three: 15, pair: 0 },
  { symbol: 'crown', weight: 8, three: 45, pair: 2 },
  { symbol: 'diamond', weight: 5, three: 200, pair: 2 },
  { symbol: 'seven', weight: 3, three: 1500, pair: 2 },
];

const BY_SYMBOL = new Map(SYMBOLS.map((entry) => [entry.symbol, entry]));

/** Multiplier for a spin, given the three symbols that landed. */
export function evaluateSpin(spin) {
  const [a, b, c] = spin;
  if (a === b && b === c) {
    return { multiplier: BY_SYMBOL.get(a).three, line: 'three-of-a-kind', symbol: a };
  }
  const paired = a === b || a === c ? a : b === c ? b : null;
  if (paired) {
    const multiplier = BY_SYMBOL.get(paired).pair;
    if (multiplier > 0) return { multiplier, line: 'pair', symbol: paired };
  }
  return { multiplier: 0, line: 'none', symbol: null };
}

export const slots = {
  slug: 'slots',
  name: 'Royal Reels Classic',
  category: 'slots',
  rtp: 0.9593,
  minBetCents: 25,
  maxBetCents: 50_000,
  config: { reels: REELS, symbols: SYMBOLS },

  validateSelection() {
    // A spin takes no player input beyond the stake.
    return {};
  },

  play({ nextFloat, betCents }) {
    const spin = Array.from({ length: REELS }, () => weightedPick(nextFloat, SYMBOLS).symbol);
    const { multiplier, line, symbol } = evaluateSpin(spin);
    return {
      payoutCents: multiplier > 0 ? payoutFor(betCents, multiplier) : 0,
      outcome: { spin, line, symbol, won: multiplier > 0, multiplier },
    };
  },
};
