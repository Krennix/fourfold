import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const AUTH_KEY = 'fourfold.auth.session';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface StoredSession {
  email: string;
  token: string;
}

export function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.email === 'string' && typeof parsed?.token === 'string') return parsed;
  } catch {
    // ignore malformed/unavailable storage
  }
  return null;
}

export type AuthStatus = 'locked' | 'verifying' | 'unlocked' | 'denied';

interface AuthContextValue {
  status: AuthStatus;
  email: string | null;
  error: string | null;
  clientId: string | undefined;
  handleCredential: (idToken: string) => Promise<void>;
  handlePin: (email: string, pin: string) => Promise<void>;
  logout: () => void;
  /** Called by remote-data hooks when a request comes back 401 (session expired/revoked). */
  handleSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = getStoredSession();
  const [status, setStatus] = useState<AuthStatus>(initial ? 'unlocked' : 'locked');
  const [email, setEmail] = useState<string | null>(initial?.email ?? null);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      // ignore
    }
  }, []);

  const applySessionResponse = useCallback(async (res: Response) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(res.status === 403 ? 'denied' : 'locked');
      setError(body.error ?? 'Sign-in failed.');
      return;
    }
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ email: body.email, token: body.token }));
    } catch {
      // storage unavailable — they'll just need to sign in again next visit
    }
    setEmail(body.email);
    setStatus('unlocked');
  }, []);

  const handleCredential = useCallback(async (idToken: string) => {
    setStatus('verifying');
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      await applySessionResponse(res);
    } catch {
      setStatus('locked');
      setError('Could not reach the sign-in server. Try again.');
    }
  }, [applySessionResponse]);

  const handlePin = useCallback(async (pinEmail: string, pin: string) => {
    setStatus('verifying');
    setError(null);
    try {
      const res = await fetch('/api/pinSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pinEmail, pin }),
      });
      await applySessionResponse(res);
    } catch {
      setStatus('locked');
      setError('Could not reach the sign-in server. Try again.');
    }
  }, [applySessionResponse]);

  const logout = useCallback(() => {
    clearSession();
    window.google?.accounts.id.disableAutoSelect();
    setEmail(null);
    setError(null);
    setStatus('locked');
  }, [clearSession]);

  const handleSessionExpired = useCallback(() => {
    clearSession();
    setEmail(null);
    setError('Your session expired — sign in again.');
    setStatus('locked');
  }, [clearSession]);

  useEffect(() => {
    // Cross-tab logout/expiry.
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_KEY && !e.newValue) {
        setEmail(null);
        setStatus('locked');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({ status, email, error, clientId: CLIENT_ID, handleCredential, handlePin, logout, handleSessionExpired }),
    [status, email, error, handleCredential, handlePin, logout, handleSessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
