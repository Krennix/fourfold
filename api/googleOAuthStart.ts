import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_lib/session.js';
import { buildAuthUrl, googleOAuthConfigured } from './_lib/googleOAuth.js';
import { createOAuthNonce } from './_lib/googleTokens.js';

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

  if (!googleOAuthConfigured()) {
    res.status(500).json({ error: 'Google OAuth is not configured on the server (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).' });
    return;
  }

  const hint = typeof req.query.hint === 'string' ? req.query.hint : undefined;
  const nonce = await createOAuthNonce(email);
  const authUrl = buildAuthUrl(requestOrigin(req), nonce, hint);
  res.status(200).json({ authUrl });
}
