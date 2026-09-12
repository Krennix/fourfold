import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getStoredSession, useAuth } from './AuthContext';
import type { LmsAssignment } from '../types/lms';

export type CanvasStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CanvasContextValue {
  status: CanvasStatus;
  baseUrl: string | null;
  hasToken: boolean;
  assignments: LmsAssignment[];
  error: string | null;
  saveCredentials: (baseUrl: string, token: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

const ENDPOINT = '/api/lms?action=canvas';

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

export function CanvasProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const [status, setStatus] = useState<CanvasStatus>('idle');
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [assignments, setAssignments] = useState<LmsAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const res = await authedFetch(ENDPOINT, { method: 'GET' }, handleSessionExpired);
      if (!res) return;
      const body = await res.json();
      setBaseUrl(body.baseUrl ?? null);
      setHasToken(body.hasToken ?? false);
      setAssignments(body.assignments ?? []);
      setError(body.error ?? null);
      setStatus('ready');
    } catch {
      setStatus('error');
      setError('Could not load Canvas assignments.');
    }
  }, [handleSessionExpired]);

  const saveCredentials = useCallback(
    async (nextBaseUrl: string, token: string) => {
      setStatus('loading');
      setError(null);
      try {
        const res = await authedFetch(
          ENDPOINT,
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl: nextBaseUrl, token }) },
          handleSessionExpired,
        );
        if (!res) return;
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? 'Could not save those credentials.');
          setStatus('error');
          return;
        }
        setBaseUrl(body.baseUrl ?? null);
        setHasToken(body.hasToken ?? false);
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
    <CanvasContext.Provider value={{ status, baseUrl, hasToken, assignments, error, saveCredentials, refresh }}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvas() {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used within a CanvasProvider');
  return ctx;
}
