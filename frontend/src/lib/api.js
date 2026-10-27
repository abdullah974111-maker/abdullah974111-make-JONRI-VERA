const API_URL =
  import.meta.env.REACT_APP_API_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export const WS_URL =
  import.meta.env.REACT_APP_WS_URL ?? import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001';

const STORAGE_KEY = 'royal-reels-session';

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing: the session simply does not survive a reload.
  }
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function send(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(response.status, error.code ?? 'request_failed', error.message ?? 'Request failed', error.details);
  }
  return payload;
}

/**
 * Calls the API with the current access token, retrying once through the
 * refresh token when the access token has expired.
 */
export async function apiFetch(path, options = {}, session, onSession) {
  try {
    return await send(path, { ...options, token: session?.accessToken });
  } catch (error) {
    const expired = error instanceof ApiError && error.status === 401 && session?.refreshToken;
    if (!expired) throw error;

    const refreshed = await send('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
    }).catch(() => null);

    if (!refreshed) {
      onSession?.(null);
      throw error;
    }

    const next = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      user: refreshed.user,
    };
    onSession?.(next);
    return send(path, { ...options, token: next.accessToken });
  }
}

export const publicApi = {
  games: () => send('/api/games'),
  login: (body) => send('/api/auth/login', { method: 'POST', body }),
  register: (body) => send('/api/auth/register', { method: 'POST', body }),
  verifyRound: (body) => send('/api/games/fairness/verify', { method: 'POST', body }),
};
