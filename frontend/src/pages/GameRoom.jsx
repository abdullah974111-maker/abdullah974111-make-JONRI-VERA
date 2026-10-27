import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import GameControls from '../components/GameControls.jsx';
import RoundResult from '../components/RoundResult.jsx';
import { publishBalance } from '../lib/balance-events.js';
import { formatCents, parseDollarsToCents } from '../lib/format.js';
import { useSession } from '../lib/session.jsx';

const DEFAULT_SELECTION = {
  coinflip: { side: 'heads' },
  dice: { target: 50 },
  roulette: { betType: 'red' },
  slots: {},
};

export default function GameRoom() {
  const { slug } = useParams();
  const { request } = useSession();
  const [game, setGame] = useState(null);
  const [selection, setSelection] = useState(DEFAULT_SELECTION[slug] ?? {});
  const [stake, setStake] = useState('1.00');
  const [round, setRound] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelection(DEFAULT_SELECTION[slug] ?? {});
    setRound(null);
    request(`/api/games/${slug}`)
      .then((data) => setGame(data.game))
      .catch((requestError) => setError(requestError.message));
    request('/api/games/rounds/history?limit=10')
      .then((data) => setHistory(data.rounds))
      .catch(() => {});
  }, [slug, request]);

  async function play(event) {
    event.preventDefault();
    const betCents = parseDollarsToCents(stake);
    if (!Number.isFinite(betCents) || betCents <= 0) {
      setError('Enter a stake greater than zero.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const data = await request('/api/games/play', {
        method: 'POST',
        body: { game: slug, betCents, selection },
      });
      setRound(data.round);
      publishBalance(data.round.balanceCents);
      setHistory((current) => [
        {
          id: data.round.roundId,
          game: slug,
          bet_cents: data.round.betCents,
          payout_cents: data.round.payoutCents,
          created_at: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 10));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!game) {
    return <p className="muted">{error ?? 'Loading table…'}</p>;
  }

  return (
    <section className="table">
      <header>
        <h1>{game.name}</h1>
        <p className="muted">
          Returns {(Number(game.rtp) * 100).toFixed(2)}% · stakes {formatCents(game.min_bet_cents)} to{' '}
          {formatCents(game.max_bet_cents)}
        </p>
      </header>

      <form className="form" onSubmit={play}>
        <GameControls slug={slug} selection={selection} onChange={setSelection} config={game.config} />

        <label>
          Stake
          <input
            inputMode="decimal"
            value={stake}
            onChange={(event) => setStake(event.target.value)}
            aria-describedby="stake-range"
          />
          <small id="stake-range">
            Between {formatCents(game.min_bet_cents)} and {formatCents(game.max_bet_cents)}
          </small>
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy}>
          {busy ? 'Settling…' : `Bet ${stake}`}
        </button>
      </form>

      <RoundResult round={round} />

      <section>
        <h2>Your last rounds</h2>
        {history.length === 0 ? (
          <p className="muted">No rounds yet.</p>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Game</th>
                <th scope="col">Stake</th>
                <th scope="col">Return</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.game}</td>
                  <td>{formatCents(entry.bet_cents)}</td>
                  <td className={entry.payout_cents > 0 ? 'win' : 'loss'}>{formatCents(entry.payout_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link to="/fairness">Verify any of these rounds →</Link>
      </section>
    </section>
  );
}
