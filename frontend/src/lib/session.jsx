import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiFetch, loadSession, publicApi, saveSession } from './api.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSessionState] = useState(() => loadSession());

  const setSession = useCallback((next) => {
    saveSession(next);
    setSessionState(next);
  }, []);

  const value = useMemo(() => {
    const request = (path, options) => apiFetch(path, options, session, setSession);

    return {
      session,
      user: session?.user ?? null,
      request,
      async login(credentials) {
        const result = await publicApi.login(credentials);
        setSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
      },
      async register(details) {
        const result = await publicApi.register(details);
        setSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
      },
      async logout() {
        await request('/api/auth/logout', {
          method: 'POST',
          body: { refreshToken: session?.refreshToken },
        }).catch(() => {});
        setSession(null);
      },
      updateUser(user) {
        setSession({ ...session, user });
      },
    };
  }, [session, setSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}
