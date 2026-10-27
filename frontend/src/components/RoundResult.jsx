import { formatCents } from '../lib/format.js';

/** Human-readable summary of whatever the game engine returned. */
function describe(game, outcome) {
  switch (game) {
    case 'coinflip':
      return `The coin landed ${outcome.landed}.`;
    case 'dice':
      return `Rolled ${outcome.roll.toFixed(2)} against a target of ${outcome.target}.`;
    case 'roulette':
      return `The ball settled in ${outcome.pocket} (${outcome.color}).`;
    case 'slots':
      return `${outcome.spin.join(' · ')}${outcome.line === 'none' ? '' : ` — ${outcome.line}`}`;
    default:
      return JSON.stringify(outcome);
  }
}

export default function RoundResult({ round }) {
  if (!round) return null;
  const won = round.payoutCents > 0;

  return (
    <div className={`result ${won ? 'win' : 'loss'}`} role="status" aria-live="polite">
      <p className="headline">
        {won ? `You won ${formatCents(round.payoutCents)}` : `No win — ${formatCents(round.betCents)} staked`}
      </p>
      <p>{describe(round.game, round.outcome)}</p>
      <p className="muted small">
        Round {round.roundId.slice(0, 8)} · nonce {round.fairness.nonce} · balance {formatCents(round.balanceCents)}
      </p>
    </div>
  );
}
