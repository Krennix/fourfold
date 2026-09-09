import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  dropTokenClient,
  fetchPrimaryCalendarEmail,
  getTokenClient,
  revokeToken,
} from '../lib/googleCalendar';
import { getStoredSession } from './AuthContext';

const LINKED_EMAILS_KEY = 'fourfold.google.linkedEmails.v1';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export interface LinkedCalendar {
  id: string;
  summary: string;
  color: string;
  selected: boolean;
}

export interface LinkedAccount {
  email: string;
  accessToken: string | null;
  status: 'connecting' | 'signed-in' | 'error';
  error: string | null;
  calendars: LinkedCalendar[];
}

export interface PendingPicker {
  email: string;
  accessToken: string;
}

interface GoogleAuthContextValue {
  /** Whether Google sync is usable at all (a client id is configured) — independent of any one account's state. */
  status: 'unconfigured' | 'ready';
  accounts: LinkedAccount[];
  connecting: boolean;
  connectError: string | null;
  connectNewAccount: () => void;
  reconnectAccount: (email: string) => void;
  disconnectAccount: (email: string) => void;
  getAccessToken: (email: string) => string | null;
  /** Set right after a new account finishes OAuth, so Settings can show the calendar picker for it. */
  pendingPicker: PendingPicker | null;
  dismissPendingPicker: () => void;
  updateAccountCalendars: (email: string, calendars: LinkedCalendar[]) => void;
}

const GoogleAuthContext = createContext<GoogleAuthContextValue | null>(null);

function loadLinkedEmails(): string[] {
  try {
    const raw = localStorage.getItem(LINKED_EMAILS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed/unavailable storage
  }
  return [];
}

function saveLinkedEmails(emails: string[]) {
  try {
    localStorage.setItem(LINKED_EMAILS_KEY, JSON.stringify(emails));
  } catch {
    // storage unavailable — silent reauth just won't have anything to try next load
  }
}

async function persistLinkedCalendars(accounts: LinkedAccount[]) {
  const session = getStoredSession();
  if (!session) return;
  try {
    await fetch('/api/googleCalendars', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ accounts: accounts.map((a) => ({ email: a.email, calendars: a.calendars })) }),
    });
  } catch {
    // best-effort — local state still reflects the change for this session
  }
}

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [pendingPicker, setPendingPicker] = useState<PendingPicker | null>(null);
  const refreshTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearRefreshTimer = useCallback((email: string) => {
    const timer = refreshTimers.current.get(email);
    if (timer) {
      clearTimeout(timer);
      refreshTimers.current.delete(email);
    }
  }, []);

  const handleAccountError = useCallback((email: string, message: string) => {
    setAccounts((prev) => prev.map((a) => (a.email === email ? { ...a, status: 'error', error: message } : a)));
  }, []);

  // `scheduleRefresh` and `handleAccountToken` each need to call the other (a refresh, once it
  // succeeds, must schedule its own next refresh) — a ref breaks the circular `const` reference
  // rather than trying to order two mutually-recursive useCallbacks.
  const handleAccountTokenRef = useRef<(email: string, token: string, expiresInSeconds: number) => void>(() => {});

  const scheduleRefresh = useCallback(
    (email: string, expiresInSeconds: number) => {
      clearRefreshTimer(email);
      const refreshInMs = Math.max(0, (expiresInSeconds - 60) * 1000);
      const timer = setTimeout(() => {
        if (!CLIENT_ID) return;
        getTokenClient(
          email,
          CLIENT_ID,
          (token, expiresIn) => handleAccountTokenRef.current(email, token, expiresIn),
          (message) => handleAccountError(email, message),
        ).requestAccessToken({ prompt: '', hint: email });
      }, refreshInMs);
      refreshTimers.current.set(email, timer);
    },
    [clearRefreshTimer, handleAccountError],
  );

  const handleAccountToken = useCallback(
    (email: string, token: string, expiresInSeconds: number) => {
      setAccounts((prev) => {
        const idx = prev.findIndex((a) => a.email === email);
        const account: LinkedAccount = {
          email,
          accessToken: token,
          status: 'signed-in',
          error: null,
          calendars: idx >= 0 ? prev[idx].calendars : [],
        };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = account;
          return next;
        }
        return [...prev, account];
      });
      scheduleRefresh(email, expiresInSeconds);
    },
    [scheduleRefresh],
  );

  useEffect(() => {
    handleAccountTokenRef.current = handleAccountToken;
  }, [handleAccountToken]);

  const connectNewAccount = useCallback(() => {
    if (!CLIENT_ID) return;
    setConnectError(null);
    setConnecting(true);
    const onToken = (token: string, expiresInSeconds: number) => {
      setConnecting(false);
      fetchPrimaryCalendarEmail(token)
        .then((email) => {
          // Drop the temp-keyed client rather than rekeying it to `email` — it closes over this
          // one-time onToken (which opens the calendar picker), and a token client's callback
          // can't be rebound after creation, so reusing it would make every later silent refresh
          // for this account reopen the picker instead of just refreshing the token.
          dropTokenClient('new');
          handleAccountToken(email, token, expiresInSeconds);
          const emails = loadLinkedEmails();
          if (!emails.includes(email)) saveLinkedEmails([...emails, email]);
          setPendingPicker({ email, accessToken: token });
        })
        .catch(() => {
          dropTokenClient('new');
          setConnectError('Could not determine that account\'s email address.');
        });
    };
    const onError = (message: string) => {
      setConnecting(false);
      dropTokenClient('new');
      setConnectError(message);
    };
    getTokenClient('new', CLIENT_ID, onToken, onError).requestAccessToken({ prompt: 'select_account' });
  }, [handleAccountToken]);

  const reconnectAccount = useCallback(
    (email: string) => {
      if (!CLIENT_ID) return;
      setAccounts((prev) => prev.map((a) => (a.email === email ? { ...a, status: 'connecting', error: null } : a)));
      getTokenClient(
        email,
        CLIENT_ID,
        (token, expiresIn) => handleAccountToken(email, token, expiresIn),
        (message) => handleAccountError(email, message),
      ).requestAccessToken({ prompt: 'consent', hint: email });
    },
    [handleAccountToken, handleAccountError],
  );

  // `setAccounts` is called here with a plain value rather than an updater function, and the
  // side effects (revoke, persist) sit outside it — a functional updater runs twice under
  // StrictMode in dev, which would double-revoke the token and double-PUT the persisted state.
  const disconnectAccount = useCallback(
    (email: string) => {
      const account = accounts.find((a) => a.email === email);
      if (account?.accessToken) revokeToken(account.accessToken);
      const next = accounts.filter((a) => a.email !== email);
      setAccounts(next);
      void persistLinkedCalendars(next);
      dropTokenClient(email);
      clearRefreshTimer(email);
      saveLinkedEmails(loadLinkedEmails().filter((e) => e !== email));
      setPendingPicker((p) => (p?.email === email ? null : p));
    },
    [accounts, clearRefreshTimer],
  );

  const updateAccountCalendars = useCallback(
    (email: string, calendars: LinkedCalendar[]) => {
      const next = accounts.map((a) => (a.email === email ? { ...a, calendars } : a));
      setAccounts(next);
      void persistLinkedCalendars(next);
      setPendingPicker((p) => (p?.email === email ? null : p));
    },
    [accounts],
  );

  const getAccessToken = useCallback(
    (email: string) => accounts.find((a) => a.email === email)?.accessToken ?? null,
    [accounts],
  );

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    (async () => {
      const session = getStoredSession();
      let persisted: { email: string; calendars: LinkedCalendar[] }[] = [];
      if (session) {
        try {
          const res = await fetch('/api/googleCalendars', { headers: { Authorization: `Bearer ${session.token}` } });
          if (res.ok) {
            const body = await res.json();
            if (Array.isArray(body.accounts)) persisted = body.accounts;
          }
        } catch {
          // fall back to the localStorage list below
        }
      }
      let emails = persisted.map((a) => a.email);
      if (emails.length === 0) emails = loadLinkedEmails();
      if (cancelled || emails.length === 0) return;

      setAccounts(
        emails.map((email) => ({
          email,
          accessToken: null,
          status: 'connecting' as const,
          error: null,
          calendars: persisted.find((a) => a.email === email)?.calendars ?? [],
        })),
      );

      const trySilent = (email: string) => {
        if (cancelled) return;
        if (!window.google) {
          setTimeout(() => trySilent(email), 200);
          return;
        }
        getTokenClient(
          email,
          CLIENT_ID,
          (token, expiresIn) => handleAccountToken(email, token, expiresIn),
          (message) => handleAccountError(email, message),
        ).requestAccessToken({ prompt: '', hint: email });
      };
      emails.forEach(trySilent);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissPendingPicker = useCallback(() => setPendingPicker(null), []);

  return (
    <GoogleAuthContext.Provider
      value={{
        status: CLIENT_ID ? 'ready' : 'unconfigured',
        accounts,
        connecting,
        connectError,
        connectNewAccount,
        reconnectAccount,
        disconnectAccount,
        getAccessToken,
        pendingPicker,
        dismissPendingPicker,
        updateAccountCalendars,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function useGoogleAuth() {
  const ctx = useContext(GoogleAuthContext);
  if (!ctx) throw new Error('useGoogleAuth must be used within a GoogleAuthProvider');
  return ctx;
}
