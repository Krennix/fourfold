import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

function accountKey(appEmail: string): string {
  return `fourfold:${appEmail}:spotify`;
}

export interface StoredSpotifyAccount {
  refreshToken: string;
  spotifyUserId: string;
  displayName: string;
  product: string;
}

/** A single linked Spotify account per app user — unlike Google Calendar, there's no case here
 * for juggling multiple accounts. Stored server-side only — never sent to the browser. */
export async function getSpotifyAccount(appEmail: string): Promise<StoredSpotifyAccount | null> {
  return (await redis.get<StoredSpotifyAccount>(accountKey(appEmail))) ?? null;
}

export async function setSpotifyAccount(appEmail: string, account: StoredSpotifyAccount): Promise<void> {
  await redis.set(accountKey(appEmail), account);
}

export async function deleteSpotifyAccount(appEmail: string): Promise<void> {
  await redis.del(accountKey(appEmail));
}

const NONCE_TTL_SECONDS = 10 * 60;

function nonceKey(nonce: string): string {
  return `fourfold:oauthNonceSpotify:${nonce}`;
}

/** Short-lived one-time nonce carrying which app user a popup OAuth round-trip belongs to —
 * used as the `state` param so we never put the app session token itself in a URL that goes
 * to Spotify and back through browser history/referrers. */
export async function createOAuthNonce(appEmail: string): Promise<string> {
  const nonce = crypto.randomUUID();
  await redis.set(nonceKey(nonce), appEmail, { ex: NONCE_TTL_SECONDS });
  return nonce;
}

export async function consumeOAuthNonce(nonce: string): Promise<string | null> {
  const appEmail = await redis.get<string>(nonceKey(nonce));
  if (appEmail) await redis.del(nonceKey(nonce));
  return appEmail ?? null;
}
