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

export interface GoogleIcsFeed {
  id: string;
  label: string;
  url: string;
  events: GoogleIcsEvent[];
  error?: string;
}

export type GoogleIcsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface GoogleIcsContextValue {
  status: GoogleIcsStatus;
  feeds: GoogleIcsFeed[];
  /** All events across every feed, each tagged with which feed it came from. */
  events: (GoogleIcsEvent & { feedId: string; feedLabel: string })[];
  error: string | null;
  addFeed: (label: string, url: string) => Promise<void>;
  removeFeed: (id: string) => Promise<void>;
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
 * Read-only backup for Google Calendar sync: one or more pasted "secret address in iCal format"
 * feeds, fetched and merged into the calendar view. Independent of the OAuth link in
 * GoogleAuthContext — this keeps working even if that link is unconfigured or broken. Events
 * from these feeds can still be edited/hidden locally (see CalendarContext's ICS overrides) —
 * those tweaks just never write back to Google.
 */
export function GoogleIcsProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const [status, setStatus] = useState<GoogleIcsStatus>('idle');
  const [feeds, setFeeds] = useState<GoogleIcsFeed[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const res = await authedFetch('/api/googleIcsFeed', { method: 'GET' }, handleSessionExpired);
      if (!res) return;
      const body = await res.json();
      setFeeds(body.feeds ?? []);
      setStatus('ready');
    } catch {
      setStatus('error');
      setError('Could not load the backup calendar feeds.');
    }
  }, [handleSessionExpired]);

  const saveFeeds = useCallback(
    async (next: { id: string; label: string; url: string }[]) => {
      setStatus('loading');
      setError(null);
      try {
        const res = await authedFetch(
          '/api/googleIcsFeed',
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feeds: next }) },
          handleSessionExpired,
        );
        if (!res) return;
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? 'Could not save that feed.');
          setStatus('error');
          return;
        }
        setFeeds(body.feeds ?? []);
        setStatus('ready');
      } catch {
        setStatus('error');
        setError('Could not save that feed.');
      }
    },
    [handleSessionExpired],
  );

  const addFeed = useCallback(
    async (label: string, url: string) => {
      const id = crypto.randomUUID();
      await saveFeeds([...feeds.map((f) => ({ id: f.id, label: f.label, url: f.url })), { id, label, url }]);
    },
    [feeds, saveFeeds],
  );

  const removeFeed = useCallback(
    async (id: string) => {
      await saveFeeds(feeds.filter((f) => f.id !== id).map((f) => ({ id: f.id, label: f.label, url: f.url })));
    },
    [feeds, saveFeeds],
  );

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = feeds.flatMap((f) => f.events.map((e) => ({ ...e, feedId: f.id, feedLabel: f.label })));

  return (
    <GoogleIcsContext.Provider value={{ status, feeds, events, error, addFeed, removeFeed, refresh }}>
      {children}
    </GoogleIcsContext.Provider>
  );
}

export function useGoogleIcs() {
  const ctx = useContext(GoogleIcsContext);
  if (!ctx) throw new Error('useGoogleIcs must be used within a GoogleIcsProvider');
  return ctx;
}
