import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifySession } from './_lib/session.js';
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
}

function isStoredFeed(value: unknown): value is StoredFeed {
  if (!value || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  return typeof f.id === 'string' && typeof f.label === 'string' && typeof f.url === 'string';
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

async function fetchEvents(icsUrl: string): Promise<IcsCalendarEvent[]> {
  const res = await fetch(icsUrl, { headers: { Accept: 'text/calendar, text/plain' } });
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);
  const text = await res.text();
  return parseIcsCalendarEvents(text).sort((a, b) => a.startISO.localeCompare(b.startISO));
}

interface FeedResult extends StoredFeed {
  events: IcsCalendarEvent[];
  error?: string;
}

async function fetchAll(feeds: StoredFeed[]): Promise<FeedResult[]> {
  return Promise.all(
    feeds.map(async (feed) => {
      try {
        return { ...feed, events: await fetchEvents(feed.url) };
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
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = verifySession(bearerToken(req));
  if (!email) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const key = `fourfold:${email}:googleIcsFeed`;

  if (req.method === 'GET') {
    const feeds = await loadStoredFeeds(key);
    res.status(200).json({ feeds: await fetchAll(feeds) });
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
    const feeds: StoredFeed[] = rawFeeds.map((f) => ({ id: f.id, label: f.label, url: normalizeIcsUrl(f.url) }));
    await redis.set(key, { feeds });
    res.status(200).json({ feeds: await fetchAll(feeds) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
