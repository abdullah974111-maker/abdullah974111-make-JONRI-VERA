import { useCallback, useEffect, useState } from 'react';
import { publicApi } from '../lib/api.js';
import { formatCents } from '../lib/format.js';
import { useSession } from '../lib/session.jsx';

/**
 * Provably fair tools. The server publishes the hash of its seed before any
 * round; rotating the seed reveals the old one so past rounds can be replayed.
 */
export default function Fairness() {
  const { request } = useSession();
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [verification, setVerification] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const [fairness, history] = await Promise.all([
      request('/api/games/fairness/current'),
      request('/api/games/rounds/history?limit=10'),
    ]);
    setCurrent(fairness.fairness);
    setRounds(history.rounds);
  }, [request]);

  useEffect(() => {
    load().catch((requestError) => setError(requestError.message));
  }, [load]);

  async function rotate() {
    setError(null);
    try {
      const result = await request('/api/games/fairness/rotate', { method: 'POST', body: {} });
      setRevealed(result.revealed);
      setCurrent(result.current);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function verify(round) {
    setError(null);
    setVerification(null);
    if (!revealed) {
      setError('Rotate your seed first — the server seed is only revealed once it is retired.');
      return;
    }
    try {
      const result = await publicApi.verifyRound({
        game: round.game,
        serverSeed: revealed.serverSeed,
        clientSeed: round.client_seed,
        nonce: Number(round.nonce),
        betCents: round.bet_cents,
        selection: round.selection,
      });
      setVerification({ roundId: round.id, ...result });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <section className="panel">
      <h1>Provably fair</h1>
      <p>
        Before your first bet we commit to a secret server seed by publishing its SHA-256 hash.
        Each round mixes that seed with your client seed and a counter. Rotate the seed to reveal
        it, then replay any past round and check it against what we recorded.
      </p>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="callout">
        <h2>Current commitment</h2>
        {current ? (
          <dl className="kv">
            <div>
              <dt>Server seed hash</dt>
              <dd><code>{current.serverSeedHash}</code></dd>
            </div>
            <div>
              <dt>Client seed</dt>
              <dd><code>{current.clientSeed}</code></dd>
            </div>
            <div>
              <dt>Rounds played on this seed</dt>
              <dd>{current.nonce}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">Loading…</p>
        )}
        <button type="button" onClick={rotate}>
          Reveal and rotate seed
        </button>
      </section>

      {revealed && (
        <section className="callout">
          <h2>Revealed seed</h2>
          <dl className="kv">
            <div>
              <dt>Server seed</dt>
              <dd><code>{revealed.serverSeed}</code></dd>
            </div>
            <div>
              <dt>Committed hash</dt>
              <dd><code>{revealed.serverSeedHash}</code></dd>
            </div>
          </dl>
          <p className="muted small">
            Check it yourself: <code>echo -n {revealed.serverSeed} | sha256sum</code> must equal the hash above.
          </p>
        </section>
      )}

      <section>
        <h2>Your recent rounds</h2>
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">Game</th>
              <th scope="col">Stake</th>
              <th scope="col">Return</th>
              <th scope="col">Nonce</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {rounds.map((round) => (
              <tr key={round.id}>
                <td>{round.game}</td>
                <td>{formatCents(round.bet_cents)}</td>
                <td className={round.payout_cents > 0 ? 'win' : 'loss'}>{formatCents(round.payout_cents)}</td>
                <td>{round.nonce}</td>
                <td>
                  <button type="button" className="ghost" onClick={() => verify(round)}>
                    Verify
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {verification && (
        <section className={`callout ${verification.matchesRecord ? 'ok' : 'warn'}`} role="status">
          <h2>{verification.matchesRecord ? 'Result confirmed' : 'Result did not match'}</h2>
          <p>
            Replaying round {verification.roundId.slice(0, 8)} from the revealed seed produced a payout of{' '}
            {formatCents(verification.recomputed.payoutCents)}.
          </p>
          <pre>{JSON.stringify(verification.recomputed.outcome, null, 2)}</pre>
        </section>
      )}
    </section>
  );
}
