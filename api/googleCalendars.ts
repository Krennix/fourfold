import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifySession } from './_lib/session.js';
import { revokeGoogleToken } from './_lib/googleOAuth.js';
import { deleteRefreshToken } from './_lib/googleTokens.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

interface LinkedCalendar {
  id: string;
  summary: string;
  color: string;
  selected: boolean;
  colorOverride?: string;
}

interface LinkedGoogleAccount {
  email: string;
  calendars: LinkedCalendar[];
}

function isLinkedCalendar(value: unknown): value is LinkedCalendar {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.summary === 'string' &&
    typeof c.color === 'string' &&
    typeof c.selected === 'boolean' &&
    (c.colorOverride === undefined || typeof c.colorOverride === 'string')
  );
}

function isLinkedAccount(value: unknown): value is LinkedGoogleAccount {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return typeof a.email === 'string' && Array.isArray(a.calendars) && a.calendars.every(isLinkedCalendar);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = verifySession(bearerToken(req));
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const key = `fourfold:${email}:googleCalendars`;

  if (req.method === 'GET') {
    const stored = (await redis.get<{ accounts: LinkedGoogleAccount[] }>(key)) ?? null;
    res.status(200).json({ accounts: stored?.accounts ?? [] });
    return;
  }

  if (req.method === 'PUT') {
    const accounts = req.body?.accounts;
    if (!Array.isArray(accounts) || !accounts.every(isLinkedAccount)) {
      res.status(400).json({ error: 'Malformed linked-calendars payload.' });
      return;
    }
    await redis.set(key, { accounts });
    res.status(200).json({ accounts });
    return;
  }

  if (req.method === 'DELETE') {
    const googleEmail = typeof req.query.email === 'string' ? req.query.email : null;
    if (!googleEmail) {
      res.status(400).json({ error: 'Missing email' });
      return;
    }
    const refreshToken = await deleteRefreshToken(email, googleEmail);
    if (refreshToken) await revokeGoogleToken(refreshToken);
    const stored = (await redis.get<{ accounts: LinkedGoogleAccount[] }>(key)) ?? null;
    const accounts = (stored?.accounts ?? []).filter((a) => a.email !== googleEmail);
    await redis.set(key, { accounts });
    res.status(200).json({ accounts });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
