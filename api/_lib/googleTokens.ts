import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

function tokensKey(appEmail: string): string {
  return `fourfold:${appEmail}:googleRefreshTokens`;
}

/** Refresh tokens for every Google account an app user has linked, keyed by that Google
 * account's own email. Stored server-side only — never sent to the browser. */
export async function getRefreshToken(appEmail: string, googleEmail: string): Promise<string | null> {
  const stored = (await redis.get<Record<string, string>>(tokensKey(appEmail))) ?? {};
  return stored[googleEmail] ?? null;
}

export async function setRefreshToken(appEmail: string, googleEmail: string, refreshToken: string): Promise<void> {
  const stored = (await redis.get<Record<string, string>>(tokensKey(appEmail))) ?? {};
  stored[googleEmail] = refreshToken;
  await redis.set(tokensKey(appEmail), stored);
}

export async function deleteRefreshToken(appEmail: string, googleEmail: string): Promise<string | null> {
  const stored = (await redis.get<Record<string, string>>(tokensKey(appEmail))) ?? {};
  const existing = stored[googleEmail] ?? null;
  if (existing) {
    delete stored[googleEmail];
    await redis.set(tokensKey(appEmail), stored);
  }
  return existing;
}

const NONCE_TTL_SECONDS = 10 * 60;

function nonceKey(nonce: string): string {
  return `fourfold:oauthNonce:${nonce}`;
}

/** Short-lived one-time nonce carrying which app user a popup OAuth round-trip belongs to —
 * used as the `state` param so we never put the app session token itself in a URL that goes
 * to Google and back through browser history/referrers. */
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
