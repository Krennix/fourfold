import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_lib/session.js';
import { resolveApiToken } from './_lib/apiTokens.js';
import { HttpError, bad, makeCtx, route, type RouteResult } from './_lib/fourfold.js';

/**
 * FourFold public REST API — one function (Vercel's Hobby plan caps function count) routed by
 * path: /api/v1/<resource>[/<id>], rewritten to /api/v1?path=<resource>/<id> in vercel.json.
 * The routes themselves live in _lib/fourfold.ts (shared with the MCP server, api/mcp.ts).
 *
 * Auth: `Authorization: Bearer <token>` — a personal API token (Settings → Personal API access)
 * or a signed-in session token. Every endpoint reads and writes the same data the app shows.
 * Dates are ISO ("YYYY-MM-DD"), times are 24-hour "HH:MM", in the timezone given by `?tz=`
 * (an IANA name like "America/Los_Angeles"; default UTC).
 */

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const token = bearerToken(req);
    const email = verifySession(token) ?? (token ? await resolveApiToken(token) : null);
    if (!email) {
      res.status(401).json({ error: 'Sign in required — send a personal API token as "Authorization: Bearer <token>".' });
      return;
    }

    const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : (req.query.path ?? '');
    const segs = rawPath.split('/').filter(Boolean);
    const resource = segs[0] ?? '';
    const id = segs.length > 1 ? decodeURIComponent(segs.slice(1).join('/')) : null;

    const tzRaw = req.query.tz ?? req.headers['x-timezone'];
    const method = req.method ?? 'GET';
    const body: Record<string, unknown> = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
    if ((method === 'POST' || method === 'PATCH') && req.body !== undefined && req.body !== null && (typeof req.body !== 'object' || Array.isArray(req.body))) {
      throw bad('Send a JSON object as the request body (Content-Type: application/json).');
    }

    const ctx = makeCtx(email, Array.isArray(tzRaw) ? tzRaw[0] : tzRaw, method, req.query, body);
    const result: RouteResult = await route(ctx, resource, id);
    res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('api/v1 failed', err);
    res.status(500).json({ error: 'Something went wrong on our side.' });
  }
}
