import { nextInt } from '../rng.js';
import { payoutFor } from './payout.js';

// European single-zero wheel: 37 pockets, house edge 1/37.
const POCKETS = 37;
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/** Total returned per unit staked, including the stake itself. */
const BETS = {
  straight: { multiplier: 36, wins: (n, value) => n === value, needsValue: true },
  red: { multiplier: 2, wins: (n) => RED.has(n) },
  black: { multiplier: 2, wins: (n) => n !== 0 && !RED.has(n) },
  odd: { multiplier: 2, wins: (n) => n !== 0 && n % 2 === 1 },
  even: { multiplier: 2, wins: (n) => n !== 0 && n % 2 === 0 },
  low: { multiplier: 2, wins: (n) => n >= 1 && n <= 18 },
  high: { multiplier: 2, wins: (n) => n >= 19 && n <= 36 },
  dozen: { multiplier: 3, wins: (n, value) => n !== 0 && Math.ceil(n / 12) === value, needsValue: true },
  column: { multiplier: 3, wins: (n, value) => n !== 0 && ((n - 1) % 3) + 1 === value, needsValue: true },
};

export const roulette = {
  slug: 'roulette',
  name: 'Royal Roulette',
  category: 'table',
  rtp: 36 / 37,
  minBetCents: 100,
  maxBetCents: 500_000,
  config: {
    wheel: 'european',
    pockets: POCKETS,
    red: [...RED],
    betTypes: Object.fromEntries(
      Object.entries(BETS).map(([type, bet]) => [
        type,
        { multiplier: bet.multiplier, needsValue: Boolean(bet.needsValue) },
      ]),
    ),
  },

  validateSelection(selection = {}) {
    const type = String(selection.betType ?? '').toLowerCase();
    const bet = BETS[type];
    if (!bet) {
      throw new Error(`betType must be one of: ${Object.keys(BETS).join(', ')}`);
    }
    if (!bet.needsValue) return { betType: type };

    const value = Number(selection.value);
    const ranges = { straight: [0, 36], dozen: [1, 3], column: [1, 3] };
    const [min, max] = ranges[type];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`value for a ${type} bet must be an integer between ${min} and ${max}`);
    }
    return { betType: type, value };
  },

  play({ nextFloat, betCents, selection }) {
    const pocket = nextInt(nextFloat, 0, POCKETS - 1);
    const bet = BETS[selection.betType];
    const won = bet.wins(pocket, selection.value);
    return {
      payoutCents: won ? payoutFor(betCents, bet.multiplier) : 0,
      outcome: {
        pocket,
        color: pocket === 0 ? 'green' : RED.has(pocket) ? 'red' : 'black',
        won,
        multiplier: won ? bet.multiplier : 0,
      },
    };
  },
};
