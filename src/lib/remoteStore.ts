import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredSession } from '../state/AuthContext';

export type RemoteNamespace = 'school' | 'habits' | 'matrix' | 'countdowns' | 'agentChat' | 'dailyPlan' | 'watchdogDismissed' | 'friends' | 'calendar' | 'calendarMeta';

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

/** `undefined` = the request failed (offline, server error) — distinct from `null` (no data yet). */
async function fetchRemote<T>(ns: RemoteNamespace, onExpired: () => void): Promise<T | null | undefined> {
  try {
    const res = await authedFetch(`/api/data?ns=${ns}`, { method: 'GET' }, onExpired);
    if (!res) return null;
    if (!res.ok) return undefined;
    const body = await res.json();
    return (body.value ?? null) as T | null;
  } catch {
    return undefined;
  }
}

async function saveRemote<T>(ns: RemoteNamespace, value: T, onExpired: () => void): Promise<boolean> {
  try {
    const res = await authedFetch(
      `/api/data?ns=${ns}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) },
      onExpired,
    );
    return !!res?.ok;
  } catch {
    return false;
  }
}

// ── global sync status (drives the "Saved / Saving… / Offline" indicator) ─────────────────
export type SyncStatus = 'idle' | 'saving' | 'error';
const pendingSaves = new Set<RemoteNamespace>();
const failedNamespaces = new Set<RemoteNamespace>();
const syncListeners = new Set<() => void>();
let lastSavedAt: number | null = null;

function emitSync() {
  for (const l of syncListeners) l();
}

export function getSyncSnapshot(): { status: SyncStatus; lastSavedAt: number | null } {
  return {
    status: pendingSaves.size > 0 ? 'saving' : failedNamespaces.size > 0 ? 'error' : 'idle',
    lastSavedAt,
  };
}

export function subscribeSync(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
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
  legacyKey?: string | (() => T | null),
): [T, (updater: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValueState] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<T>(initial);
  const dirtyBeforeLoad = useRef(false);
  /** Bumped on every local edit, so an in-flight refresh never clobbers a newer change. */
  const editSeq = useRef(0);

  const flushSave = useCallback(
    async (next: T, attempt = 0) => {
      pendingSaves.add(namespace);
      emitSync();
      const ok = await saveRemote(namespace, next, onExpired);
      // A newer edit may have been queued while this one was in flight; let that one report.
      if (latest.current !== next) return;
      pendingSaves.delete(namespace);
      if (ok) {
        failedNamespaces.delete(namespace);
        lastSavedAt = Date.now();
      } else {
        failedNamespaces.add(namespace);
        if (attempt < 5) {
          saveTimer.current = setTimeout(() => void flushSave(latest.current, attempt + 1), 2000 * 2 ** attempt);
        }
      }
      emitSync();
    },
    [namespace, onExpired],
  );

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const load = (attempt: number) => {
      fetchRemote<T>(namespace, onExpired).then((remote) => {
        if (cancelled) return;
        if (remote === undefined) {
          // Couldn't reach storage. Never treat that as "no data yet" — saving now would
          // overwrite the user's real cloud data with defaults. Retry instead.
          failedNamespaces.add(namespace);
          emitSync();
          retryTimer = setTimeout(() => load(attempt + 1), Math.min(30000, 1500 * 2 ** attempt));
          return;
        }
        failedNamespaces.delete(namespace);
        emitSync();
        if (remote !== null) {
          // Edits made while offline-before-load are discarded in favour of the stored copy.
          latest.current = remote;
          setValueState(remote);
        } else {
          const legacy = typeof legacyKey === 'function' ? legacyKey() : legacyKey ? readLegacyLocalValue<T>(legacyKey) : null;
          if (legacy !== null) {
            latest.current = legacy;
            setValueState(legacy);
            void flushSave(legacy);
          } else if (dirtyBeforeLoad.current) {
            void flushSave(latest.current);
          }
        }
        loadedRef.current = true;
        setLoaded(true);
      });
    };
    load(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace]);

  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const next = typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;
        latest.current = next;
        editSeq.current++;
        if (!loadedRef.current) {
          dirtyBeforeLoad.current = true;
          return next;
        }
        if (saveTimer.current) clearTimeout(saveTimer.current);
        pendingSaves.add(namespace);
        emitSync();
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          void flushSave(next);
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [namespace, flushSave],
  );

  // Pick up changes made elsewhere (another device, the public API, an assistant run) when the tab
  // regains focus and once a minute while visible — but only when this tab has nothing unsaved,
  // so a refresh can never overwrite or be overwritten by an edit in progress.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !loadedRef.current) return;
      if (saveTimer.current || pendingSaves.has(namespace)) return;
      const seq = editSeq.current;
      void fetchRemote<T>(namespace, onExpired).then((remote) => {
        if (remote == null || seq !== editSeq.current || saveTimer.current || pendingSaves.has(namespace)) return;
        if (JSON.stringify(remote) === JSON.stringify(latest.current)) return;
        latest.current = remote;
        setValueState(remote);
      });
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, [namespace, onExpired]);

  useEffect(() => {
    // Flush a pending debounced save if the tab is being hidden/closed.
    const onHide = () => {
      if (document.visibilityState === 'hidden' && saveTimer.current && loadedRef.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void flushSave(latest.current);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flushSave]);

  return [value, setValue, loaded];
}
