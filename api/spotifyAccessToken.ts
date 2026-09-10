import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_lib/session.js';
import { refreshAccessToken, InvalidGrantError } from './_lib/spotifyOAuth.js';
import { deleteSpotifyAccount, getSpotifyAccount } from './_lib/spotifyTokens.js';

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

/** Mints a fresh Spotify access token from the server-stored refresh token — the client calls
 * this on demand (before playback calls, or after a 401) instead of scheduling its own
 * client-side refresh timer. Keeps working across reloads, sleep, and background tabs. */
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
