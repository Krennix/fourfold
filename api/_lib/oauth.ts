import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';
import type { VercelRequest } from '@vercel/node';

/**
 * Minimal OAuth 2.1 authorization server for the MCP endpoint (api/mcp.ts), so clients that only
 * speak OAuth — claude.ai / Claude Desktop custom connectors, Gemini CLI without a header — can
 * connect. Clients self-register (RFC 7591), the user approves on /connect inside the signed-in
 * app, and the client trades a PKCE-protected code for tokens.
 *
 * Everything is stateless and HMAC-signed with SESSION_SECRET — each kind of token is signed under
 * its own domain prefix, so a client id, code, access token or refresh token can never be replayed
 * as another kind (or as an app session token). Only two bits of server state exist: single-use
 * authorization codes and a per-account "revoked before" timestamp ("Disconnect assistants").
 *
 * The access tokens issued here are accepted by /api/mcp *only* — unlike a session token they can't
 * call /api/data, the agent, or anything else.
 */

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

export const ACCESS_TTL_S = 60 * 60; // 1 hour
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CODE_TTL_MS = 5 * 60 * 1000;
export const SCOPE = 'fourfold';

type Kind = 'client' | 'code' | 'access' | 'refresh';

export class OAuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not configured');
  return s;
}

function sign(kind: Kind, encoded: string): string {
  return createHmac('sha256', secret()).update(`fourfold-oauth:${kind}:${encoded}`).digest('base64url');
}

function seal(kind: Kind, payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(kind, encoded)}`;
}

function unseal<T extends { exp?: number }>(kind: Kind, token: string | undefined | null): T | null {
  if (!token) return null;
  const [encoded, sig, extra] = token.split('.');
  if (!encoded || !sig || extra !== undefined) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(kind, encoded));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
    if (typeof payload.exp === 'number' && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── clients (dynamic registration) ──────────────────────────────────────────────────

interface ClientPayload {
  n: string;
  r: string[];
  iat: number;
  exp?: undefined;
}

export interface Client {
  id: string;
  name: string;
  redirectUris: string[];
}

const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

/** https anywhere, or http only to the local machine (desktop/CLI clients). No custom schemes. */
export function validRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 500) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === 'https:') return !!u.hostname;
  return u.protocol === 'http:' && isLoopback(u.hostname);
}

export function registerClient(meta: Record<string, unknown>): { client_id: string; body: Record<string, unknown> } {
  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5 || !uris.every(validRedirectUri)) {
    throw new OAuthError(400, 'invalid_redirect_uri', 'redirect_uris must be 1–5 https URLs (or http://localhost URLs).');
  }
  const method = meta.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none') {
    throw new OAuthError(400, 'invalid_client_metadata', 'Only public clients are supported (token_endpoint_auth_method "none") — use PKCE.');
  }
  const name = (typeof meta.client_name === 'string' ? meta.client_name : '').replace(/\p{Cc}/gu, '').trim().slice(0, 80) || 'An AI assistant';
  const iat = Date.now();
  const client_id = `ffc_${seal('client', { n: name, r: uris, iat } satisfies ClientPayload)}`;
  return {
    client_id,
    body: {
      client_id,
      client_id_issued_at: Math.floor(iat / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    },
  };
}

export function loadClient(clientId: unknown): Client {
  const payload = typeof clientId === 'string' && clientId.startsWith('ffc_') ? unseal<ClientPayload>('client', clientId.slice(4)) : null;
  if (!payload) throw new OAuthError(400, 'invalid_client', 'Unknown client_id — register the client first.');
  return { id: clientId as string, name: payload.n, redirectUris: payload.r };
}

// ── authorization requests ──────────────────────────────────────────────────────────

export interface AuthRequest {
  client: Client;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : undefined);

/** Validates /authorize parameters. Anything wrong with the client or redirect_uri must NOT redirect. */
export function parseAuthRequest(params: Record<string, unknown>): AuthRequest {
  const client = loadClient(str(params.client_id));
  const redirectUri = str(params.redirect_uri);
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) throw new OAuthError(400, 'invalid_request', 'redirect_uri does not match this client\'s registration.');
  if (str(params.response_type) !== 'code') throw new OAuthError(400, 'unsupported_response_type', 'Only response_type=code is supported.');
  const codeChallenge = str(params.code_challenge);
  if (!codeChallenge || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) || str(params.code_challenge_method) !== 'S256') {
    throw new OAuthError(400, 'invalid_request', 'PKCE is required: send code_challenge (S256) and code_challenge_method=S256.');
  }
  const state = str(params.state);
  if (state !== undefined && state.length > 1000) throw new OAuthError(400, 'invalid_request', 'state is too long.');
  return { client, redirectUri, codeChallenge, state: state ?? null };
}

/** Mints the redirect that hands the user back to the client with a single-use code. */
export function approveRequest(email: string, req: AuthRequest): string {
  const code = seal('code', { email, cid: req.client.id, ru: req.redirectUri, cc: req.codeChallenge, jti: randomBytes(12).toString('hex'), exp: Date.now() + CODE_TTL_MS });
  const url = new URL(req.redirectUri);
  url.searchParams.set('code', code);
  if (req.state !== null) url.searchParams.set('state', req.state);
  return url.toString();
}

// ── token endpoint ──────────────────────────────────────────────────────────────────

interface CodePayload { email: string; cid: string; ru: string; cc: string; jti: string; exp: number }
interface AccessPayload { email: string; iat: number; exp: number }
interface RefreshPayload { email: string; cid: string; iat: number; exp: number }

const revokedKey = (email: string) => `fourfold:${email}:oauthRevokedBefore`;

async function revokedBefore(email: string): Promise<number> {
  return Number((await redis.get<number | string>(revokedKey(email))) ?? 0) || 0;
}

/** Signs every assistant out: all access/refresh tokens issued so far stop working. */
export async function revokeAllAssistants(email: string): Promise<void> {
  await redis.set(revokedKey(email), Date.now());
}

function issueTokens(email: string, clientId: string) {
  const now = Date.now();
  return {
    access_token: `ffo_${seal('access', { email, iat: now, exp: now + ACCESS_TTL_S * 1000 } satisfies AccessPayload)}`,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_S,
    refresh_token: `ffr_${seal('refresh', { email, cid: clientId, iat: now, exp: now + REFRESH_TTL_MS } satisfies RefreshPayload)}`,
    scope: SCOPE,
  };
}

const grantError = (msg: string) => new OAuthError(400, 'invalid_grant', msg);

export async function exchangeToken(params: Record<string, unknown>) {
  const grant = str(params.grant_type);
  const clientId = str(params.client_id);

  if (grant === 'authorization_code') {
    const code = unseal<CodePayload>('code', str(params.code));
    if (!code) throw grantError('The authorization code is invalid or has expired.');
    if (code.cid !== clientId) throw grantError('The code was issued to a different client.');
    if (code.ru !== str(params.redirect_uri)) throw grantError('redirect_uri does not match the authorization request.');
    const verifier = str(params.code_verifier);
    if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw grantError('code_verifier is missing or malformed.');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const a = Buffer.from(challenge);
    const b = Buffer.from(code.cc);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw grantError('code_verifier does not match the code_challenge.');
    // Single use: the first redemption claims the code id; a replay finds it taken.
    const claimed = await redis.set(`fourfold:oauthCodeUsed:${code.jti}`, 1, { nx: true, ex: Math.ceil(CODE_TTL_MS / 1000) + 60 });
    if (claimed === null) throw grantError('That authorization code was already used.');
    return issueTokens(code.email, code.cid);
  }

  if (grant === 'refresh_token') {
    const raw = str(params.refresh_token);
    const refresh = raw?.startsWith('ffr_') ? unseal<RefreshPayload>('refresh', raw.slice(4)) : null;
    if (!refresh) throw grantError('The refresh token is invalid or has expired.');
    if (refresh.cid !== clientId) throw grantError('The refresh token was issued to a different client.');
    if (refresh.iat <= (await revokedBefore(refresh.email))) throw grantError('Access was revoked. Connect again from your assistant.');
    return issueTokens(refresh.email, refresh.cid);
  }

  throw new OAuthError(400, 'unsupported_grant_type', 'Supported grant types: authorization_code, refresh_token.');
}

/** Resolves an OAuth access token (from /api/mcp's Authorization header) to its account, or null. */
export async function verifyAccessToken(token: string | null): Promise<string | null> {
  if (!token?.startsWith('ffo_')) return null;
  const access = unseal<AccessPayload>('access', token.slice(4));
  if (!access) return null;
  return access.iat > (await revokedBefore(access.email)) ? access.email : null;
}

// ── request helpers ─────────────────────────────────────────────────────────────────

/** Public origin of this deployment, e.g. https://fourfold.vercel.app (http for localhost). */
export function originOf(req: VercelRequest): string {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(',')[0].trim();
  const host = first(req.headers['x-forwarded-host']) ?? first(req.headers.host) ?? 'localhost';
  const proto = first(req.headers['x-forwarded-proto']) ?? (/^(localhost|127\.|\[::1\])/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const resourceMetadataUrl = (req: VercelRequest) => `${originOf(req)}/.well-known/oauth-protected-resource/api/mcp`;

/** Token/registration bodies arrive as form-encoded (the spec) or JSON, parsed or raw depending on the host. */
export function bodyParams(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  if (typeof body === 'string' && body) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* not JSON — form-encoded */
    }
    return Object.fromEntries(new URLSearchParams(body));
  }
  return {};
}
