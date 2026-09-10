import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_lib/session.js';
import { deleteSpotifyAccount, getSpotifyAccount } from './_lib/spotifyTokens.js';

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
