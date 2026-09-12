import { createHmac, randomBytes } from 'node:crypto';

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
}

/**
 * Builds a signed `Authorization` header for a two-legged OAuth 1.0a request (RFC 5849,
 * HMAC-SHA1) — used for Schoology's personal API access, which authenticates with a consumer
 * key/secret (identifying the app) plus a user key/secret (identifying the account) rather than
 * a bearer token.
 */
export function buildOAuth1Header(method: string, url: string, creds: OAuth1Credentials): string {
  const parsed = new URL(url);
  const baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_token: creds.token,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_version: '1.0',
  };

  const allParams: [string, string][] = Object.entries(oauthParams);
  for (const [key, value] of parsed.searchParams) allParams.push([key, value]);

  const paramString = allParams
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const signatureBase = [method.toUpperCase(), percentEncode(baseUrl), percentEncode(paramString)].join('&');
  const signingKey = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.tokenSecret)}`;
  const signature = createHmac('sha1', signingKey).update(signatureBase).digest('base64');

  const headerParams = { ...oauthParams, oauth_signature: signature };
  return `OAuth ${Object.entries(headerParams)
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(', ')}`;
}
