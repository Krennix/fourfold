const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API_BASE = 'https://www.googleapis.com/calendar/v3';

let tokenClient: ReturnType<NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']> | null = null;
let tokenClientForId: string | null = null;

export function getTokenClient(
  clientId: string,
  onToken: (token: string, expiresInSeconds: number) => void,
  onError: (message: string) => void,
) {
  if (!window.google) throw new Error('Google Identity Services script has not loaded yet');
  if (tokenClient && tokenClientForId === clientId) return tokenClient;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
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
  tokenClientForId = clientId;
  return tokenClient;
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

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

export async function listEvents(accessToken: string, timeMin: Date, timeMax: Date): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const data = await calendarFetch(accessToken, `/calendars/primary/events?${params}`);
  return data.items ?? [];
}

export async function insertEvent(
  accessToken: string,
  event: { summary: string; startISO: string; endISO: string },
): Promise<GoogleCalendarEvent> {
  return calendarFetch(accessToken, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify({
      summary: event.summary,
      start: { dateTime: event.startISO },
      end: { dateTime: event.endISO },
    }),
  });
}

export async function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  await calendarFetch(accessToken, `/calendars/primary/events/${eventId}`, { method: 'DELETE' });
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  event: { summary?: string; startISO?: string; endISO?: string },
): Promise<GoogleCalendarEvent> {
  return calendarFetch(accessToken, `/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(event.summary !== undefined ? { summary: event.summary } : {}),
      ...(event.startISO ? { start: { dateTime: event.startISO } } : {}),
      ...(event.endISO ? { end: { dateTime: event.endISO } } : {}),
    }),
  });
}
