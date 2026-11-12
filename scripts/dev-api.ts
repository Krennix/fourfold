/**
 * Local stand-in for `vercel dev`: serves every `api/*.ts` handler with Bun, adapting Bun's
 * Request/Response to the small subset of VercelRequest/VercelResponse the handlers use.
 *
 * When KV_REST_API_URL isn't set it also serves an in-memory Upstash-compatible Redis at
 * /__redis, so the whole app (sign-in, data sync, API tokens) works offline with no accounts.
 *
 *   bun run dev:api        # API on :3001 — `bun run dev` proxies /api to it
 *
 * Data in the in-memory store is lost when the process exits.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.DEV_API_PORT ?? 3001);
const root = join(import.meta.dir, '..');

const memory = new Map<string, string>();
if (!process.env.KV_REST_API_URL) {
  process.env.KV_REST_API_URL = `http://127.0.0.1:${PORT}/__redis`;
  process.env.KV_REST_API_TOKEN = 'dev';
  console.log('[dev-api] KV_REST_API_URL not set — using an in-memory Redis (data resets on restart)');
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'dev-only-session-secret';
  console.log('[dev-api] SESSION_SECRET not set — using an insecure dev secret');
}

function runRedis(cmd: unknown[]): { result: unknown } | { error: string } {
  const [rawName, ...args] = cmd as [string, ...string[]];
  const name = String(rawName).toLowerCase();
  switch (name) {
    case 'get':
      return { result: memory.get(String(args[0])) ?? null };
    case 'set':
      memory.set(String(args[0]), String(args[1]));
      return { result: 'OK' };
    case 'del': {
      let n = 0;
      for (const k of args) if (memory.delete(String(k))) n++;
      return { result: n };
    }
    case 'exists':
      return { result: args.filter((k) => memory.has(String(k))).length };
    case 'ping':
      return { result: 'PONG' };
    default:
      return { error: `ERR dev-api redis mock does not implement ${name}` };
  }
}

type Handler = (req: unknown, res: unknown) => unknown;
const handlers = new Map<string, Handler>();
for (const file of readdirSync(join(root, 'api'))) {
  if (!file.endsWith('.ts')) continue;
  const mod = await import(join(root, 'api', file));
  handlers.set(file.replace(/\.ts$/, ''), mod.default as Handler);
}

// Mirror vercel.json's rewrites for the legacy flat endpoint names.
const vercelConfig = (await import(join(root, 'vercel.json'))).default as { rewrites: { source: string; destination: string }[] };
function rewrite(url: URL): URL {
  // /api/v1/<anything> → /api/v1?path=<anything> (vercel.json does this on Vercel)
  const v1 = /^\/api\/v1(?:\/(.*))?$/.exec(url.pathname);
  if (v1) {
    const dest = new URL('/api/v1', url.origin);
    url.searchParams.forEach((v, k) => dest.searchParams.set(k, v));
    dest.searchParams.set('path', v1[1] ?? '');
    return dest;
  }
  for (const r of vercelConfig.rewrites) {
    if (r.source === url.pathname && r.destination.startsWith('/api/')) {
      const dest = new URL(r.destination, url.origin);
      url.searchParams.forEach((v, k) => dest.searchParams.set(k, v));
      return dest;
    }
  }
  return url;
}

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(request) {
    let url = new URL(request.url);

    if (url.pathname.startsWith('/__redis')) {
      const body = await request.json();
      if (url.pathname.endsWith('/pipeline') || url.pathname.endsWith('/multi-exec')) {
        return Response.json((body as unknown[][]).map(runRedis));
      }
      return Response.json(runRedis(body as unknown[]));
    }

    url = rewrite(url);
    const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
    const handler = handlers.get(name);
    if (!handler) return Response.json({ error: `No handler for ${url.pathname}` }, { status: 404 });

    const query: Record<string, string | string[]> = {};
    url.searchParams.forEach((v, k) => {
      const prev = query[k];
      query[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
    });
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => (headers[k] = v));
    // Vercel reports the public host; behind the Vite proxy that's the forwarded one.
    if (headers['x-forwarded-host']) headers.host = headers['x-forwarded-host'];

    const raw = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
    let body: unknown = raw || undefined;
    if (raw && (headers['content-type'] ?? '').includes('application/json')) {
      try { body = JSON.parse(raw); } catch { body = raw; }
    }

    return await new Promise<Response>((resolve) => {
      let status = 200;
      const outHeaders = new Headers();
      let done = false;
      const finish = (payload: BodyInit | null) => {
        if (done) return;
        done = true;
        resolve(new Response(payload, { status, headers: outHeaders }));
      };
      const res = {
        status(code: number) { status = code; return res; },
        setHeader(k: string, v: string) { outHeaders.set(k, v); return res; },
        json(v: unknown) { outHeaders.set('Content-Type', 'application/json'); finish(JSON.stringify(v)); return res; },
        send(v: unknown) { finish(typeof v === 'string' ? v : JSON.stringify(v)); return res; },
        end(v?: string) { finish(v ?? null); return res; },
        redirect(a: number | string, b?: string) {
          status = typeof a === 'number' ? a : 307;
          outHeaders.set('Location', typeof a === 'string' ? a : (b ?? '/'));
          finish(null);
          return res;
        },
      };
      const req = { method: request.method, url: url.pathname + url.search, query, headers, body };
      Promise.resolve(handler(req, res)).then(
        () => finish(null),
        (err: unknown) => {
          console.error(`[dev-api] ${name} threw`, err);
          status = 500;
          outHeaders.set('Content-Type', 'application/json');
          finish(JSON.stringify({ error: err instanceof Error ? err.message : 'Handler failed' }));
        },
      );
    });
  },
});

console.log(`[dev-api] serving ${[...handlers.keys()].map((h) => `/api/${h}`).join(', ')} on http://127.0.0.1:${PORT}`);
