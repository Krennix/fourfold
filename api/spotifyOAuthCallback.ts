import type { VercelRequest, VercelResponse } from '@vercel/node';
import { exchangeCodeForTokens, fetchProfile, InvalidGrantError } from './_lib/spotifyOAuth.js';
import { consumeOAuthNonce, setSpotifyAccount } from './_lib/spotifyTokens.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
