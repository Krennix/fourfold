import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_lib/session.js';
import {
  OAuthError,
  SCOPE,
  approveRequest,
  bodyParams,
  exchangeToken,
  originOf,
  parseAuthRequest,
  registerClient,
  revokeAllAssistants,
} from './_lib/oauth.js';

/**
 * OAuth endpoints for the MCP server (see _lib/oauth.ts). One function, routed by `?action=`, with
 * friendly URLs rewritten in vercel.json:
 *
 *   /.well-known/oauth-protected-resource[/api/mcp]  → resource   (RFC 9728 — where to authorize)
 *   /.well-known/oauth-authorization-server          → metadata   (RFC 8414 — endpoints & capabilities)
 *   POST /oauth/register                             → register   (RFC 7591 dynamic client registration)
 *   GET  /oauth/authorize                            → authorize  (bounces to the app's /connect page)
 *   POST /oauth/token                                → token      (code + PKCE → tokens; refresh)
 *
 * Called by the app itself (signed-in session token required):
 *   GET  ?action=client   → who is asking? (name + where they'd be sent back to), for the consent screen
 *   POST ?action=approve  → the user said yes: returns the redirect carrying the single-use code
 *   POST ?action=revoke   → sign out every connected assistant
 */

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function bearer(req: VercelRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice('Bearer '.length) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const action = one(req.query.action);

  // The discovery/registration/token endpoints are called cross-origin by clients (never with cookies).
  if (action === 'resource' || action === 'metadata' || action === 'register' || action === 'token') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Protocol-Version');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
  }

  try {
    const origin = originOf(req);

    switch (action) {
      case 'resource':
        if (req.method !== 'GET') break;
        res.status(200).json({
          resource: `${origin}/api/mcp`,
          resource_name: 'FourFold',
          authorization_servers: [origin],
          bearer_methods_supported: ['header'],
          scopes_supported: [SCOPE],
        });
        return;

      case 'metadata':
        if (req.method !== 'GET') break;
        res.status(200).json({
          issuer: origin,
          authorization_endpoint: `${origin}/oauth/authorize`,
          token_endpoint: `${origin}/oauth/token`,
          registration_endpoint: `${origin}/oauth/register`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
          scopes_supported: [SCOPE],
        });
        return;

      case 'register': {
        if (req.method !== 'POST') break;
        res.status(201).json(registerClient(bodyParams(req.body)).body);
        return;
      }

      case 'authorize': {
        if (req.method !== 'GET') break;
        // Validate before anything else: a bad client/redirect_uri must never be redirected to.
        parseAuthRequest(req.query);
        const url = new URL('/connect', origin);
        for (const [k, v] of Object.entries(req.query)) if (k !== 'action' && v !== undefined) url.searchParams.set(k, one(v) as string);
        res.redirect(302, `${url.pathname}${url.search}`);
        return;
      }

      case 'token':
        if (req.method !== 'POST') break;
        res.status(200).json(await exchangeToken(bodyParams(req.body)));
        return;

      case 'client': {
        if (req.method !== 'GET') break;
        if (!verifySession(bearer(req))) {
          res.status(401).json({ error: 'Sign in required.' });
          return;
        }
        const { client, redirectUri } = parseAuthRequest(req.query);
        res.status(200).json({ name: client.name, redirectHost: new URL(redirectUri).host });
        return;
      }

      case 'approve': {
        if (req.method !== 'POST') break;
        const email = verifySession(bearer(req));
        if (!email) {
          res.status(401).json({ error: 'Sign in required.' });
          return;
        }
        res.status(200).json({ redirect: approveRequest(email, parseAuthRequest(bodyParams(req.body))) });
        return;
      }

      case 'revoke': {
        if (req.method !== 'POST') break;
        const email = verifySession(bearer(req));
        if (!email) {
          res.status(401).json({ error: 'Sign in required.' });
          return;
        }
        await revokeAllAssistants(email);
        res.status(200).json({ ok: true });
        return;
      }

      default:
        res.status(404).json({ error: 'Not found.' });
        return;
    }
    res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    if (err instanceof OAuthError) {
      res.status(err.status).json({ error: err.code, error_description: err.message });
      return;
    }
    console.error('api/oauth failed', err);
    res.status(500).json({ error: 'server_error', error_description: 'Something went wrong on our side.' });
  }
}
