import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getStoredSession } from './AuthContext';

/** Popup message payload from api/spotifyOAuthCallback.ts — kept in sync with that file. */
const OAUTH_MESSAGE_TYPE = 'fourfold-spotify-oauth';

export type SpotifyProduct = 'premium' | 'free' | 'open' | null;

interface SpotifyAuthContextValue {
  /** Whether Spotify is usable at all (server has SPOTIFY_CLIENT_ID/SECRET) — checked lazily
   * via the same call that loads connection state, since (unlike Google) the client never
   * needs the client id itself. */
  status: 'unknown' | 'unconfigured' | 'ready';
  connected: boolean;
  displayName: string | null;
  product: SpotifyProduct;
  connecting: boolean;
  connectError: string | null;
  connect: () => void;
  disconnect: () => void;
  /** Server-minted access token, cached in-memory for its lifetime. Refreshed from the
   * stored server-side refresh token on demand. */
  getAccessToken: (opts?: { force?: boolean }) => Promise<string | null>;
}

const SpotifyAuthContext = createContext<SpotifyAuthContextValue | null>(null);

interface CachedToken {
  token: string;
  expiresAt: number;
}

export function SpotifyAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SpotifyAuthContextValue['status']>('unknown');
  const [connected, setConnected] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [product, setProduct] = useState<SpotifyProduct>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const tokenCache = useRef<CachedToken | null>(null);

  const getAccessToken = useCallback(async (opts?: { force?: boolean }): Promise<string | null> => {
    const cached = tokenCache.current;
    if (!opts?.force && cached && cached.expiresAt - 30_000 > Date.now()) return cached.token;

    const session = getStoredSession();
    if (!session) return null;
    try {
      const res = await fetch('/api/spotifyAccessToken', { headers: { Authorization: `Bearer ${session.token}` } });
      const body = await res.json();
      if (!res.ok) {
        if (body.code === 'invalid_grant' || body.code === 'not_linked') {
          setConnected(false);
          tokenCache.current = null;
        } else {
          setConnectError(body.error ?? 'Could not refresh Spotify — reconnect it.');
        }
        return null;
      }
      tokenCache.current = { token: body.accessToken, expiresAt: Date.now() + body.expiresInSeconds * 1000 };
      setConnected(true);
      setProduct(body.product ?? null);
      setDisplayName(body.displayName ?? null);
      return body.accessToken;
    } catch {
      setConnectError('Could not reach the server to refresh Spotify.');
      return null;
    }
  }, []);

  const connect = useCallback(() => {
    const session = getStoredSession();
    if (!session) return;
    setConnectError(null);
    setConnecting(true);

    const popup = window.open('about:blank', 'fourfold-spotify-oauth', 'width=520,height=680');
    if (!popup) {
      setConnecting(false);
      setConnectError('Your browser blocked the sign-in popup — allow popups for this site and try again.');
      return;
    }

    const finish = (result: { ok: true; displayName: string; product: string } | { ok: false; error: string }) => {
      window.removeEventListener('message', onMessage);
      clearInterval(pollClosed);
      setConnecting(false);
      if (result.ok) {
        setConnected(true);
        setDisplayName(result.displayName);
        setProduct(result.product as SpotifyProduct);
        setStatus('ready');
        tokenCache.current = null;
      } else {
        setConnectError(result.error);
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== OAUTH_MESSAGE_TYPE) return;
      if (event.data.ok) finish({ ok: true, displayName: event.data.displayName, product: event.data.product });
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

    fetch('/api/spotifyOAuthStart', { headers: { Authorization: `Bearer ${session.token}` } })
      .then((res) => res.json())
      .then((body) => {
        if (!body.authUrl) {
          popup.close();
          if (body.error?.includes('not configured')) setStatus('unconfigured');
          finish({ ok: false, error: body.error ?? 'Could not start Spotify sign-in.' });
          return;
        }
        popup.location.href = body.authUrl;
      })
      .catch(() => {
        popup.close();
        finish({ ok: false, error: 'Could not reach the server to start Spotify sign-in.' });
      });
  }, []);

  const disconnect = useCallback(() => {
    const session = getStoredSession();
    tokenCache.current = null;
    setConnected(false);
    setDisplayName(null);
    setProduct(null);
    if (session) {
      void fetch('/api/spotifyAccount', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      }).catch(() => {
        // best-effort — local state is already updated
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = getStoredSession();
      if (!session) return;
      try {
        const res = await fetch('/api/spotifyAccount', { headers: { Authorization: `Bearer ${session.token}` } });
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        setStatus('ready');
        if (body.connected) {
          setConnected(true);
          setDisplayName(body.displayName ?? null);
          setProduct(body.product ?? null);
        }
      } catch {
        // stays 'unknown' — connect button will surface the real error on click
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SpotifyAuthContext.Provider
      value={{ status, connected, displayName, product, connecting, connectError, connect, disconnect, getAccessToken }}
    >
      {children}
    </SpotifyAuthContext.Provider>
  );
}

export function useSpotifyAuth() {
  const ctx = useContext(SpotifyAuthContext);
  if (!ctx) throw new Error('useSpotifyAuth must be used within a SpotifyAuthProvider');
  return ctx;
}
