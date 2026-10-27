import { coinflip } from './coinflip.js';
import { dice } from './dice.js';
import { roulette } from './roulette.js';
import { slots } from './slots.js';

export { payoutFor } from './payout.js';

export const games = [coinflip, dice, roulette, slots];

export const gamesBySlug = new Map(games.map((game) => [game.slug, game]));

export function getGame(slug) {
  return gamesBySlug.get(slug);
}
