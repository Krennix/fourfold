import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getStoredSession, useAuth } from './AuthContext';
import type { LmsAssignment } from '../types/lms';

/** Kept as an alias for the pre-multi-provider name — homeworkMerge.ts and agentClient.ts import
 * this type name for what is now the shared cross-provider assignment shape. */
export type SchoologyAssignment = LmsAssignment;

export type SchoologyStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SchoologyContextValue {
  status: SchoologyStatus;
  icsUrl: string | null;
  /** Whether a personal Schoology API key/secret is saved — when set (and the server has app
   * credentials configured), assignments come from the API and include points. */
  hasApiKey: boolean;
  assignments: SchoologyAssignment[];
  error: string | null;
  saveIcsUrl: (url: string) => Promise<void>;
  saveApiCredentials: (apiKey: string, apiSecret: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const SchoologyContext = createContext<SchoologyContextValue | null>(null);

const ENDPOINT = '/api/lms?action=schoology';

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
  const [hasApiKey, setHasApiKey] = useState(false);
  const [assignments, setAssignments] = useState<SchoologyAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const res = await authedFetch(ENDPOINT, { method: 'GET' }, handleSessionExpired);
      if (!res) return;
      const body = await res.json();
      setIcsUrl(body.icsUrl ?? null);
      setHasApiKey(body.hasApiKey ?? false);
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
          ENDPOINT,
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
        setHasApiKey(body.hasApiKey ?? false);
        setAssignments(body.assignments ?? []);
        setStatus('ready');
      } catch {
        setStatus('error');
        setError('Could not save that feed.');
      }
    },
    [handleSessionExpired],
  );

  const saveApiCredentials = useCallback(
    async (apiKey: string, apiSecret: string) => {
      setStatus('loading');
      setError(null);
      try {
        const res = await authedFetch(
          ENDPOINT,
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey, apiSecret }) },
          handleSessionExpired,
        );
        if (!res) return;
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? 'Could not save those credentials.');
          setStatus('error');
          return;
        }
        setIcsUrl(body.icsUrl ?? null);
        setHasApiKey(body.hasApiKey ?? false);
        setAssignments(body.assignments ?? []);
        setStatus('ready');
      } catch {
        setStatus('error');
        setError('Could not save those credentials.');
      }
    },
    [handleSessionExpired],
  );

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SchoologyContext.Provider value={{ status, icsUrl, hasApiKey, assignments, error, saveIcsUrl, saveApiCredentials, refresh }}>
      {children}
    </SchoologyContext.Provider>
  );
}

export function useSchoology() {
  const ctx = useContext(SchoologyContext);
  if (!ctx) throw new Error('useSchoology must be used within a SchoologyProvider');
  return ctx;
}
