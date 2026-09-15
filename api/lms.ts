import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifySession } from './_lib/session.js';
import { parseIcsEvents } from './_lib/ics.js';
import { fetchCanvasAssignments } from './_lib/canvasApi.js';
import { fetchSchoologyAssignmentsViaApi, schoologyApiConfigured } from './_lib/schoologyApi.js';
import { fetchClassroomAssignments } from './_lib/classroomApi.js';
import { getRefreshToken } from './_lib/googleTokens.js';
import { refreshAccessToken } from './_lib/googleOAuth.js';
import { generateApiToken, getApiToken, resolveApiToken, revokeApiToken } from './_lib/apiTokens.js';
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
    const next: StoredCanvas = { ...stored };

    // A field only changes when the request explicitly includes it — an omitted field (as
    // opposed to one sent as "") keeps whatever was already stored, e.g. saving a new base URL
    // without retyping the token. Sending a field as "" is how the client asks to clear it.
    if (typeof req.body?.baseUrl === 'string') {
      next.baseUrl = req.body.baseUrl.trim().replace(/\/+$/, '') || undefined;
    }
    if (typeof req.body?.token === 'string') {
      next.token = req.body.token.trim() || undefined;
    }

    if (!next.baseUrl && !next.token) {
      await redis.set(key, {});
      res.status(200).json({ baseUrl: null, hasToken: false, assignments: [] });
      return;
    }
    if (!next.baseUrl || !isHttpUrl(next.baseUrl)) {
      res.status(400).json({ error: 'That does not look like a valid Canvas URL (e.g. https://yourschool.instructure.com).' });
      return;
    }
    if (!next.token) {
      res.status(400).json({ error: 'A personal access token is required.' });
      return;
    }

    try {
      const assignments = await fetchCanvasAssignments(next.baseUrl, next.token);
      await redis.set(key, next);
      res.status(200).json({ baseUrl: next.baseUrl, hasToken: true, assignments });
    } catch {
      res.status(400).json({ error: 'Could not reach Canvas with that URL/token. Double-check both.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

/** First linked Google account's Classroom assignments, refreshing a server-side access token
 * from the stored refresh token — unlike src/lib/googleClassroom.ts (called from the browser
 * with a client-minted token), this runs with no browser at all, e.g. from an unattended
 * personal-API-token fetch. Silently returns nothing if no Google account is linked, its refresh
 * token was revoked, or it never granted the Classroom scope — homework should still come back
 * from whichever other sources are configured. */
async function fetchClassroomAssignmentsForAccount(email: string): Promise<LmsAssignment[]> {
  const stored = (await redis.get<{ accounts?: { email: string }[] }>(`fourfold:${email}:googleCalendars`)) ?? {};
  const googleEmail = stored.accounts?.[0]?.email;
  if (!googleEmail) return [];

  const refreshToken = await getRefreshToken(email, googleEmail);
  if (!refreshToken) return [];

  try {
    const { accessToken } = await refreshAccessToken(refreshToken);
    return await fetchClassroomAssignments(accessToken);
  } catch {
    // Revoked/expired refresh token, missing Classroom scope, or a Classroom API error — any of
    // these just means no Classroom assignments this time, not a failure of the whole request.
    return [];
  }
}

async function handleHomework(req: VercelRequest, res: VercelResponse, email: string) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const [storedSchoology, storedCanvas] = await Promise.all([
    redis.get<StoredSchoology>(`fourfold:${email}:schoology`),
    redis.get<StoredCanvas>(`fourfold:${email}:canvas`),
  ]);

  const [schoology, canvas, classroom] = await Promise.all([
    fetchSchoologyAssignments(storedSchoology ?? {}).catch(() => []),
    storedCanvas?.baseUrl && storedCanvas.token ? fetchCanvasAssignments(storedCanvas.baseUrl, storedCanvas.token).catch(() => []) : [],
    fetchClassroomAssignmentsForAccount(email),
  ]);

  const daysAhead = Number(req.query.days) || 14;
  const windowStart = Date.now() - 24 * 60 * 60 * 1000; // include anything overdue by <1 day
  const windowEnd = Date.now() + daysAhead * 24 * 60 * 60 * 1000;

  const assignments = [...schoology, ...canvas, ...classroom]
    .filter((a) => {
      const t = new Date(a.due).getTime();
      return !Number.isNaN(t) && t >= windowStart && t <= windowEnd;
    })
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 50);

  res.status(200).json({ assignments });
}

async function handleApiToken(req: VercelRequest, res: VercelResponse, email: string) {
  if (req.method === 'GET') {
    res.status(200).json({ token: await getApiToken(email) });
    return;
  }
  if (req.method === 'POST') {
    res.status(200).json({ token: await generateApiToken(email) });
    return;
  }
  if (req.method === 'DELETE') {
    await revokeApiToken(email);
    res.status(200).json({ token: null });
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}

/** Single entry point for LMS assignment sources, routed by `?action=` — Vercel's Hobby plan
 * caps Serverless Functions per deployment, so Schoology, Canvas, the merged `homework` read, and
 * personal API token management share this file rather than each getting their own (same
 * reasoning as api/google.ts). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = bearerToken(req);
  const action = typeof req.query.action === 'string' ? req.query.action : 'schoology';

  // `homework` is the one action meant for unattended/external callers (e.g. a scheduled daily
  // brief) rather than the signed-in browser session, so it accepts a personal API token too.
  if (action === 'homework') {
    const email = verifySession(token) ?? (token ? await resolveApiToken(token) : null);
    if (!email) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    return handleHomework(req, res, email);
  }

  const email = verifySession(token);
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  switch (action) {
    case 'schoology':
      return handleSchoology(req, res, email);
    case 'canvas':
      return handleCanvas(req, res, email);
    case 'apiToken':
      return handleApiToken(req, res, email);
    default:
      res.status(400).json({ error: 'Unknown or missing action.' });
  }
}
