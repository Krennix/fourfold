import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_lib/session.js';
import { buildAuthUrl, spotifyOAuthConfigured } from './_lib/spotifyOAuth.js';
import { createOAuthNonce } from './_lib/spotifyTokens.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
