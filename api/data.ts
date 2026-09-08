import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifySession } from './_lib/session.js';

// The Vercel-connected Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN
// (legacy Vercel KV naming), not the UPSTASH_REDIS_REST_* names Redis.fromEnv() expects.
const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

const NAMESPACES = new Set(['school', 'habits', 'matrix', 'countdowns', 'agentChat', 'dailyPlan', 'watchdogDismissed']);

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

  const ns = typeof req.query.ns === 'string' ? req.query.ns : null;
  if (!ns || !NAMESPACES.has(ns)) {
    res.status(400).json({ error: 'Unknown namespace.' });
    return;
  }

  const key = `fourfold:${email}:${ns}`;

  if (req.method === 'GET') {
    const value = await redis.get(key);
    res.status(200).json({ value: value ?? null });
    return;
  }

  if (req.method === 'PUT') {
    await redis.set(key, req.body ?? null);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
