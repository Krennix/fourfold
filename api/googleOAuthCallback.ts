import type { VercelRequest, VercelResponse } from '@vercel/node';
import { exchangeCodeForTokens, fetchPrimaryCalendarEmail, InvalidGrantError } from './_lib/googleOAuth.js';
import { consumeOAuthNonce, setRefreshToken } from './_lib/googleTokens.js';

function requestOrigin(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

/** Renders a page that reports the result back to the window that opened this popup, then
 * closes itself. The opener listens for this exact message shape/origin in GoogleAuthContext. */
function popupResultPage(payload: Record<string, unknown>): string {
  return `<!doctype html><html><body style="font:14px system-ui;padding:2rem;">
<p>${payload.ok ? 'Connected — you can close this window.' : `Could not connect: ${String(payload.error ?? 'unknown error')}`}</p>
<script>
  if (window.opener) {
    window.opener.postMessage(${JSON.stringify({ type: 'fourfold-google-oauth', ...payload })}, window.location.origin);
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
    res.status(200).send(popupResultPage({ ok: false, error: 'Missing code/state from Google.' }));
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
      // Shouldn't happen with access_type=offline&prompt=consent, but if Google ever omits it
      // there is nothing durable to store — surface this rather than silently degrading.
      res.status(200).send(popupResultPage({ ok: false, error: 'Google did not grant offline access — try again and approve the consent screen.' }));
      return;
    }
    const googleEmail = await fetchPrimaryCalendarEmail(tokens.accessToken);
    await setRefreshToken(appEmail, googleEmail, tokens.refreshToken);
    res.status(200).send(popupResultPage({ ok: true, email: googleEmail }));
  } catch (err) {
    const message = err instanceof InvalidGrantError ? err.message : err instanceof Error ? err.message : 'Unknown error';
    res.status(200).send(popupResultPage({ ok: false, error: message }));
  }
}
