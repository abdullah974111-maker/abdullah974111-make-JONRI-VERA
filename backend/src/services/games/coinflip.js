import { payoutFor } from './payout.js';

const WIN_MULTIPLIER = 1.96; // 50% win chance => 98% RTP
const SIDES = ['heads', 'tails'];

export const coinflip = {
  slug: 'coinflip',
  name: 'Lucky Coin',
  category: 'instant',
  rtp: 0.98,
  minBetCents: 50,
  maxBetCents: 100_000,
  config: { sides: SIDES, winMultiplier: WIN_MULTIPLIER },

  validateSelection(selection = {}) {
    const side = String(selection.side ?? '').toLowerCase();
    if (!SIDES.includes(side)) {
      throw new Error(`side must be one of: ${SIDES.join(', ')}`);
    }
    return { side };
  },

  play({ nextFloat, betCents, selection }) {
    const landed = nextFloat() < 0.5 ? 'heads' : 'tails';
    const won = landed === selection.side;
    return {
      payoutCents: won ? payoutFor(betCents, WIN_MULTIPLIER) : 0,
      outcome: { landed, won, multiplier: won ? WIN_MULTIPLIER : 0 },
    };
  },
};
