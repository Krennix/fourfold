import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_lib/session.js';
import { buildAuthUrl, exchangeCodeForTokens, fetchProfile, InvalidGrantError, refreshAccessToken, spotifyOAuthConfigured } from './_lib/spotifyOAuth.js';
import { consumeOAuthNonce, createOAuthNonce, deleteSpotifyAccount, getSpotifyAccount, setSpotifyAccount } from './_lib/spotifyTokens.js';

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

/** Vercel puts the deployment's own origin on these headers; falls back to the request Host
 * header for local dev (`vercel dev` / a plain node server behind no proxy). */
function requestOrigin(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

/** Renders a page that reports the result back to the window that opened this popup, then
 * closes itself. The opener listens for this exact message shape/origin in SpotifyAuthContext. */
function popupResultPage(payload: Record<string, unknown>): string {
  return `<!doctype html><html><body style="font:14px system-ui;padding:2rem;">
<p>${payload.ok ? 'Connected — you can close this window.' : `Could not connect: ${String(payload.error ?? 'unknown error')}`}</p>
<script>
  if (window.opener) {
    window.opener.postMessage(${JSON.stringify({ type: 'fourfold-spotify-oauth', ...payload })}, window.location.origin);
  }
  window.close();
</script>
</body></html>`;
}

async function handleOAuthStart(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const email = verifySession(bearerToken(req));
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  if (!spotifyOAuthConfigured()) {
    res.status(500).json({ error: 'Spotify is not configured on the server (missing SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET).' });
    return;
  }

  const nonce = await createOAuthNonce(email);
  const authUrl = buildAuthUrl(requestOrigin(req), nonce);
  res.status(200).json({ authUrl });
}

async function handleOAuthCallback(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;

  res.setHeader('Content-Type', 'text/html');

  if (oauthError) {
    res.status(200).send(popupResultPage({ ok: false, error: oauthError }));
    return;
  }
  if (!code || !state) {
    res.status(200).send(popupResultPage({ ok: false, error: 'Missing code/state from Spotify.' }));
    return;
  }

  const appEmail = await consumeOAuthNonce(state);
  if (!appEmail) {
    res.status(200).send(popupResultPage({ ok: false, error: 'This sign-in link expired — try connecting again.' }));
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code, requestOrigin(req));
    if (!tokens.refreshToken) {
      res.status(200).send(popupResultPage({ ok: false, error: 'Spotify did not grant offline access — try again.' }));
      return;
    }
    const profile = await fetchProfile(tokens.accessToken);
    await setSpotifyAccount(appEmail, {
      refreshToken: tokens.refreshToken,
      spotifyUserId: profile.id,
      displayName: profile.displayName,
      product: profile.product,
    });
    res.status(200).send(popupResultPage({ ok: true, displayName: profile.displayName, product: profile.product }));
  } catch (err) {
    const message = err instanceof InvalidGrantError ? err.message : err instanceof Error ? err.message : 'Unknown error';
    res.status(200).send(popupResultPage({ ok: false, error: message }));
  }
}

/** Mints a fresh Spotify access token from the server-stored refresh token — the client calls
 * this on demand (before playback calls, or after a 401) instead of scheduling its own
 * client-side refresh timer. Keeps working across reloads, sleep, and background tabs. */
async function handleAccessToken(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const appEmail = verifySession(bearerToken(req));
  if (!appEmail) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const account = await getSpotifyAccount(appEmail);
  if (!account) {
    res.status(404).json({ error: 'No linked Spotify account.', code: 'not_linked' });
    return;
  }

  try {
    const tokens = await refreshAccessToken(account.refreshToken);
    res.status(200).json({
      accessToken: tokens.accessToken,
      expiresInSeconds: tokens.expiresInSeconds,
      product: account.product,
      displayName: account.displayName,
    });
  } catch (err) {
    if (err instanceof InvalidGrantError) {
      await deleteSpotifyAccount(appEmail);
      res.status(401).json({ error: 'Spotify access was revoked — reconnect it.', code: 'invalid_grant' });
      return;
    }
    res.status(502).json({ error: err instanceof Error ? err.message : 'Could not reach Spotify.' });
  }
}

async function handleAccount(req: VercelRequest, res: VercelResponse) {
  const email = verifySession(bearerToken(req));
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  if (req.method === 'GET') {
    const account = await getSpotifyAccount(email);
    if (!account) {
      res.status(200).json({ connected: false });
      return;
    }
    res.status(200).json({ connected: true, displayName: account.displayName, product: account.product });
    return;
  }

  if (req.method === 'DELETE') {
    await deleteSpotifyAccount(email);
    res.status(200).json({ connected: false });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

/** Single entry point for all Spotify-integration endpoints, routed by `?action=` — Vercel's
 * Hobby plan caps Serverless Functions per deployment, so the formerly separate
 * spotifyOAuthStart/spotifyOAuthCallback/spotifyAccessToken/spotifyAccount handlers live here
 * now. External-facing URLs (registered as OAuth redirect URIs, or called by the client) are
 * preserved via rewrites in vercel.json. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : null;

  switch (action) {
    case 'oauthStart':
      return handleOAuthStart(req, res);
    case 'oauthCallback':
      return handleOAuthCallback(req, res);
    case 'accessToken':
      return handleAccessToken(req, res);
    case 'account':
      return handleAccount(req, res);
    default:
      res.status(400).json({ error: 'Unknown or missing action.' });
  }
}
