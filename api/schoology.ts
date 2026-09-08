import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifySession } from './_lib/session.js';
import { parseIcsEvents } from './_lib/ics.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchAssignments(icsUrl: string) {
  const res = await fetch(icsUrl, { headers: { Accept: 'text/calendar, text/plain' } });
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);
  const text = await res.text();
  return parseIcsEvents(text).sort((a, b) => a.due.localeCompare(b.due));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = verifySession(bearerToken(req));
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const key = `fourfold:${email}:schoology`;

  if (req.method === 'GET') {
    const stored = (await redis.get<{ icsUrl: string }>(key)) ?? null;
    if (!stored?.icsUrl) {
      res.status(200).json({ icsUrl: null, assignments: [] });
      return;
    }
    try {
      const assignments = await fetchAssignments(stored.icsUrl);
      res.status(200).json({ icsUrl: stored.icsUrl, assignments });
    } catch {
      res.status(200).json({ icsUrl: stored.icsUrl, assignments: [], error: 'Could not reach the Schoology feed.' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const icsUrl = typeof req.body?.icsUrl === 'string' ? req.body.icsUrl.trim() : '';
    if (icsUrl && !isHttpUrl(icsUrl)) {
      res.status(400).json({ error: 'That does not look like a valid URL.' });
      return;
    }
    if (!icsUrl) {
      await redis.set(key, { icsUrl: '' });
      res.status(200).json({ icsUrl: null, assignments: [] });
      return;
    }
    try {
      const assignments = await fetchAssignments(icsUrl);
      await redis.set(key, { icsUrl });
      res.status(200).json({ icsUrl, assignments });
    } catch {
      res.status(400).json({ error: 'Could not fetch or parse that feed. Double-check the URL.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
