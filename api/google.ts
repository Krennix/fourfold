import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifySession } from './_lib/session.js';
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  fetchPrimaryCalendarEmail,
  googleOAuthConfigured,
  InvalidGrantError,
  refreshAccessToken,
  revokeGoogleToken,
} from './_lib/googleOAuth.js';
import { consumeOAuthNonce, createOAuthNonce, deleteRefreshToken, getRefreshToken, setRefreshToken } from './_lib/googleTokens.js';
import { parseIcsCalendarEvents, type IcsCalendarEvent } from './_lib/ics.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

/** Vercel puts the deployment's own origin on these headers; falls back to the request Host
 * header for local dev (`vercel dev` / a plain node server behind no proxy). */
function requestOrigin(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

/** Renders a page that reports the result back to the window that opened this popup, then
 * closes itself. The opener listens for this exact message shape/origin in GoogleAuthContext. */
function popupResultPage(payload: Record<string, unknown>): string {
  return `<!doctype html><html><body style="font:14px system-ui;padding:2rem;">
<p>${payload.ok ? 'Connected — you can close this window.' : `Could not connect: ${String(payload.error ?? 'unknown error')}`}</p>
<script>
  if (window.opener) {
    window.opener.postMessage(${JSON.stringify({ type: 'fourfold-google-oauth', ...payload })}, window.location.origin);
  }
  window.close();
</script>
</body></html>`;
}

async function handleOAuthStart(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const email = verifySession(bearerToken(req));
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  if (!googleOAuthConfigured()) {
    res.status(500).json({ error: 'Google OAuth is not configured on the server (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).' });
    return;
  }

  const hint = typeof req.query.hint === 'string' ? req.query.hint : undefined;
  const nonce = await createOAuthNonce(email);
  const authUrl = buildAuthUrl(requestOrigin(req), nonce, hint);
  res.status(200).json({ authUrl });
}

async function handleOAuthCallback(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const oauthError = typeof req.query.error === 'string' ? req.query.error : null;

  res.setHeader('Content-Type', 'text/html');

  if (oauthError) {
    res.status(200).send(popupResultPage({ ok: false, error: oauthError }));
    return;
  }
  if (!code || !state) {
    res.status(200).send(popupResultPage({ ok: false, error: 'Missing code/state from Google.' }));
    return;
  }

  const appEmail = await consumeOAuthNonce(state);
  if (!appEmail) {
    res.status(200).send(popupResultPage({ ok: false, error: 'This sign-in link expired — try connecting again.' }));
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code, requestOrigin(req));
    if (!tokens.refreshToken) {
      // Shouldn't happen with access_type=offline&prompt=consent, but if Google ever omits it
      // there is nothing durable to store — surface this rather than silently degrading.
      res.status(200).send(popupResultPage({ ok: false, error: 'Google did not grant offline access — try again and approve the consent screen.' }));
      return;
    }
    const googleEmail = await fetchPrimaryCalendarEmail(tokens.accessToken);
    await setRefreshToken(appEmail, googleEmail, tokens.refreshToken);
    res.status(200).send(popupResultPage({ ok: true, email: googleEmail }));
  } catch (err) {
    const message = err instanceof InvalidGrantError ? err.message : err instanceof Error ? err.message : 'Unknown error';
    res.status(200).send(popupResultPage({ ok: false, error: message }));
  }
}

/** Mints a fresh Google Calendar access token from the server-stored refresh token — the client
 * calls this on demand (before each batch of Calendar API calls, or after a 401) instead of
 * scheduling its own client-side refresh timer. Since the refresh token lives here rather than
 * depending on the browser's Google session/cookies, this keeps working across reloads, sleep,
 * and background tabs. */
async function handleAccessToken(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const appEmail = verifySession(bearerToken(req));
  if (!appEmail) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const googleEmail = typeof req.query.email === 'string' ? req.query.email : null;
  if (!googleEmail) {
    res.status(400).json({ error: 'Missing email' });
    return;
  }

  const refreshToken = await getRefreshToken(appEmail, googleEmail);
  if (!refreshToken) {
    res.status(404).json({ error: 'No linked Google account found for that email.', code: 'not_linked' });
    return;
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);
    res.status(200).json({ accessToken: tokens.accessToken, expiresInSeconds: tokens.expiresInSeconds });
  } catch (err) {
    if (err instanceof InvalidGrantError) {
      await deleteRefreshToken(appEmail, googleEmail);
      res.status(401).json({ error: 'Google access was revoked for this account — reconnect it.', code: 'invalid_grant' });
      return;
    }
    res.status(502).json({ error: err instanceof Error ? err.message : 'Could not reach Google.' });
  }
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

async function handleCalendars(req: VercelRequest, res: VercelResponse) {
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

/** Calendar apps hand out `webcal://` links as an alias for the same feed over https. */
function normalizeIcsUrl(value: string): string {
  const httpsified = value.replace(/^webcal:\/\//i, 'https://');
  return convertEmbedLinkToIcs(httpsified);
}

/**
 * People often paste the "embed this calendar" widget link (calendar.google.com/calendar/embed?
 * src=...) instead of the actual iCal feed — it looks like a calendar URL but only returns an
 * HTML page, not event data. If we can pull a calendar id out of it, redirect to the equivalent
 * public ICS feed instead so the paste still works. Only public calendars support this; private
 * ones still need the real "secret address in iCal format" URL, which doesn't need conversion.
 */
function convertEmbedLinkToIcs(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname !== 'calendar.google.com' || !url.pathname.startsWith('/calendar/embed')) return value;
    const src = url.searchParams.get('src');
    if (!src) return value;
    return `https://calendar.google.com/calendar/ical/${encodeURIComponent(src)}/public/basic.ics`;
  } catch {
    return value;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

interface StoredFeed {
  id: string;
  label: string;
  url: string;
  color?: string;
}

function isStoredFeed(value: unknown): value is StoredFeed {
  if (!value || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.id === 'string' &&
    typeof f.label === 'string' &&
    typeof f.url === 'string' &&
    (f.color === undefined || typeof f.color === 'string')
  );
}

/** Old single-feed shape (`{ icsUrl }`), from before multiple feeds were supported — migrated
 * to a one-item `feeds` list on first read so existing users don't lose their saved feed. */
interface LegacyStored {
  icsUrl?: string;
}

async function loadStoredFeeds(key: string): Promise<StoredFeed[]> {
  const stored = (await redis.get<{ feeds?: unknown[] } & LegacyStored>(key)) ?? null;
  if (!stored) return [];
  if (Array.isArray(stored.feeds)) return stored.feeds.filter(isStoredFeed);
  if (stored.icsUrl) return [{ id: 'legacy', label: 'Google Calendar', url: stored.icsUrl }];
  return [];
}

async function fetchIcsEvents(icsUrl: string): Promise<IcsCalendarEvent[]> {
  const res = await fetch(icsUrl, { headers: { Accept: 'text/calendar, text/plain' } });
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);
  const text = await res.text();
  return parseIcsCalendarEvents(text).sort((a, b) => a.startISO.localeCompare(b.startISO));
}

interface FeedResult extends StoredFeed {
  events: IcsCalendarEvent[];
  error?: string;
}

async function fetchAllIcsFeeds(feeds: StoredFeed[]): Promise<FeedResult[]> {
  return Promise.all(
    feeds.map(async (feed) => {
      try {
        return { ...feed, events: await fetchIcsEvents(feed.url) };
      } catch {
        return { ...feed, events: [], error: 'Could not reach that calendar feed.' };
      }
    }),
  );
}

/** Read-only backup path for Google Calendar: instead of the OAuth link (which needs a working
 * Google Cloud client and can go stale), the user can paste one or more calendars' "secret
 * address in iCal format" (Google Calendar → Settings → that calendar → Integrate calendar) and
 * get the same events shown here, merged in as non-editable entries. No token to expire, nothing
 * to disconnect. */
async function handleIcsFeed(req: VercelRequest, res: VercelResponse) {
  const email = verifySession(bearerToken(req));
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const key = `fourfold:${email}:googleIcsFeed`;

  if (req.method === 'GET') {
    const feeds = await loadStoredFeeds(key);
    res.status(200).json({ feeds: await fetchAllIcsFeeds(feeds) });
    return;
  }

  if (req.method === 'PUT') {
    const rawFeeds = req.body?.feeds;
    if (!Array.isArray(rawFeeds) || !rawFeeds.every(isStoredFeed)) {
      res.status(400).json({ error: 'Malformed feed list.' });
      return;
    }
    const invalidUrl = rawFeeds.find((f) => !isHttpUrl(normalizeIcsUrl(f.url)));
    if (invalidUrl) {
      res.status(400).json({ error: `"${invalidUrl.label || invalidUrl.url}" does not have a valid URL.` });
      return;
    }
    const feeds: StoredFeed[] = rawFeeds.map((f) => ({ id: f.id, label: f.label, url: normalizeIcsUrl(f.url), color: f.color }));
    await redis.set(key, { feeds });
    res.status(200).json({ feeds: await fetchAllIcsFeeds(feeds) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

/** Single entry point for all Google-integration endpoints, routed by `?action=` — Vercel's
 * Hobby plan caps Serverless Functions per deployment, so the formerly separate
 * googleOAuthStart/googleOAuthCallback/googleAccessToken/googleCalendars/googleIcsFeed handlers
 * live here now. External-facing URLs (registered as OAuth redirect URIs, or called by the
 * client) are preserved via rewrites in vercel.json. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : null;

  switch (action) {
    case 'oauthStart':
      return handleOAuthStart(req, res);
    case 'oauthCallback':
      return handleOAuthCallback(req, res);
    case 'accessToken':
      return handleAccessToken(req, res);
    case 'calendars':
      return handleCalendars(req, res);
    case 'icsFeed':
      return handleIcsFeed(req, res);
    default:
      res.status(400).json({ error: 'Unknown or missing action.' });
  }
}
