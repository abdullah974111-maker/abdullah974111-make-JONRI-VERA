import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LiveFeed from '../components/LiveFeed.jsx';
import { publicApi } from '../lib/api.js';
import { formatCents } from '../lib/format.js';
import { useSession } from '../lib/session.jsx';

export default function Lobby() {
  const { user } = useSession();
  const [games, setGames] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    publicApi
      .games()
      .then((data) => setGames(data.games))
      .catch((requestError) => setError(requestError.message));
  }, []);

  return (
    <>
      <section className="hero">
        <h1>The floor is open</h1>
        <p>
          Every round is decided server-side from a seed we commit to before you bet, and every
          result can be replayed from the Fairness page.
        </p>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="lobby">
        <section>
          <h2>Games</h2>
          <ul className="game-grid">
            {games.map((game) => (
              <li key={game.slug} className="game-card">
                <h3>{game.name}</h3>
                <dl>
                  <div>
                    <dt>Return to player</dt>
                    <dd>{(Number(game.rtp) * 100).toFixed(2)}%</dd>
                  </div>
                  <div>
                    <dt>Stakes</dt>
                    <dd>
                      {formatCents(game.min_bet_cents)} – {formatCents(game.max_bet_cents)}
                    </dd>
                  </div>
                </dl>
                {user ? (
                  <Link className="button" to={`/play/${game.slug}`}>
                    Play {game.name}
                  </Link>
                ) : (
                  <Link className="button" to="/sign-in">
                    Sign in to play
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>

        <LiveFeed />
      </div>
    </>
  );
}
