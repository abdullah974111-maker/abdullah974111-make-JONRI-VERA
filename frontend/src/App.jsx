import { Navigate, Route, Routes } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import { useSession } from './lib/session.jsx';
import Fairness from './pages/Fairness.jsx';
import GameRoom from './pages/GameRoom.jsx';
import Lobby from './pages/Lobby.jsx';
import SignIn from './pages/SignIn.jsx';
import Wallet from './pages/Wallet.jsx';

function RequireAuth({ children }) {
  const { user } = useSession();
  return user ? children : <Navigate to="/sign-in" replace />;
}

export default function App() {
  return (
    <div className="app">
      <Nav />
      <main className="content">
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route
            path="/play/:slug"
            element={
              <RequireAuth>
                <GameRoom />
              </RequireAuth>
            }
          />
          <Route
            path="/wallet"
            element={
              <RequireAuth>
                <Wallet />
              </RequireAuth>
            }
          />
          <Route
            path="/fairness"
            element={
              <RequireAuth>
                <Fairness />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <p>
          Play responsibly. Set deposit and loss limits in your wallet, or self-exclude at any time.
          Must be of legal gambling age in your jurisdiction.
        </p>
      </footer>
    </div>
  );
}
