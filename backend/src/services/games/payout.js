/**
 * Converts a bet and a win multiplier into a payout in cents.
 * Always rounds down, so rounding can never pay out more than the odds allow.
 */
export function payoutFor(betCents, multiplier) {
  return Math.floor((betCents * Math.round(multiplier * 10_000)) / 10_000);
}
