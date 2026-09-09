import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getStoredSession, useAuth } from './AuthContext';

export interface GoogleIcsEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startISO: string;
  endISO: string;
  allDay: boolean;
}

export type GoogleIcsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface GoogleIcsContextValue {
  status: GoogleIcsStatus;
  icsUrl: string | null;
  events: GoogleIcsEvent[];
  error: string | null;
  saveIcsUrl: (url: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const GoogleIcsContext = createContext<GoogleIcsContextValue | null>(null);

async function authedFetch(path: string, init: RequestInit, onExpired: () => void): Promise<Response | null> {
  const session = getStoredSession();
  if (!session) {
    onExpired();
    return null;
  }
  const res = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${session.token}` } });
  if (res.status === 401) {
    onExpired();
    return null;
  }
  return res;
}

/**
 * Read-only backup for Google Calendar sync: a pasted "secret address in iCal format" feed,
 * fetched and merged into the calendar view as non-editable events. Independent of the OAuth
 * link in GoogleAuthContext — this keeps working even if that link is unconfigured or broken.
 */
export function GoogleIcsProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const [status, setStatus] = useState<GoogleIcsStatus>('idle');
  const [icsUrl, setIcsUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<GoogleIcsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const res = await authedFetch('/api/googleIcsFeed', { method: 'GET' }, handleSessionExpired);
      if (!res) return;
      const body = await res.json();
      setIcsUrl(body.icsUrl ?? null);
      setEvents(body.events ?? []);
      setError(body.error ?? null);
      setStatus('ready');
    } catch {
      setStatus('error');
      setError('Could not load the backup calendar feed.');
    }
  }, [handleSessionExpired]);

  const saveIcsUrl = useCallback(
    async (url: string) => {
      setStatus('loading');
      setError(null);
      try {
        const res = await authedFetch(
          '/api/googleIcsFeed',
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ icsUrl: url }) },
          handleSessionExpired,
        );
        if (!res) return;
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? 'Could not save that feed.');
          setStatus('error');
          return;
        }
        setIcsUrl(body.icsUrl ?? null);
        setEvents(body.events ?? []);
        setStatus('ready');
      } catch {
        setStatus('error');
        setError('Could not save that feed.');
      }
    },
    [handleSessionExpired],
  );

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GoogleIcsContext.Provider value={{ status, icsUrl, events, error, saveIcsUrl, refresh }}>
      {children}
    </GoogleIcsContext.Provider>
  );
}

export function useGoogleIcs() {
  const ctx = useContext(GoogleIcsContext);
  if (!ctx) throw new Error('useGoogleIcs must be used within a GoogleIcsProvider');
  return ctx;
}
