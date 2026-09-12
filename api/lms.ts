import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifySession } from './_lib/session.js';
import { parseIcsEvents } from './_lib/ics.js';
import { fetchCanvasAssignments } from './_lib/canvasApi.js';
import { fetchSchoologyAssignmentsViaApi, schoologyApiConfigured } from './_lib/schoologyApi.js';
import type { LmsAssignment } from './_lib/lmsShared.js';

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

interface StoredSchoology {
  icsUrl?: string;
  apiKey?: string;
  apiSecret?: string;
}

async function fetchIcsAssignments(icsUrl: string): Promise<LmsAssignment[]> {
  const res = await fetch(icsUrl, { headers: { Accept: 'text/calendar, text/plain' } });
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);
  const text = await res.text();
  return parseIcsEvents(text)
    .map((e): LmsAssignment => ({ ...e, points: null, url: null, source: 'schoology' }))
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** Prefers the authenticated Schoology API (has `points`) when the account has personal API
 * credentials saved and the server has an app-level consumer key/secret configured; otherwise
 * falls back to the .ics feed, which never carries points. */
async function fetchSchoologyAssignments(stored: StoredSchoology): Promise<LmsAssignment[]> {
  if (stored.apiKey && stored.apiSecret && schoologyApiConfigured()) {
    return fetchSchoologyAssignmentsViaApi(stored.apiKey, stored.apiSecret);
  }
  if (stored.icsUrl) return fetchIcsAssignments(stored.icsUrl);
  return [];
}

async function handleSchoology(req: VercelRequest, res: VercelResponse, email: string) {
  const key = `fourfold:${email}:schoology`;

  if (req.method === 'GET') {
    const stored = (await redis.get<StoredSchoology>(key)) ?? {};
    const hasApiKey = Boolean(stored.apiKey && stored.apiSecret);
    try {
      const assignments = await fetchSchoologyAssignments(stored);
      res.status(200).json({ icsUrl: stored.icsUrl ?? null, hasApiKey, assignments });
    } catch {
      res.status(200).json({ icsUrl: stored.icsUrl ?? null, hasApiKey, assignments: [], error: 'Could not reach Schoology.' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const stored = (await redis.get<StoredSchoology>(key)) ?? {};
    const next: StoredSchoology = { ...stored };

    if (typeof req.body?.icsUrl === 'string') {
      const url = normalizeIcsUrl(req.body.icsUrl.trim());
      if (url && !isHttpUrl(url)) {
        res.status(400).json({ error: 'That does not look like a valid URL.' });
        return;
      }
      next.icsUrl = url || undefined;
    }

    if (typeof req.body?.apiKey === 'string' || typeof req.body?.apiSecret === 'string') {
      const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : (stored.apiKey ?? '');
      const apiSecret = typeof req.body?.apiSecret === 'string' ? req.body.apiSecret.trim() : (stored.apiSecret ?? '');
      if (apiKey && apiSecret) {
        if (!schoologyApiConfigured()) {
          res.status(400).json({ error: 'Schoology API access is not configured on the server (missing SCHOOLOGY_CONSUMER_KEY/SCHOOLOGY_CONSUMER_SECRET).' });
          return;
        }
        next.apiKey = apiKey;
        next.apiSecret = apiSecret;
      } else {
        next.apiKey = undefined;
        next.apiSecret = undefined;
      }
    }

    try {
      const assignments = await fetchSchoologyAssignments(next);
      await redis.set(key, next);
      res.status(200).json({ icsUrl: next.icsUrl ?? null, hasApiKey: Boolean(next.apiKey && next.apiSecret), assignments });
    } catch {
      res.status(400).json({ error: 'Could not fetch or verify that feed/API credentials. Double-check them.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

interface StoredCanvas {
  baseUrl?: string;
  token?: string;
}

async function handleCanvas(req: VercelRequest, res: VercelResponse, email: string) {
  const key = `fourfold:${email}:canvas`;

  if (req.method === 'GET') {
    const stored = (await redis.get<StoredCanvas>(key)) ?? {};
    if (!stored.baseUrl || !stored.token) {
      res.status(200).json({ baseUrl: stored.baseUrl ?? null, hasToken: false, assignments: [] });
      return;
    }
    try {
      const assignments = await fetchCanvasAssignments(stored.baseUrl, stored.token);
      res.status(200).json({ baseUrl: stored.baseUrl, hasToken: true, assignments });
    } catch {
      res.status(200).json({ baseUrl: stored.baseUrl, hasToken: true, assignments: [], error: 'Could not reach Canvas.' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const stored = (await redis.get<StoredCanvas>(key)) ?? {};
    const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl.trim().replace(/\/+$/, '') : (stored.baseUrl ?? '');
    const token = typeof req.body?.token === 'string' && req.body.token.trim() ? req.body.token.trim() : (stored.token ?? '');

    if (!baseUrl && !token) {
      await redis.set(key, {});
      res.status(200).json({ baseUrl: null, hasToken: false, assignments: [] });
      return;
    }
    if (!isHttpUrl(baseUrl)) {
      res.status(400).json({ error: 'That does not look like a valid Canvas URL (e.g. https://yourschool.instructure.com).' });
      return;
    }
    if (!token) {
      res.status(400).json({ error: 'A personal access token is required.' });
      return;
    }

    try {
      const assignments = await fetchCanvasAssignments(baseUrl, token);
      await redis.set(key, { baseUrl, token });
      res.status(200).json({ baseUrl, hasToken: true, assignments });
    } catch {
      res.status(400).json({ error: 'Could not reach Canvas with that URL/token. Double-check both.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

/** Single entry point for LMS assignment sources, routed by `?action=` — Vercel's Hobby plan
 * caps Serverless Functions per deployment, so Schoology and Canvas share this file rather than
 * each getting their own (same reasoning as api/google.ts). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = verifySession(bearerToken(req));
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const action = typeof req.query.action === 'string' ? req.query.action : 'schoology';
  switch (action) {
    case 'schoology':
      return handleSchoology(req, res, email);
    case 'canvas':
      return handleCanvas(req, res, email);
    default:
      res.status(400).json({ error: 'Unknown or missing action.' });
  }
}
