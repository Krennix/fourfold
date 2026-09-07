import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchPrimaryCalendarEmail, getTokenClient, revokeToken } from '../lib/googleCalendar';

const WAS_CONNECTED_KEY = 'fourfold.google.wasConnected';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export type GoogleAuthStatus = 'unconfigured' | 'signed-out' | 'connecting' | 'signed-in' | 'error';

interface GoogleAuthContextValue {
  status: GoogleAuthStatus;
  accessToken: string | null;
  email: string | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

const GoogleAuthContext = createContext<GoogleAuthContextValue | null>(null);

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GoogleAuthStatus>(CLIENT_ID ? 'signed-out' : 'unconfigured');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptedSilentAuth = useRef(false);

  const handleToken = useCallback((token: string, expiresInSeconds: number) => {
    setAccessToken(token);
    setStatus('signed-in');
    setError(null);
    try {
      localStorage.setItem(WAS_CONNECTED_KEY, 'true');
    } catch {
      // storage unavailable — reconnect will just require an extra click next time
    }
    fetchPrimaryCalendarEmail(token).then(setEmail).catch(() => setEmail(null));
    const refreshInMs = Math.max(0, (expiresInSeconds - 60) * 1000);
    const timer = setTimeout(() => {
      if (CLIENT_ID) getTokenClient(CLIENT_ID, handleToken, handleError).requestAccessToken({ prompt: '' });
    }, refreshInMs);
    return () => clearTimeout(timer);
  }, []);

  const handleError = useCallback((message: string) => {
    setStatus((prev) => (prev === 'connecting' ? 'error' : 'signed-out'));
    setError(message);
  }, []);

  const connect = useCallback(() => {
    if (!CLIENT_ID) return;
    setStatus('connecting');
    setError(null);
    getTokenClient(CLIENT_ID, handleToken, handleError).requestAccessToken({ prompt: 'consent' });
  }, [handleToken, handleError]);

  const disconnect = useCallback(() => {
    if (accessToken) revokeToken(accessToken);
    setAccessToken(null);
    setEmail(null);
    setStatus(CLIENT_ID ? 'signed-out' : 'unconfigured');
    try {
      localStorage.removeItem(WAS_CONNECTED_KEY);
    } catch {
      // ignore
    }
  }, [accessToken]);

  useEffect(() => {
    if (!CLIENT_ID || attemptedSilentAuth.current) return;
    let wasConnected = false;
    try {
      wasConnected = localStorage.getItem(WAS_CONNECTED_KEY) === 'true';
    } catch {
      // storage unavailable
    }
    if (!wasConnected) return;
    attemptedSilentAuth.current = true;
    const trySilent = () => {
      if (!window.google) {
        setTimeout(trySilent, 200);
        return;
      }
      getTokenClient(CLIENT_ID, handleToken, handleError).requestAccessToken({ prompt: '' });
    };
    trySilent();
  }, [handleToken, handleError]);

  return (
    <GoogleAuthContext.Provider value={{ status, accessToken, email, error, connect, disconnect }}>
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function useGoogleAuth() {
  const ctx = useContext(GoogleAuthContext);
  if (!ctx) throw new Error('useGoogleAuth must be used within a GoogleAuthProvider');
  return ctx;
}
