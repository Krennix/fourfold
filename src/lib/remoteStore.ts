import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredSession } from '../state/AuthContext';

export type RemoteNamespace = 'school' | 'habits' | 'matrix' | 'countdowns' | 'agentChat' | 'dailyPlan' | 'watchdogDismissed';

const SAVE_DEBOUNCE_MS = 600;

async function authedFetch(path: string, init: RequestInit, onExpired: () => void): Promise<Response | null> {
  const session = getStoredSession();
  if (!session) {
    onExpired();
    return null;
  }
  const res = await fetch(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${session.token}` },
  });
  if (res.status === 401) {
    onExpired();
    return null;
  }
  return res;
}

async function fetchRemote<T>(ns: RemoteNamespace, onExpired: () => void): Promise<T | null> {
  try {
    const res = await authedFetch(`/api/data?ns=${ns}`, { method: 'GET' }, onExpired);
    if (!res || !res.ok) return null;
    const body = await res.json();
    return (body.value ?? null) as T | null;
  } catch {
    return null;
  }
}

async function saveRemote<T>(ns: RemoteNamespace, value: T, onExpired: () => void): Promise<void> {
  try {
    await authedFetch(
      `/api/data?ns=${ns}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) },
      onExpired,
    );
  } catch {
    // best-effort — a later edit will retry the save with fresher data
  }
}

function readLegacyLocalValue<T>(legacyKey: string): T | null {
  try {
    const raw = localStorage.getItem(legacyKey);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // ignore malformed/unavailable storage
  }
  return null;
}

/**
 * Drop-in replacement for `useState(initial)` that syncs the value to the
 * signed-in user's cloud storage: loads the remote value on mount (falling
 * back to `initial` for a brand-new user) and debounce-saves on every change.
 *
 * If `legacyKey` is given and the user has no remote data yet, this does a
 * one-time import from that pre-login localStorage key (the old on-device
 * storage this replaced) and pushes it up as the user's first remote save.
 */
export function useRemoteState<T>(
  namespace: RemoteNamespace,
  initial: T,
  onExpired: () => void,
  legacyKey?: string,
): [T, (updater: T | ((prev: T) => T)) => void] {
  const [value, setValueState] = useState<T>(initial);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRemote<T>(namespace, onExpired).then((remote) => {
      if (cancelled) return;
      if (remote !== null) {
        setValueState(remote);
        return;
      }
      const legacy = legacyKey ? readLegacyLocalValue<T>(legacyKey) : null;
      if (legacy !== null) {
        setValueState(legacy);
        void saveRemote(namespace, legacy, onExpired);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace]);

  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const next = typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void saveRemote(namespace, next, onExpired);
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [namespace, onExpired],
  );

  return [value, setValue];
}
