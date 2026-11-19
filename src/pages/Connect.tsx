import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Widget, PageHeader } from '../components/Widget';
import { useAuth, getStoredSession } from '../state/AuthContext';

/**
 * Consent screen for the MCP OAuth flow (api/oauth.ts): an AI assistant (claude.ai, Gemini CLI…)
 * sent the user here from /oauth/authorize. Being on this page means they're already signed in to
 * FourFold (LoginGate), so all that's left is to ask whether to let this app in.
 */

interface ClientInfo {
  name: string;
  redirectHost: string;
}

const PARAM_KEYS = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state'] as const;

async function oauthFetch(method: 'GET' | 'POST', query: string, body?: unknown): Promise<{ status: number; body: any }> {
  const session = getStoredSession();
  const res = await fetch(`/api/oauth?${query}`, {
    method,
    headers: { Authorization: `Bearer ${session?.token ?? ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

export function ConnectPage() {
  const [params] = useSearchParams();
  const { handleSessionExpired } = useAuth();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const oauthParams = Object.fromEntries(PARAM_KEYS.map((k) => [k, params.get(k) ?? '']).filter(([, v]) => v));

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ action: 'client', client_id: params.get('client_id') ?? '', redirect_uri: params.get('redirect_uri') ?? '', response_type: 'code', code_challenge: params.get('code_challenge') ?? '', code_challenge_method: params.get('code_challenge_method') ?? '' });
    void oauthFetch('GET', query.toString()).then(({ status, body }) => {
      if (cancelled) return;
      if (status === 401) return handleSessionExpired();
      if (status === 200) setClient(body);
      else setError(body.error_description ?? 'This connection request is not valid.');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approve = async () => {
    setBusy(true);
    const { status, body } = await oauthFetch('POST', 'action=approve', oauthParams);
    if (status === 401) return handleSessionExpired();
    if (status === 200 && typeof body.redirect === 'string') {
      window.location.assign(body.redirect);
      return;
    }
    setBusy(false);
    setError(body.error_description ?? body.error ?? 'Could not approve this connection.');
  };

  const deny = () => {
    // redirect_uri was validated against the client's registration by the server above.
    if (!client) return;
    const url = new URL(params.get('redirect_uri') as string);
    url.searchParams.set('error', 'access_denied');
    const state = params.get('state');
    if (state) url.searchParams.set('state', state);
    window.location.assign(url.toString());
  };

  return (
    <>
      <PageHeader kicker="Assistants" title="Connect an assistant" />
      <Widget>
        {error ? (
          <p role="alert" style={{ margin: 0 }}>{error}</p>
        ) : !client ? (
          <p className="text-muted" style={{ margin: 0 }}>Checking the request…</p>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              <strong>{client.name}</strong> wants to connect to your FourFold account.
            </p>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              It will be able to read and change your tasks, homework, calendar events, habits and countdowns — the same as your personal API token.
              It can't see your password or other accounts. You'll be sent back to <strong>{client.redirectHost}</strong>. Only approve this if you just
              started connecting an assistant yourself; you can disconnect every assistant any time in Settings.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" type="button" onClick={approve} disabled={busy}>
                {busy ? 'Connecting…' : `Allow ${client.name}`}
              </button>
              <button className="btn btn-ghost" type="button" onClick={deny} disabled={busy}>Cancel</button>
            </div>
          </>
        )}
      </Widget>
    </>
  );
}
