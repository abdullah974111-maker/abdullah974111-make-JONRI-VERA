import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';

export default function SignIn() {
  const { user, login, register } = useSession();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login({ email: form.email, password: form.password });
      } else {
        await register(form);
      }
      navigate('/');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel narrow">
      <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>

      <form onSubmit={submit} className="form">
        {mode === 'register' && (
          <label>
            Display name
            <input value={form.displayName} onChange={update('displayName')} minLength={2} maxLength={40} required />
          </label>
        )}

        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} required autoComplete="email" />
        </label>

        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={update('password')}
            minLength={mode === 'register' ? 12 : 1}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {mode === 'register' && <small>At least 12 characters.</small>}
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button type="button" className="ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
        {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
      </button>
    </section>
  );
}
