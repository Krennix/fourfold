const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const API_BASE = 'https://api.spotify.com/v1';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? '';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

export function spotifyOAuthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export interface SpotifyTokenSet {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken?: string;
}

/** Thrown when Spotify reports the refresh token itself is no longer valid (revoked, expired,
 * or the user removed this app's access) — distinct from a transient network/API error, since
 * the caller needs to stop retrying and ask the user to reconnect instead. */
export class InvalidGrantError extends Error {
  constructor() {
    super('Spotify refresh token is no longer valid');
    this.name = 'InvalidGrantError';
  }
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
}

async function postToken(params: Record<string, string>): Promise<SpotifyTokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
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
    throw new Error(body.error_description || body.error || `Spotify token endpoint returned ${res.status}`);
  }
  return { accessToken: body.access_token as string, expiresInSeconds: body.expires_in as number, refreshToken: body.refresh_token };
}

export function redirectUriFor(origin: string): string {
  return `${origin}/api/spotifyOAuthCallback`;
}

export function buildAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUriFor(origin),
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeCodeForTokens(code: string, origin: string): Promise<SpotifyTokenSet> {
  return postToken({
    code,
    redirect_uri: redirectUriFor(origin),
    grant_type: 'authorization_code',
  });
}

/** Mints a fresh access token from a stored refresh token. Throws `InvalidGrantError` if the
 * refresh token has been revoked/expired — the caller should drop the stored token in that case. */
export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenSet> {
  return postToken({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
}

export interface SpotifyProfile {
  id: string;
  displayName: string;
  /** 'premium' | 'free' | 'open' — only 'premium' accounts can use Connect playback control
   * or the in-browser Web Playback SDK player. */
  product: string;
}

export async function fetchProfile(accessToken: string): Promise<SpotifyProfile> {
  const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Could not read the Spotify account profile (${res.status})`);
  const body = (await res.json()) as { id: string; display_name: string | null; product: string };
  return { id: body.id, displayName: body.display_name ?? body.id, product: body.product };
}
