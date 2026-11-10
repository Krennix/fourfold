/**
 * End-to-end smoke test for the api/ functions: boots scripts/dev-api.ts against an in-memory
 * Redis and a fake Anthropic endpoint, then exercises auth, data sync, API tokens, LMS routing,
 * and every agent mode (including the client-side write-tool round trip).
 *
 *   bun run test:api
 *
 * Needs no credentials or network access. Exits non-zero on the first failed check.
 */
import { join } from 'node:path';

const API_PORT = 3911;
const FAKE_ANTHROPIC_PORT = 3912;
const BASE = `http://127.0.0.1:${API_PORT}`;
const EMAIL = 'tester@example.com';
const PIN = '4242';

let failures = 0;
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}`, detail ?? '');
  }
}

// ── fake Anthropic Messages API ─────────────────────────────────────────────
const seenRequests: Record<string, unknown>[] = [];
function message(content: unknown[], stop_reason: string) {
  return {
    id: `msg_${seenRequests.length}`, type: 'message', role: 'assistant', model: 'fake', content, stop_reason,
    stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
  };
}
const fake = Bun.serve({
  port: FAKE_ANTHROPIC_PORT,
  async fetch(req) {
    const body = (await req.json()) as Record<string, any>;
    seenRequests.push(body);
    const system = JSON.stringify(body.system ?? '');
    if (system.includes('proposed schedule')) {
      return Response.json(message([{ type: 'text', text: JSON.stringify({ items: [{ time: '09:00', title: 'Essay', sourceType: 'task', sourceId: 't1', durationMin: 45, rationale: 'Due soon' }] }) }], 'end_turn'));
    }
    if (system.includes('Analyze the user')) {
      return Response.json(message([{ type: 'text', text: JSON.stringify({ flags: [{ severity: 'warning', title: 'Busy day', detail: 'Six hours booked' }] }) }], 'end_turn'));
    }
    const last = body.messages[body.messages.length - 1];
    const lastIsToolResult = Array.isArray(last.content) && last.content[0]?.type === 'tool_result';
    if (!lastIsToolResult) {
      const text = typeof last.content === 'string' ? last.content : '';
      if (text.includes('free')) {
        return Response.json(message([{ type: 'tool_use', id: 'tu_f', name: 'find_free_slots', input: { durationMin: 120, after: '2026-10-10T08:30:00-07:00', count: 2 } }], 'tool_use'));
      }
      if (text.includes('book')) {
        return Response.json(message([{ type: 'tool_use', id: 'tu_w', name: 'create_event', input: { date: '2026-10-11', title: 'Study', time: '15:00' } }], 'tool_use'));
      }
      return Response.json(message([{ type: 'tool_use', id: 'tu_r', name: 'get_tasks', input: {} }], 'tool_use'));
    }
    return Response.json(message([{ type: 'text', text: 'All set.' }], 'end_turn'));
  },
});

// ── boot the API ────────────────────────────────────────────────────────────
const server = Bun.spawn(['bun', join(import.meta.dir, 'dev-api.ts')], {
  env: {
    ...process.env,
    DEV_API_PORT: String(API_PORT),
    KV_REST_API_URL: '',
    SESSION_SECRET: 'smoke-secret',
    ALLOWED_EMAILS: EMAIL,
    LOGIN_PIN: PIN,
    ANTHROPIC_API_KEY: 'sk-fake',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${FAKE_ANTHROPIC_PORT}`,
  },
  cwd: join(import.meta.dir, '..'),
  stdout: 'ignore',
  stderr: 'inherit',
});

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${BASE}/api/data`);
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error('dev-api did not start');
}

async function call(path: string, init: RequestInit & { token?: string; json?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body };
}

const context = {
  now: '2026-10-10T08:00:00',
  events: [{ id: 'e1', date: '2026-9-10', time: '10:00', title: 'Class', durationMin: 60 }],
  tasks: { q1: [{ id: 't1', title: 'Essay', done: false, time: null, dueDate: '2026-10-11', durationMin: 45 }], q2: [], q3: [], q4: [] },
  assignments: [],
};

try {
  await waitForServer();

  console.log('auth');
  check('session rejects GET', (await call('/api/session')).status === 405);
  check('session requires idToken', (await call('/api/session', { method: 'POST', json: {} })).status === 400);
  check('pin rejects wrong PIN', (await call('/api/pinSession', { method: 'POST', json: { email: EMAIL, pin: '0000' } })).status === 403);
  check('pin rejects unknown email', (await call('/api/pinSession', { method: 'POST', json: { email: 'nope@example.com', pin: PIN } })).status === 403);
  const signIn = await call('/api/pinSession', { method: 'POST', json: { email: EMAIL, pin: PIN } });
  check('pin sign-in succeeds', signIn.status === 200 && typeof signIn.body.token === 'string', signIn);
  const token: string = signIn.body.token;

  console.log('data');
  check('data requires auth', (await call('/api/data?ns=habits')).status === 401);
  check('data rejects tampered token', (await call('/api/data?ns=habits', { token: token.slice(0, -2) + 'xx' })).status === 401);
  check('data rejects unknown namespace', (await call('/api/data?ns=bogus', { token })).status === 400);
  check('data empty by default', (await call('/api/data?ns=habits', { token })).body.value === null);
  const payload = { habits: [{ id: 'h1', name: 'Read' }] };
  check('data PUT', (await call('/api/data?ns=habits', { method: 'PUT', token, json: payload })).body.ok === true);
  const read = await call('/api/data?ns=habits', { token });
  check('data round-trips', JSON.stringify(read.body.value) === JSON.stringify(payload), read.body);
  check('data rejects DELETE', (await call('/api/data?ns=habits', { method: 'DELETE', token })).status === 405);

  console.log('personal API tokens + homework');
  check('no token initially', (await call('/api/lms?action=apiToken', { token })).body.token === null);
  const minted = await call('/api/lms?action=apiToken', { method: 'POST', token });
  check('token minted', typeof minted.body.token === 'string' && minted.body.token.startsWith('ff_'), minted.body);
  const hw = await call('/api/lms?action=homework', { token: minted.body.token });
  check('homework accepts API token', hw.status === 200 && Array.isArray(hw.body.assignments), hw);
  await call('/api/lms?action=apiToken', { method: 'DELETE', token });
  check('revoked token rejected', (await call('/api/lms?action=homework', { token: minted.body.token })).status === 401);
  check('lms unknown action', (await call('/api/lms?action=nope', { token })).status === 400);
  check('canvas GET without config', (await call('/api/lms?action=canvas', { token })).status < 500);

  console.log('google / spotify routing');
  check('google unknown action', (await call('/api/google?action=nope', { token })).status === 400);
  check('spotify unknown action', (await call('/api/spotify?action=nope', { token })).status === 400);
  check('google calendars requires auth', (await call('/api/googleCalendars')).status === 401);

  console.log('agent');
  check('agent requires auth', (await call('/api/agent', { method: 'POST', json: {} })).status === 401);
  check('agent rejects bad mode', (await call('/api/agent', { method: 'POST', token, json: { mode: 'x', context } })).status === 400);
  const chat = await call('/api/agent', { method: 'POST', token, json: { mode: 'chat', context, message: 'what is on my plate?' } });
  check('chat runs read tool loop', chat.status === 200 && chat.body.done === true && chat.body.reply === 'All set.', chat.body);
  const toolResult = seenRequests.at(-1) as any;
  const resultContent = toolResult?.messages?.at(-1)?.content?.[0]?.content ?? '';
  check('read tool got task data', String(resultContent).includes('Essay'), resultContent);
  await call('/api/agent', { method: 'POST', token, json: { mode: 'chat', context, message: 'when am I free?' } });
  const slotsRaw = (seenRequests.at(-1) as any)?.messages?.at(-1)?.content?.[0]?.content ?? '[]';
  const slots = JSON.parse(slotsRaw);
  // 08:30 wall-clock (offset ignored), a 10:00–11:00 class in the way → 2h slots at 11:00 then 13:00.
  check('free slots use wall-clock time', slots[0]?.date === '2026-9-10' && slots[0]?.time === '11:00', slots);
  const book = await call('/api/agent', { method: 'POST', token, json: { mode: 'chat', context, message: 'book study time' } });
  check('write tool deferred to client', book.body.done === false && book.body.pendingToolCalls?.[0]?.name === 'create_event', book.body);
  const resume = await call('/api/agent', {
    method: 'POST', token,
    json: { mode: 'chat', context, messages: book.body.messages, pendingToolResults: [{ type: 'tool_result', tool_use_id: 'tu_w', content: '{"ok":true}' }] },
  });
  check('chat resumes after client tool', resume.body.done === true && resume.body.reply === 'All set.', resume.body);
  const plan = await call('/api/agent', { method: 'POST', token, json: { mode: 'daily_plan', context } });
  check('daily plan parsed', plan.body.plan?.[0]?.title === 'Essay', plan.body);
  const watchdog = await call('/api/agent', { method: 'POST', token, json: { mode: 'watchdog', context } });
  check('watchdog parsed', watchdog.body.flags?.[0]?.severity === 'warning', watchdog.body);
} catch (err) {
  failures++;
  console.error(err);
} finally {
  server.kill();
  fake.stop(true);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll API checks passed');
process.exit(failures ? 1 : 0);
