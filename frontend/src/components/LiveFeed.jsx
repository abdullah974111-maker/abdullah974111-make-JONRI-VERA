import { useEffect, useState } from 'react';
import { WS_URL } from '../lib/api.js';
import { formatCents, formatTime } from '../lib/format.js';
import { useSession } from '../lib/session.jsx';

/** Rolling feed of rounds settled across the floor. */
export default function LiveFeed() {
  const { session } = useSession();
  const [rounds, setRounds] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return undefined;

    const socket = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(session.accessToken)}`);
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.round) return;
      setRounds((current) => [{ ...message.round, own: message.type === 'round:own' }, ...current].slice(0, 12));
    };

    return () => socket.close();
  }, [session?.accessToken]);

  if (!session) return null;

  return (
    <section className="feed">
      <h2>
        Live floor <span className={connected ? 'dot on' : 'dot'} aria-label={connected ? 'connected' : 'offline'} />
      </h2>
      {rounds.length === 0 ? (
        <p className="muted">Waiting for the next round…</p>
      ) : (
        <ul>
          {rounds.map((round, index) => (
            <li key={`${round.at}-${index}`} className={round.own ? 'own' : undefined}>
              <span className="who">{round.player}</span>
              <span className="game">{round.game}</span>
              <span className={round.payoutCents > round.betCents ? 'win' : 'loss'}>
                {round.payoutCents > 0 ? `+${formatCents(round.payoutCents)}` : `−${formatCents(round.betCents)}`}
              </span>
              <span className="muted">{formatTime(round.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
