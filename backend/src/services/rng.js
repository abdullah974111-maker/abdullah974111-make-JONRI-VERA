import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Provably fair randomness.
 *
 * The server commits to a secret seed by publishing sha256(seed) before any
 * bet is placed. Each round mixes that seed with a player-chosen client seed
 * and an incrementing nonce, so the player can replay every result once the
 * seed is revealed on rotation. Nothing here depends on Math.random().
 */

export function createServerSeed() {
  const seed = randomBytes(32).toString('hex');
  return { seed, hash: hashSeed(seed) };
}

export function hashSeed(seed) {
  return createHash('sha256').update(seed).digest('hex');
}

export function createClientSeed() {
  return randomBytes(12).toString('hex');
}

export function verifySeed(seed, expectedHash) {
  const actual = Buffer.from(hashSeed(seed), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function digestAt(serverSeed, clientSeed, nonce, cursor) {
  return createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${cursor}`).digest();
}

/**
 * Deterministic stream of floats in [0, 1) for one round.
 * Four bytes per float, re-hashing with an incrementing cursor when exhausted.
 */
export function floatStream(serverSeed, clientSeed, nonce) {
  let cursor = 0;
  let digest = digestAt(serverSeed, clientSeed, nonce, cursor);
  let offset = 0;

  return function nextFloat() {
    if (offset + 4 > digest.length) {
      cursor += 1;
      digest = digestAt(serverSeed, clientSeed, nonce, cursor);
      offset = 0;
    }
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      value += digest[offset + i] / 256 ** (i + 1);
    }
    offset += 4;
    return value;
  };
}

/** Uniform integer in [min, max]. */
export function nextInt(nextFloat, min, max) {
  return min + Math.floor(nextFloat() * (max - min + 1));
}

/** Picks an entry from `[{ weight, ... }]` proportionally to its weight. */
export function weightedPick(nextFloat, entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let target = nextFloat() * total;
  for (const entry of entries) {
    target -= entry.weight;
    if (target < 0) return entry;
  }
  return entries[entries.length - 1];
}
