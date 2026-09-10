const API_BASE = 'https://api.spotify.com/v1';
const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

/** Thrown when Spotify rejects the access token itself (401) — the caller should mint a fresh
 * token from the server (`/api/spotifyAccessToken`) and retry once. */
export class SpotifyAuthError extends Error {}

/** Thrown on 403/404 from the player endpoints — usually "no active device" or "not Premium",
 * which the UI should explain rather than treat as a transient failure. */
export class SpotifyPlaybackError extends Error {}

async function spotifyFetch(accessToken: string, path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw new SpotifyAuthError('Spotify access token expired or invalid.');
  if (res.status === 403 || res.status === 404) {
    const body = await res.text();
    throw new SpotifyPlaybackError(body || `Spotify API error ${res.status}`);
  }
  if (!res.ok) throw new Error(`Spotify API error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export interface PlaybackState {
  isPlaying: boolean;
  trackName: string;
  artistNames: string;
  albumArt: string | null;
  progressMs: number;
  durationMs: number;
  deviceId: string | null;
  deviceName: string | null;
}

export async function getPlaybackState(accessToken: string): Promise<PlaybackState | null> {
  const data = (await spotifyFetch(accessToken, '/me/player')) as Record<string, unknown> | null;
  if (!data || !data.item) return null;
  const item = data.item as Record<string, unknown>;
  const album = item.album as Record<string, unknown> | undefined;
  const images = (album?.images as { url: string }[] | undefined) ?? [];
  const device = data.device as Record<string, unknown> | undefined;
  return {
    isPlaying: Boolean(data.is_playing),
    trackName: String(item.name ?? ''),
    artistNames: ((item.artists as { name: string }[] | undefined) ?? []).map((a) => a.name).join(', '),
    albumArt: images[0]?.url ?? null,
    progressMs: Number(data.progress_ms ?? 0),
    durationMs: Number(item.duration_ms ?? 0),
    deviceId: (device?.id as string | undefined) ?? null,
    deviceName: (device?.name as string | undefined) ?? null,
  };
}

export async function play(accessToken: string, deviceId?: string): Promise<void> {
  const qs = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
  await spotifyFetch(accessToken, `/me/player/play${qs}`, { method: 'PUT' });
}

export async function pause(accessToken: string): Promise<void> {
  await spotifyFetch(accessToken, '/me/player/pause', { method: 'PUT' });
}

export async function skipNext(accessToken: string): Promise<void> {
  await spotifyFetch(accessToken, '/me/player/next', { method: 'POST' });
}

export async function skipPrevious(accessToken: string): Promise<void> {
  await spotifyFetch(accessToken, '/me/player/previous', { method: 'POST' });
}

export async function transferPlayback(accessToken: string, deviceId: string, play = true): Promise<void> {
  await spotifyFetch(accessToken, '/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play }),
  });
}

export async function playPlaylist(accessToken: string, playlistUri: string, deviceId?: string): Promise<void> {
  const qs = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
  await spotifyFetch(accessToken, `/me/player/play${qs}`, {
    method: 'PUT',
    body: JSON.stringify({ context_uri: playlistUri }),
  });
}

let sdkLoadPromise: Promise<void> | null = null;

/** Loads the Spotify Web Playback SDK script once and resolves when it signals ready. Safe to
 * call more than once — later callers share the first load. */
function loadSpotifySdk(): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

export interface BrowserPlayerHandle {
  deviceId: string;
  disconnect: () => void;
}

/** Spins up an in-tab Spotify player ("Fourfold Pomodoro" in the user's device list) via the
 * Web Playback SDK. Requires a Premium account — Spotify silently refuses to stream to SDK
 * players on Free accounts even though the SDK itself loads fine. `getAccessToken` is called
 * each time the SDK asks for a token, so refreshes go through the normal server-backed flow. */
export async function createBrowserPlayer(
  getAccessToken: () => Promise<string | null>,
  onStateChange: (state: Spotify.PlaybackState | null) => void,
): Promise<BrowserPlayerHandle> {
  await loadSpotifySdk();
  return new Promise((resolve, reject) => {
    const player = new window.Spotify.Player({
      name: 'Fourfold Pomodoro',
      getOAuthToken: (cb) => {
        void getAccessToken().then((token) => cb(token ?? ''));
      },
      volume: 0.6,
    });

    player.addListener('player_state_changed', (state) => onStateChange(state));
    player.addListener('initialization_error', ({ message }) => reject(new Error(message)));
    player.addListener('authentication_error', ({ message }) => reject(new Error(message)));
    player.addListener('account_error', ({ message }) => reject(new Error(`Spotify Premium is required for in-browser playback: ${message}`)));

    player.addListener('ready', ({ device_id }) => {
      resolve({
        deviceId: device_id,
        disconnect: () => player.disconnect(),
      });
    });

    void player.connect();
  });
}
