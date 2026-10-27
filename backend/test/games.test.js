import assert from 'node:assert/strict';
import test from 'node:test';
import { coinflip } from '../src/services/games/coinflip.js';
import { dice, multiplierForTarget } from '../src/services/games/dice.js';
import { payoutFor } from '../src/services/games/payout.js';
import { roulette } from '../src/services/games/roulette.js';
import { SYMBOLS, evaluateSpin, slots } from '../src/services/games/slots.js';

test('payoutFor never rounds in the player\'s favour', () => {
  assert.equal(payoutFor(100, 1.96), 196);
  assert.equal(payoutFor(33, 1.96), 64); // 64.68 floored
  assert.equal(payoutFor(1, 0.5), 0);
});

test('slots pays its declared RTP exactly', () => {
  const total = SYMBOLS.reduce((sum, entry) => sum + entry.weight, 0);
  let expected = 0;

  for (const a of SYMBOLS) {
    for (const b of SYMBOLS) {
      for (const c of SYMBOLS) {
        const probability = (a.weight * b.weight * c.weight) / total ** 3;
        const { multiplier } = evaluateSpin([a.symbol, b.symbol, c.symbol]);
        expected += probability * multiplier;
      }
    }
  }

  assert.ok(
    Math.abs(expected - slots.rtp) < 0.0001,
    `declared RTP ${slots.rtp} but paytable returns ${expected.toFixed(6)}`,
  );
});

test('roulette pays its declared RTP for every bet type', () => {
  for (const [betType, meta] of Object.entries(roulette.config.betTypes)) {
    const values = meta.needsValue
      ? betType === 'straight'
        ? Array.from({ length: 37 }, (_, i) => i)
        : [1, 2, 3]
      : [undefined];

    for (const value of values) {
      const selection = roulette.validateSelection({ betType, value });
      let returned = 0;
      for (let pocket = 0; pocket < 37; pocket += 1) {
        // Drive the wheel to a known pocket instead of sampling.
        const nextFloat = () => pocket / 37 + 1 / 74;
        returned += roulette.play({ nextFloat, betCents: 10_000, selection }).payoutCents;
      }
      const rtp = returned / (37 * 10_000);
      assert.ok(
        Math.abs(rtp - roulette.rtp) < 0.0001,
        `${betType}${value === undefined ? '' : ` ${value}`} returns ${rtp.toFixed(6)}`,
      );
    }
  }
});

test('dice keeps a 1% house edge across the target range', () => {
  for (let target = 2; target <= 98; target += 1) {
    const multiplier = multiplierForTarget(target);
    const rtp = (target / 100) * multiplier;
    assert.ok(rtp <= dice.rtp + 0.0001, `target ${target} returns ${rtp.toFixed(4)}`);
    assert.ok(rtp > dice.rtp - 0.02, `target ${target} returns only ${rtp.toFixed(4)}`);
  }
});

test('dice wins strictly below the target', () => {
  const selection = dice.validateSelection({ target: 50 });
  const justUnder = dice.play({ nextFloat: () => 0.4999, betCents: 1000, selection });
  const exactlyOn = dice.play({ nextFloat: () => 0.5, betCents: 1000, selection });
  assert.equal(justUnder.outcome.won, true);
  assert.equal(exactlyOn.outcome.won, false);
  assert.equal(exactlyOn.payoutCents, 0);
});

test('coinflip returns 98% over both outcomes', () => {
  const selection = coinflip.validateSelection({ side: 'heads' });
  const win = coinflip.play({ nextFloat: () => 0.1, betCents: 10_000, selection });
  const lose = coinflip.play({ nextFloat: () => 0.9, betCents: 10_000, selection });
  assert.equal((win.payoutCents + lose.payoutCents) / 20_000, coinflip.rtp);
});

test('selections are validated, not trusted', () => {
  assert.throws(() => coinflip.validateSelection({ side: 'edge' }));
  assert.throws(() => dice.validateSelection({ target: 0 }));
  assert.throws(() => dice.validateSelection({ target: 50.5 }));
  assert.throws(() => roulette.validateSelection({ betType: 'straight', value: 37 }));
  assert.throws(() => roulette.validateSelection({ betType: 'nonsense' }));
});
