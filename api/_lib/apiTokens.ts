import { randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

/**
 * Long-lived, revocable personal API tokens — separate from the short-lived (30 day) signed
 * session tokens minted at sign-in, which require an interactive Google sign-in popup to renew
 * and so can't be used by an unattended process (e.g. a scheduled daily-brief fetch). A token is
 * an opaque random string looked up in Redis (forward: token -> email) rather than a signed JWT,
 * since it must be individually revocable without invalidating anything else.
 */
function forwardKey(token: string): string {
  return `fourfold:apiToken:${token}`;
}

function reverseKey(email: string): string {
  return `fourfold:${email}:apiToken`;
}

export async function getApiToken(email: string): Promise<string | null> {
  return (await redis.get<string>(reverseKey(email))) ?? null;
}

/** Creates a new token, replacing (and invalidating) any existing one for this account. */
export async function generateApiToken(email: string): Promise<string> {
  const existing = await getApiToken(email);
  if (existing) await redis.del(forwardKey(existing));

  const token = `ff_${randomBytes(24).toString('hex')}`;
  await redis.set(forwardKey(token), email);
  await redis.set(reverseKey(email), token);
  return token;
}

export async function revokeApiToken(email: string): Promise<void> {
  const existing = await getApiToken(email);
  if (existing) await redis.del(forwardKey(existing));
  await redis.del(reverseKey(email));
}

/** Resolves a personal API token to the account it belongs to, or null if it's unknown/revoked. */
export async function resolveApiToken(token: string): Promise<string | null> {
  if (!token.startsWith('ff_')) return null;
  return (await redis.get<string>(forwardKey(token))) ?? null;
}
