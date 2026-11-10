import { Redis } from '@upstash/redis';
import { parseIcsEvents } from './ics.js';
import { fetchCanvasAssignments } from './canvasApi.js';
import { fetchSchoologyAssignmentsViaApi, schoologyApiConfigured } from './schoologyApi.js';
import { fetchClassroomAssignments } from './classroomApi.js';
import { getRefreshToken } from './googleTokens.js';
import { refreshAccessToken } from './googleOAuth.js';
import type { LmsAssignment } from './lmsShared.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

/** Calendar apps hand out `webcal://` links as an alias for the same feed over https. */
export function normalizeIcsUrl(value: string): string {
  return value.replace(/^webcal:\/\//i, 'https://');
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface StoredSchoology {
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
export async function fetchSchoologyAssignments(stored: StoredSchoology): Promise<LmsAssignment[]> {
  if (stored.apiKey && stored.apiSecret && schoologyApiConfigured()) {
    return fetchSchoologyAssignmentsViaApi(stored.apiKey, stored.apiSecret);
  }
  if (stored.icsUrl) return fetchIcsAssignments(stored.icsUrl);
  return [];
}

export interface StoredCanvas {
  baseUrl?: string;
  token?: string;
}

/** First linked Google account's Classroom assignments, refreshing a server-side access token
 * from the stored refresh token — unlike src/lib/googleClassroom.ts (called from the browser
 * with a client-minted token), this runs with no browser at all, e.g. from an unattended
 * personal-API-token fetch. Silently returns nothing if no Google account is linked, its refresh
 * token was revoked, or it never granted the Classroom scope — homework should still come back
 * from whichever other sources are configured. */
export async function fetchClassroomAssignmentsForAccount(email: string): Promise<LmsAssignment[]> {
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

/** Every assignment from every configured source (Schoology, Canvas, Google Classroom). A source
 * that is unconfigured or errors just contributes nothing, so one broken feed never hides the rest. */
export async function fetchAllAssignments(email: string): Promise<LmsAssignment[]> {
  const [storedSchoology, storedCanvas] = await Promise.all([
    redis.get<StoredSchoology>(`fourfold:${email}:schoology`),
    redis.get<StoredCanvas>(`fourfold:${email}:canvas`),
  ]);
  const [schoology, canvas, classroom] = await Promise.all([
    fetchSchoologyAssignments(storedSchoology ?? {}).catch(() => []),
    storedCanvas?.baseUrl && storedCanvas.token ? fetchCanvasAssignments(storedCanvas.baseUrl, storedCanvas.token).catch(() => []) : [],
    fetchClassroomAssignmentsForAccount(email),
  ]);
  return [...schoology, ...canvas, ...classroom];
}
