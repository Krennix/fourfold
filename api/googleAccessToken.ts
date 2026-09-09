import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_lib/session.js';
import { refreshAccessToken, InvalidGrantError } from './_lib/googleOAuth.js';
import { deleteRefreshToken, getRefreshToken } from './_lib/googleTokens.js';

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

/** Mints a fresh Google Calendar access token from the server-stored refresh token — the client
 * calls this on demand (before each batch of Calendar API calls, or after a 401) instead of
 * scheduling its own client-side refresh timer. Since the refresh token lives here rather than
 * depending on the browser's Google session/cookies, this keeps working across reloads, sleep,
 * and background tabs. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const appEmail = verifySession(bearerToken(req));
  if (!appEmail) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const googleEmail = typeof req.query.email === 'string' ? req.query.email : null;
  if (!googleEmail) {
    res.status(400).json({ error: 'Missing email' });
    return;
  }

  const refreshToken = await getRefreshToken(appEmail, googleEmail);
  if (!refreshToken) {
    res.status(404).json({ error: 'No linked Google account found for that email.', code: 'not_linked' });
    return;
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);
    res.status(200).json({ accessToken: tokens.accessToken, expiresInSeconds: tokens.expiresInSeconds });
  } catch (err) {
    if (err instanceof InvalidGrantError) {
      await deleteRefreshToken(appEmail, googleEmail);
      res.status(401).json({ error: 'Google access was revoked for this account — reconnect it.', code: 'invalid_grant' });
      return;
    }
    res.status(502).json({ error: err instanceof Error ? err.message : 'Could not reach Google.' });
  }
}
