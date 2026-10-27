import { payoutFor } from './payout.js';

// House edge of 1%: a target that wins p% of the time pays 99/target.
const HOUSE_EDGE = 0.01;
const MIN_TARGET = 2;
const MAX_TARGET = 98;

export function multiplierForTarget(target) {
  return Math.floor((100 * (1 - HOUSE_EDGE) * 100) / target) / 100;
}

export const dice = {
  slug: 'dice',
  name: 'High Roller Dice',
  category: 'instant',
  rtp: 1 - HOUSE_EDGE,
  minBetCents: 50,
  maxBetCents: 250_000,
  config: { minTarget: MIN_TARGET, maxTarget: MAX_TARGET, rollRange: [0, 99.99] },

  validateSelection(selection = {}) {
    const target = Number(selection.target);
    if (!Number.isInteger(target) || target < MIN_TARGET || target > MAX_TARGET) {
      throw new Error(`target must be an integer between ${MIN_TARGET} and ${MAX_TARGET}`);
    }
    return { target };
  },

  play({ nextFloat, betCents, selection }) {
    const roll = Math.floor(nextFloat() * 10_000) / 100; // 0.00 - 99.99
    const won = roll < selection.target;
    const multiplier = multiplierForTarget(selection.target);
    return {
      payoutCents: won ? payoutFor(betCents, multiplier) : 0,
      outcome: { roll, target: selection.target, won, multiplier: won ? multiplier : 0 },
    };
  },
};
