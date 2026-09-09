import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifySession } from './_lib/session.js';
import { parseIcsCalendarEvents } from './_lib/ics.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

/** Calendar apps hand out `webcal://` links as an alias for the same feed over https. */
function normalizeIcsUrl(value: string): string {
  return value.replace(/^webcal:\/\//i, 'https://');
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchEvents(icsUrl: string) {
  const res = await fetch(icsUrl, { headers: { Accept: 'text/calendar, text/plain' } });
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);
  const text = await res.text();
  return parseIcsCalendarEvents(text).sort((a, b) => a.startISO.localeCompare(b.startISO));
}

/** Read-only backup path for Google Calendar: instead of the OAuth link (which needs a working
 * Google Cloud client and can go stale), the user can paste their calendar's "secret address in
 * iCal format" (Google Calendar → Settings → that calendar → Integrate calendar) and get the same
 * events shown here, merged in as non-editable entries. No token to expire, nothing to disconnect. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = verifySession(bearerToken(req));
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const key = `fourfold:${email}:googleIcsFeed`;

  if (req.method === 'GET') {
    const stored = (await redis.get<{ icsUrl: string }>(key)) ?? null;
    if (!stored?.icsUrl) {
      res.status(200).json({ icsUrl: null, events: [] });
      return;
    }
    try {
      const events = await fetchEvents(stored.icsUrl);
      res.status(200).json({ icsUrl: stored.icsUrl, events });
    } catch {
      res.status(200).json({ icsUrl: stored.icsUrl, events: [], error: 'Could not reach that calendar feed.' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const icsUrl = typeof req.body?.icsUrl === 'string' ? normalizeIcsUrl(req.body.icsUrl.trim()) : '';
    if (icsUrl && !isHttpUrl(icsUrl)) {
      res.status(400).json({ error: 'That does not look like a valid URL.' });
      return;
    }
    if (!icsUrl) {
      await redis.set(key, { icsUrl: '' });
      res.status(200).json({ icsUrl: null, events: [] });
      return;
    }
    try {
      const events = await fetchEvents(icsUrl);
      await redis.set(key, { icsUrl });
      res.status(200).json({ icsUrl, events });
    } catch {
      res.status(400).json({ error: 'Could not fetch or parse that feed. Double-check the URL.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
