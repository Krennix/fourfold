import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllowedEmails, getLoginPin, mintSession, normalizeEmail, verifyPin } from './_lib/session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const configuredPin = getLoginPin();
  if (!configuredPin) {
    res.status(503).json({ error: 'PIN sign-in is not configured.' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
  if (!email || !pin) {
    res.status(400).json({ error: 'Email and PIN are required.' });
    return;
  }

  // Same error either way — don't let a wrong PIN confirm which emails are on the allowlist.
  if (!getAllowedEmails().includes(normalizeEmail(email)) || !verifyPin(pin, configuredPin)) {
    res.status(403).json({ error: 'Email or PIN is incorrect.' });
    return;
  }

  // Store the literal (lowercased) address rather than the aggressively-normalized form, so a
  // session started here lands on the same per-user data key (see api/data.ts) as one started
  // via Google sign-in, which stores the account's raw email.
  const sessionEmail = email.toLowerCase();
  const token = mintSession(sessionEmail);
  res.status(200).json({ token, email: sessionEmail });
}
