const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const API_BASE = 'https://www.googleapis.com/calendar/v3';

type GoogleTokenClient = ReturnType<NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']>;

const tokenClients = new Map<string, GoogleTokenClient>();

/**
 * One GIS token client per linked account, cached by account email (or a
 * temporary key like 'new' while acquiring an as-yet-unknown account) so
 * concurrently held tokens for different accounts don't clobber each other.
 */
export function getTokenClient(
  key: string,
  clientId: string,
  onToken: (token: string, expiresInSeconds: number) => void,
  onError: (message: string) => void,
) {
  if (!window.google) throw new Error('Google Identity Services script has not loaded yet');
  const existing = tokenClients.get(key);
  if (existing) return existing;
  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: CALENDAR_SCOPE,
    callback: (response) => {
      if (response.error) {
        onError(response.error_description || response.error);
        return;
      }
      onToken(response.access_token, response.expires_in);
    },
    error_callback: (error) => onError(error.message || error.type),
  });
  tokenClients.set(key, client);
  return client;
}

export function dropTokenClient(key: string) {
  tokenClients.delete(key);
}

export function revokeToken(accessToken: string) {
  window.google?.accounts.oauth2.revoke(accessToken);
}

async function calendarFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar API error ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function fetchPrimaryCalendarEmail(accessToken: string): Promise<string> {
  const data = await calendarFetch(accessToken, '/calendars/primary');
  return data.id;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  backgroundColor: string;
  primary?: boolean;
}

export async function listCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const data = await calendarFetch(accessToken, '/users/me/calendarList');
  return (data.items ?? []).map((item: Record<string, unknown>) => ({
    id: item.id,
    summary: (item.summary as string) ?? (item.id as string),
    backgroundColor: (item.backgroundColor as string) ?? '#4285f4',
    primary: item.primary === true,
  }));
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const data = await calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  return data.items ?? [];
}

export interface EventTiming {
  /** All-day events use date-only strings ("YYYY-MM-DD"); timed events use full ISO datetimes. */
  allDay?: boolean;
  startISO: string;
  endISO: string;
}

export async function insertEvent(
  accessToken: string,
  calendarId: string,
  event: { summary: string; description?: string; location?: string } & EventTiming,
): Promise<GoogleCalendarEvent> {
  return calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: event.summary,
      ...(event.description !== undefined ? { description: event.description } : {}),
      ...(event.location !== undefined ? { location: event.location } : {}),
      start: event.allDay ? { date: event.startISO } : { dateTime: event.startISO },
      end: event.allDay ? { date: event.endISO } : { dateTime: event.endISO },
    }),
  });
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  await calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: 'DELETE',
  });
}

export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: { summary?: string; description?: string; location?: string } & Partial<EventTiming>,
): Promise<GoogleCalendarEvent> {
  return calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(event.summary !== undefined ? { summary: event.summary } : {}),
      ...(event.description !== undefined ? { description: event.description } : {}),
      ...(event.location !== undefined ? { location: event.location } : {}),
      ...(event.startISO ? { start: event.allDay ? { date: event.startISO } : { dateTime: event.startISO } } : {}),
      ...(event.endISO ? { end: event.allDay ? { date: event.endISO } : { dateTime: event.endISO } } : {}),
    }),
  });
}
