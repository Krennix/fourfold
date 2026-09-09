import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getStoredSession } from './AuthContext';

const LINKED_EMAILS_KEY = 'fourfold.google.linkedEmails.v1';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
/** Popup message payload from api/googleOAuthCallback.ts — kept in sync with that file. */
const OAUTH_MESSAGE_TYPE = 'fourfold-google-oauth';

export interface LinkedCalendar {
  id: string;
  summary: string;
  color: string;
  selected: boolean;
}

export interface LinkedAccount {
  email: string;
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
  /** Server-minted access token for an account, cached in-memory for its lifetime. Refreshed
   * from the stored server-side refresh token on demand — there is no client-side scheduling
   * timer, so this keeps working across reloads, sleep, and background tabs. */
  getAccessToken: (email: string, opts?: { force?: boolean }) => Promise<string | null>;
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
    // storage unavailable — just won't have a fallback list on next load
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

interface CachedToken {
  token: string;
  expiresAt: number;
}

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [pendingPicker, setPendingPicker] = useState<PendingPicker | null>(null);
  const tokenCache = useRef<Map<string, CachedToken>>(new Map());

  const handleAccountError = useCallback((email: string, message: string) => {
    setAccounts((prev) => prev.map((a) => (a.email === email ? { ...a, status: 'error', error: message } : a)));
  }, []);

  const getAccessToken = useCallback(async (email: string, opts?: { force?: boolean }): Promise<string | null> => {
    const cached = tokenCache.current.get(email);
    if (!opts?.force && cached && cached.expiresAt - 30_000 > Date.now()) return cached.token;

    const session = getStoredSession();
    if (!session) return null;
    try {
      const res = await fetch(`/api/googleAccessToken?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const body = await res.json();
      if (!res.ok) {
        handleAccountError(email, body.error ?? 'Could not refresh that account — reconnect it.');
        return null;
      }
      tokenCache.current.set(email, { token: body.accessToken, expiresAt: Date.now() + body.expiresInSeconds * 1000 });
      setAccounts((prev) =>
        prev.map((a) => (a.email === email && a.status !== 'signed-in' ? { ...a, status: 'signed-in', error: null } : a)),
      );
      return body.accessToken;
    } catch {
      handleAccountError(email, 'Could not reach the server to refresh that account.');
      return null;
    }
  }, [handleAccountError]);

  const openOAuthPopup = useCallback((hint: string | undefined, onDone: (result: { ok: true; email: string } | { ok: false; error: string }) => void) => {
    const session = getStoredSession();
    if (!session || !CLIENT_ID) return;
    setConnectError(null);
    setConnecting(true);

    const popup = window.open('about:blank', 'fourfold-google-oauth', 'width=520,height=680');
    if (!popup) {
      setConnecting(false);
      setConnectError('Your browser blocked the sign-in popup — allow popups for this site and try again.');
      return;
    }

    const finish = (result: { ok: true; email: string } | { ok: false; error: string }) => {
      window.removeEventListener('message', onMessage);
      clearInterval(pollClosed);
      setConnecting(false);
      onDone(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== OAUTH_MESSAGE_TYPE) return;
      if (event.data.ok) finish({ ok: true, email: event.data.email });
      else finish({ ok: false, error: event.data.error ?? 'Connection failed.' });
    };
    window.addEventListener('message', onMessage);

    const pollClosed = window.setInterval(() => {
      if (popup.closed) {
        window.removeEventListener('message', onMessage);
        clearInterval(pollClosed);
        setConnecting(false);
      }
    }, 500);

    fetch(`/api/googleOAuthStart${hint ? `?hint=${encodeURIComponent(hint)}` : ''}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((res) => res.json())
      .then((body) => {
        if (!body.authUrl) {
          popup.close();
          finish({ ok: false, error: body.error ?? 'Could not start Google sign-in.' });
          return;
        }
        popup.location.href = body.authUrl;
      })
      .catch(() => {
        popup.close();
        finish({ ok: false, error: 'Could not reach the server to start Google sign-in.' });
      });
  }, []);

  const connectNewAccount = useCallback(() => {
    openOAuthPopup(undefined, (result) => {
      if (!result.ok) {
        setConnectError(result.error);
        return;
      }
      const { email } = result;
      setAccounts((prev) => {
        if (prev.some((a) => a.email === email)) return prev;
        return [...prev, { email, status: 'signed-in', error: null, calendars: [] }];
      });
      const emails = loadLinkedEmails();
      if (!emails.includes(email)) saveLinkedEmails([...emails, email]);
      void getAccessToken(email).then((token) => {
        if (token) setPendingPicker({ email, accessToken: token });
      });
    });
  }, [openOAuthPopup, getAccessToken]);

  const reconnectAccount = useCallback(
    (email: string) => {
      setAccounts((prev) => prev.map((a) => (a.email === email ? { ...a, status: 'connecting', error: null } : a)));
      openOAuthPopup(email, (result) => {
        if (!result.ok) {
          handleAccountError(email, result.error);
          return;
        }
        tokenCache.current.delete(email);
        setAccounts((prev) => prev.map((a) => (a.email === email ? { ...a, status: 'signed-in', error: null } : a)));
      });
    },
    [openOAuthPopup, handleAccountError],
  );

  const disconnectAccount = useCallback(
    (email: string) => {
      const session = getStoredSession();
      tokenCache.current.delete(email);
      setAccounts((prev) => prev.filter((a) => a.email !== email));
      saveLinkedEmails(loadLinkedEmails().filter((e) => e !== email));
      setPendingPicker((p) => (p?.email === email ? null : p));
      if (session) {
        void fetch(`/api/googleCalendars?email=${encodeURIComponent(email)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.token}` },
        }).catch(() => {
          // best-effort — local state is already updated
        });
      }
    },
    [],
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
          status: 'signed-in' as const,
          error: null,
          calendars: persisted.find((a) => a.email === email)?.calendars ?? [],
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
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
