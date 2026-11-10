import { Redis } from '@upstash/redis';
import { getRefreshToken, deleteRefreshToken } from './googleTokens.js';
import { InvalidGrantError, refreshAccessToken } from './googleOAuth.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

const API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface LinkedCalendar {
  id: string;
  summary: string;
  color: string;
  selected: boolean;
  colorOverride?: string;
}

export interface LinkedAccount {
  email: string;
  calendars: LinkedCalendar[];
}

export async function loadLinkedAccounts(appEmail: string): Promise<LinkedAccount[]> {
  const stored = await redis.get<{ accounts?: LinkedAccount[] }>(`fourfold:${appEmail}:googleCalendars`);
  return stored?.accounts ?? [];
}

/** Mints a short-lived access token for one linked Google account; null if it isn't linked or
 * Google revoked the grant (in which case the stale refresh token is dropped). */
export async function accessTokenFor(appEmail: string, googleEmail: string): Promise<string | null> {
  const refreshToken = await getRefreshToken(appEmail, googleEmail);
  if (!refreshToken) return null;
  try {
    return (await refreshAccessToken(refreshToken)).accessToken;
  } catch (err) {
    if (err instanceof InvalidGrantError) await deleteRefreshToken(appEmail, googleEmail);
    return null;
  }
}

export interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

async function gfetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) throw new Error(`Google Calendar returned ${res.status}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

export async function listGoogleEvents(accessToken: string, calendarId: string, timeMin: Date, timeMax: Date): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const data = await gfetch<{ items?: GoogleEvent[] }>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  return data.items ?? [];
}

export interface GoogleEventInput {
  title?: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  /** "YYYY-MM-DD" */
  date?: string;
  /** "HH:MM" wall-clock time in `timeZone` */
  startTime?: string;
  endTime?: string;
  /** "YYYY-MM-DD" end date (exclusive for all-day). Defaults to `date`. */
  endDate?: string;
  timeZone: string;
}

function body(input: GoogleEventInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.summary = input.title;
  if (input.description !== undefined) out.description = input.description;
  if (input.location !== undefined) out.location = input.location;
  if (input.date) {
    if (input.allDay) {
      const end = input.endDate ?? nextDay(input.date);
      out.start = { date: input.date };
      out.end = { date: end };
    } else if (input.startTime && input.endTime) {
      out.start = { dateTime: `${input.date}T${input.startTime}:00`, timeZone: input.timeZone };
      out.end = { dateTime: `${input.endDate ?? input.date}T${input.endTime}:00`, timeZone: input.timeZone };
    }
  }
  return out;
}

function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export const insertGoogleEvent = (token: string, calendarId: string, input: GoogleEventInput) =>
  gfetch<GoogleEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: JSON.stringify(body(input)) });

export const patchGoogleEvent = (token: string, calendarId: string, eventId: string, input: GoogleEventInput) =>
  gfetch<GoogleEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify(body(input)) });

export const deleteGoogleEvent = (token: string, calendarId: string, eventId: string) =>
  gfetch<null>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
