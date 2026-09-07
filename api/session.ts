import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllowedEmails, mintSession, normalizeEmail, verifyGoogleIdToken } from './_lib/session.js';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : null;
  if (!idToken) {
    res.status(400).json({ error: 'Missing idToken' });
    return;
  }

  try {
    const info = await verifyGoogleIdToken(idToken);
    if (!CLIENT_ID || info.aud !== CLIENT_ID || info.email_verified !== 'true') {
      res.status(401).json({ error: 'Could not verify sign-in with Google.' });
      return;
    }
    if (!getAllowedEmails().includes(normalizeEmail(info.email))) {
      res.status(403).json({ error: `${info.email} isn't on the access list for this app.` });
      return;
    }
    const token = mintSession(info.email);
    res.status(200).json({ token, email: info.email });
  } catch {
    res.status(401).json({ error: 'Sign-in verification failed.' });
  }
}
