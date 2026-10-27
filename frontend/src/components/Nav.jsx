import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { subscribeToBalance } from '../lib/balance-events.js';
import { formatCents } from '../lib/format.js';
import { useSession } from '../lib/session.jsx';

export default function Nav() {
  const { user, request, logout } = useSession();
  const [balance, setBalance] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    request('/api/wallet/balance')
      .then((data) => {
        if (!cancelled) setBalance(data.balanceCents);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-read the balance whenever the route changes, so it is never stale.
  }, [user, location.pathname, request]);

  // Rounds and deposits publish the new balance as they settle.
  useEffect(() => subscribeToBalance(setBalance), []);

  return (
    <header className="nav">
      <Link to="/" className="brand">
        <span aria-hidden="true">♠</span> Royal Reels
      </Link>

      <nav className="nav-links">
        <Link to="/">Lobby</Link>
        {user && <Link to="/wallet">Wallet</Link>}
        {user && <Link to="/fairness">Fairness</Link>}
      </nav>

      <div className="nav-account">
        {user ? (
          <>
            <span className="balance" title="Available balance">
              {balance === null ? '—' : formatCents(balance)}
            </span>
            <span className="who">{user.displayName}</span>
            <button
              type="button"
              className="ghost"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <Link className="button" to="/sign-in">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
