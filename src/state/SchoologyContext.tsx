import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getStoredSession, useAuth } from './AuthContext';

export interface SchoologyAssignment {
  uid: string;
  title: string;
  description: string | null;
  /** ISO 8601 due date/time. */
  due: string;
  allDay: boolean;
  /** Course/category names from the ICS CATEGORIES property, if present. */
  categories: string[];
  /** RFC 5545 PRIORITY (1-4 high, 5 normal, 6-9 low, 0/absent = none). */
  priority: number | null;
}

export type SchoologyStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SchoologyContextValue {
  status: SchoologyStatus;
  icsUrl: string | null;
  assignments: SchoologyAssignment[];
  error: string | null;
  saveIcsUrl: (url: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const SchoologyContext = createContext<SchoologyContextValue | null>(null);

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

export function SchoologyProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const [status, setStatus] = useState<SchoologyStatus>('idle');
  const [icsUrl, setIcsUrl] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<SchoologyAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const res = await authedFetch('/api/schoology', { method: 'GET' }, handleSessionExpired);
      if (!res) return;
      const body = await res.json();
      setIcsUrl(body.icsUrl ?? null);
      setAssignments(body.assignments ?? []);
      setError(body.error ?? null);
      setStatus('ready');
    } catch {
      setStatus('error');
      setError('Could not load Schoology assignments.');
    }
  }, [handleSessionExpired]);

  const saveIcsUrl = useCallback(
    async (url: string) => {
      setStatus('loading');
      setError(null);
      try {
        const res = await authedFetch(
          '/api/schoology',
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
        setAssignments(body.assignments ?? []);
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
    <SchoologyContext.Provider value={{ status, icsUrl, assignments, error, saveIcsUrl, refresh }}>
      {children}
    </SchoologyContext.Provider>
  );
}

export function useSchoology() {
  const ctx = useContext(SchoologyContext);
  if (!ctx) throw new Error('useSchoology must be used within a SchoologyProvider');
  return ctx;
}
