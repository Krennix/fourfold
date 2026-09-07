import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const AUTH_KEY = 'fourfold.auth.email';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// Gmail ignores dots and anything after "+" in the local part, so two emails
// that look different can be the same inbox. Normalize on that basis so the
// allowlist doesn't reject someone over a typo'd or missing dot.
function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const [local, domain] = email.split('@');
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return email;
  return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
}

const ALLOWED_EMAILS = ((import.meta.env.VITE_ALLOWED_EMAILS as string | undefined) ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)
  .map(normalizeEmail);

export type AuthStatus = 'unconfigured' | 'locked' | 'verifying' | 'unlocked' | 'denied';

interface AuthContextValue {
  status: AuthStatus;
  email: string | null;
  error: string | null;
  clientId: string | undefined;
  handleCredential: (idToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function verifyIdToken(idToken: string): Promise<{ email: string; email_verified: string; aud: string }> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw new Error('Could not verify sign-in with Google.');
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(CLIENT_ID ? 'locked' : 'unconfigured');
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(AUTH_KEY);
    } catch {
      // storage unavailable
    }
    if (stored && ALLOWED_EMAILS.includes(normalizeEmail(stored))) {
      setEmail(stored);
      setStatus('unlocked');
    }
  }, []);

  const handleCredential = useCallback(async (idToken: string) => {
    setStatus('verifying');
    setError(null);
    try {
      const info = await verifyIdToken(idToken);
      if (info.aud !== CLIENT_ID || info.email_verified !== 'true') {
        throw new Error('That sign-in could not be verified.');
      }
      if (!ALLOWED_EMAILS.includes(normalizeEmail(info.email))) {
        setStatus('denied');
        setError(`${info.email} isn't on the access list for this app.`);
        return;
      }
      try {
        localStorage.setItem(AUTH_KEY, info.email);
      } catch {
        // storage unavailable — they'll just need to sign in again next visit
      }
      setEmail(info.email);
      setStatus('unlocked');
    } catch (e) {
      setStatus('locked');
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    }
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      // ignore
    }
    window.google?.accounts.id.disableAutoSelect();
    setEmail(null);
    setError(null);
    setStatus(CLIENT_ID ? 'locked' : 'unconfigured');
  }, []);

  const value = useMemo(
    () => ({ status, email, error, clientId: CLIENT_ID, handleCredential, logout }),
    [status, email, error, handleCredential, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
