import { Redis } from '@upstash/redis';
import { parseIcsCalendarEvents, type IcsCalendarEvent } from './ics.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

export interface StoredFeed {
  id: string;
  label: string;
  url: string;
  color?: string;
}

export function isStoredFeed(value: unknown): value is StoredFeed {
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

export async function loadStoredFeeds(key: string): Promise<StoredFeed[]> {
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

export interface FeedResult extends StoredFeed {
  events: IcsCalendarEvent[];
  error?: string;
}

export async function fetchAllIcsFeeds(feeds: StoredFeed[]): Promise<FeedResult[]> {
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

