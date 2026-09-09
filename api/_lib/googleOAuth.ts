const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

export function googleOAuthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export interface GoogleTokenSet {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken?: string;
}

/** Thrown when Google reports the refresh token itself is no longer valid (revoked, expired,
 * or the user removed this app's access) — distinct from a transient network/API error, since
 * the caller needs to stop retrying and ask the user to reconnect instead. */
export class InvalidGrantError extends Error {
  constructor() {
    super('Google refresh token is no longer valid');
    this.name = 'InvalidGrantError';
  }
}

async function postToken(params: Record<string, string>): Promise<GoogleTokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    error_description?: string;
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!res.ok) {
    if (body.error === 'invalid_grant') throw new InvalidGrantError();
    throw new Error(body.error_description || body.error || `Google token endpoint returned ${res.status}`);
  }
  return { accessToken: body.access_token as string, expiresInSeconds: body.expires_in as number, refreshToken: body.refresh_token };
}

export function redirectUriFor(origin: string): string {
  return `${origin}/api/googleOAuthCallback`;
}

export function buildAuthUrl(origin: string, state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUriFor(origin),
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
    state,
    include_granted_scopes: 'true',
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(code: string, origin: string): Promise<GoogleTokenSet> {
  return postToken({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: redirectUriFor(origin),
    grant_type: 'authorization_code',
  });
}

/** Mints a fresh access token from a stored refresh token. Throws `InvalidGrantError` if the
 * refresh token has been revoked/expired — the caller should drop the stored token in that case. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenSet> {
  return postToken({
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => {
    // best-effort — the local record is deleted regardless
  });
}

export async function fetchPrimaryCalendarEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${CALENDAR_API}/calendars/primary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Could not read the account's primary calendar (${res.status})`);
  const body = (await res.json()) as { id: string };
  return body.id;
}
