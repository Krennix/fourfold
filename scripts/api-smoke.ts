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
const CAL_ICS = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:sync-1@test', 'SUMMARY:Team sync', 'DTSTART:20311112T230000Z', 'DTEND:20311112T233000Z', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:holiday-1@test', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20311113', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
const HW_ICS = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:essay-1@test', 'SUMMARY:Essay (Calculus II)', 'DTSTART:20311120T235900Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
const fake = Bun.serve({
  port: FAKE_ANTHROPIC_PORT,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === '/cal.ics') return new Response(CAL_ICS, { headers: { 'content-type': 'text/calendar' } });
    if (path === '/hw.ics') return new Response(HW_ICS, { headers: { 'content-type': 'text/calendar' } });
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
      if (text.includes('homework?')) {
        return Response.json(message([{ type: 'tool_use', id: 'tu_h', name: 'get_homework', input: { dueBefore: '2026-10-20' } }, { type: 'tool_use', id: 'tu_hb', name: 'get_habits', input: {} }, { type: 'tool_use', id: 'tu_c', name: 'get_countdowns', input: {} }], 'tool_use'));
      }
      if (text.includes('add homework')) {
        return Response.json(message([{ type: 'tool_use', id: 'tu_ah', name: 'add_homework', input: { class: 'Calculus II', title: 'Problem set 7', due: '2026-10-12' } }, { type: 'tool_use', id: 'tu_hd', name: 'set_habit_done', input: { id: 'h1' } }], 'tool_use'));
      }
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
  const ctxWithHw = {
    ...context,
    homework: [
      { id: 'manual:calc:1', title: 'Essay', due: '2026-10-11', done: false, priority: 'med', class: 'Calculus II', source: 'manual', quadrant: 'q1' },
      { id: 'canvas:9', title: 'Far away', due: '2026-12-01', done: false, priority: null, class: 'Chemistry', source: 'canvas', quadrant: 'q2' },
    ],
    habits: [{ id: 'h1', name: 'Read', doneToday: false, streak: 3 }],
    countdowns: [{ id: 'c1', name: 'Winter break', date: '2026-12-19', daysUntil: 70 }],
  };
  const hwChat = await call('/api/agent', { method: 'POST', token, json: { mode: 'chat', context: ctxWithHw, message: 'what homework?' } });
  check('assistant read tools cover homework, habits, countdowns', hwChat.body.done === true && hwChat.body.reply === 'All set.', hwChat.body);
  const results = ((seenRequests.at(-1) as any).messages.at(-1).content as any[]).map((r) => String(r.content));
  check('get_homework filters by due date', results[0].includes('Essay') && !results[0].includes('Far away'), results[0]);
  check('get_habits / get_countdowns return the context', results[1].includes('"streak":3') && results[2].includes('Winter break'), results);
  const hwWrite = await call('/api/agent', { method: 'POST', token, json: { mode: 'chat', context: ctxWithHw, message: 'please add homework' } });
  check('homework + habit writes are deferred to the client', hwWrite.body.done === false && hwWrite.body.pendingToolCalls?.map((c: any) => c.name).join() === 'add_homework,set_habit_done', hwWrite.body);
  const plan = await call('/api/agent', { method: 'POST', token, json: { mode: 'daily_plan', context } });
  check('daily plan parsed', plan.body.plan?.[0]?.title === 'Essay', plan.body);
  const watchdog = await call('/api/agent', { method: 'POST', token, json: { mode: 'watchdog', context } });
  check('watchdog parsed', watchdog.body.flags?.[0]?.severity === 'warning', watchdog.body);

  console.log('public API /api/v1');
  const apiTok: string = (await call('/api/lms?action=apiToken', { method: 'POST', token })).body.token;
  const TZ = 'America/Los_Angeles';
  const v1 = (path: string, init: { method?: string; json?: unknown; token?: string | null } = {}) =>
    call(`/api/v1${path}${path.includes('?') ? '&' : '?'}tz=${TZ}`, { method: init.method, json: init.json, token: init.token === undefined ? apiTok : (init.token ?? undefined) });
  const dataOf = async (ns: string) => (await call(`/api/data?ns=${ns}`, { token })).body.value;

  check('v1 requires auth', (await v1('/tasks', { token: null })).status === 401);
  check('v1 rejects a bad token', (await v1('/tasks', { token: 'ff_nope' })).status === 401);
  check('v1 accepts a session token too', (await v1('/tasks', { token })).status === 200);
  const index = await v1('');
  check('v1 index lists endpoints', index.status === 200 && Object.keys(index.body.endpoints).length > 8, index.body);
  check('v1 unknown endpoint 404', (await v1('/nope')).status === 404);
  const today: string = index.body.today;
  const plus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  check('tz is honoured (today is a valid date in that zone)', /^\d{4}-\d{2}-\d{2}$/.test(today) && index.body.timezone === TZ);

  console.log('  tasks');
  check('task needs a title', (await v1('/tasks', { method: 'POST', json: {} })).status === 400);
  check('task rejects a bad date', (await v1('/tasks', { method: 'POST', json: { title: 'x', dueDate: 'tomorrow' } })).status === 400);
  const t1 = await v1('/tasks', { method: 'POST', json: { title: 'Write report', quadrant: 'q1', dueDate: plus(1), durationMin: 60 } });
  check('task created', t1.status === 201 && t1.body.task.quadrant === 'q1' && t1.body.task.dueDate === plus(1), t1.body);
  const tid: string = t1.body.task.id;
  check('task stored in app format', (await dataOf('matrix')).q1.some((t: any) => t.id === tid && t.title === 'Write report' && t.done === false && t.locked === false));
  check('task listed', (await v1('/tasks?quadrant=q1')).body.tasks.some((t: any) => t.id === tid));
  const moved = await v1(`/tasks/${tid}`, { method: 'PATCH', json: { quadrant: 'q2', done: true, time: '14:00' } });
  check('task moved, completed and scheduled', moved.body.task.quadrant === 'q2' && moved.body.task.done && moved.body.task.time === '14:00', moved.body);
  check('done filter', (await v1('/tasks?status=done')).body.tasks.some((t: any) => t.id === tid) && !(await v1('/tasks')).body.tasks.some((t: any) => t.id === tid));
  await v1(`/tasks/${tid}`, { method: 'PATCH', json: { locked: true } });
  check('locked task refuses edits (423)', (await v1(`/tasks/${tid}`, { method: 'PATCH', json: { title: 'Nope' } })).status === 423);
  check('locked task refuses delete (423)', (await v1(`/tasks/${tid}`, { method: 'DELETE' })).status === 423);
  await v1(`/tasks/${tid}`, { method: 'PATCH', json: { locked: false } });
  check('task deleted', (await v1(`/tasks/${tid}`, { method: 'DELETE' })).body.ok === true && (await v1(`/tasks/${tid}`)).status === 404);

  console.log('  calendar events');
  const e1 = await v1('/events', { method: 'POST', json: { title: 'Study group', date: plus(2), startTime: '15:00', durationMin: 45, location: 'Library' } });
  check('event created with end time', e1.status === 201 && e1.body.event.startTime === '15:00' && e1.body.event.endTime === '15:45' && e1.body.event.source === 'local', e1.body);
  const eid: string = e1.body.event.id;
  const stored = (await dataOf('calendar')).find((e: any) => `local:${e.id}` === eid);
  check('event stored in the app\'s format (0-based month date)', stored && stored.date === `${Number(plus(2).slice(0, 4))}-${Number(plus(2).slice(5, 7)) - 1}-${Number(plus(2).slice(8, 10))}` && stored.time === '15:00', stored);
  check('event appears in range', (await v1(`/events?from=${plus(2)}&to=${plus(2)}`)).body.events.some((e: any) => e.id === eid));
  const e2 = await v1('/events', { method: 'POST', json: { title: 'Field trip', date: plus(3), allDay: true } });
  check('all-day event', e2.status === 201 && e2.body.event.allDay && e2.body.event.startTime === null, e2.body);
  check('event validation', (await v1('/events', { method: 'POST', json: { title: 'x', date: '11/20' } })).status === 400 && (await v1('/events', { method: 'POST', json: { date: plus(1) } })).status === 400);
  check('end before start rejected', (await v1('/events', { method: 'POST', json: { title: 'x', date: plus(1), startTime: '15:00', endTime: '14:00' } })).status === 400);
  check('huge range rejected', (await v1(`/events?from=${plus(0)}&to=${plus(400)}`)).status === 400);
  const edited = await v1(`/events/${encodeURIComponent(eid)}`, { method: 'PATCH', json: { date: plus(4), startTime: '16:00', endTime: '17:30' } });
  check('event moved and resized', edited.body.event.date === plus(4) && edited.body.event.startTime === '16:00' && edited.body.event.durationMin === 90 && edited.body.event.endTime === '17:30', edited.body);
  const lockedEv = await v1(`/events/${encodeURIComponent(eid)}`, { method: 'PATCH', json: { locked: true } });
  check('event locked', lockedEv.body.event?.locked === true, lockedEv.body);
  check('locked event refuses move/delete (423)', (await v1(`/events/${encodeURIComponent(eid)}`, { method: 'PATCH', json: { date: plus(5) } })).status === 423 && (await v1(`/events/${encodeURIComponent(eid)}`, { method: 'DELETE' })).status === 423);
  check('lock is stored where the app reads it', (await dataOf('calendarMeta')).locked.some((k: string) => k.endsWith(eid.replace('local:', ''))));
  await v1(`/events/${encodeURIComponent(eid)}`, { method: 'PATCH', json: { locked: false } });
  check('event deleted', (await v1(`/events/${encodeURIComponent(eid)}`, { method: 'DELETE' })).body.ok === true);
  // an event written by the web app (12-hour time, 0-based month) must read back correctly
  const appDate = `${Number(plus(6).slice(0, 4))}-${Number(plus(6).slice(5, 7)) - 1}-${Number(plus(6).slice(8, 10))}`;
  await call('/api/data?ns=calendar', { method: 'PUT', token, json: [{ id: 'from-app', date: appDate, time: '9:30 AM', title: 'From the app', cls: '', durationMin: 30 }] });
  const fromApp = (await v1(`/events?from=${plus(6)}&to=${plus(6)}`)).body.events[0];
  check('app-created event reads back (date + 12h time converted)', fromApp?.title === 'From the app' && fromApp.date === plus(6) && fromApp.startTime === '09:30' && fromApp.endTime === '10:00', fromApp);
  const targets = await v1('/calendars');
  check('calendars list includes local', targets.body.calendars[0].id === 'local');

  console.log('  ICS calendar feed');
  const feedSet = await call('/api/google?action=icsFeed', { method: 'PUT', token, json: { feeds: [{ id: 'f1', label: 'Work', url: `http://127.0.0.1:${FAKE_ANTHROPIC_PORT}/cal.ics`, color: '#ff8800' }] } });
  check('ICS feed saved', feedSet.status === 200, feedSet.body);
  const ics = await v1('/events?from=2031-11-12&to=2031-11-13');
  const sync = ics.body.events.find((e: any) => e.title === 'Team sync');
  check('ICS event converted to the requested timezone (23:00Z → 15:00 PST)', sync?.startTime === '15:00' && sync.endTime === '15:30' && sync.date === '2031-11-12' && sync.source === 'ics' && sync.calendar === 'Work', ics.body);
  check('ICS all-day event', ics.body.events.some((e: any) => e.title === 'Holiday' && e.allDay && e.date === '2031-11-13'));
  const icsEdit = await v1(`/events/${encodeURIComponent(sync.id)}?from=2031-11-12&to=2031-11-13`, { method: 'PATCH', json: { title: 'Team sync (moved)', startTime: '17:00' } });
  check('ICS event edited as a local override', icsEdit.body.event?.title === 'Team sync (moved)' && icsEdit.body.event.startTime === '17:00', icsEdit.body);
  check('override is stored where the app reads it', Object.keys((await dataOf('calendarMeta')).icsOverrides).length === 1);
  const icsDel = await v1(`/events/${encodeURIComponent(sync.id)}?from=2031-11-12&to=2031-11-13`, { method: 'DELETE' });
  check('ICS event hidden', icsDel.body.ok && !(await v1('/events?from=2031-11-12&to=2031-11-13')).body.events.some((e: any) => e.title.startsWith('Team sync')));

  console.log('  homework');
  await call('/api/data?ns=school', { method: 'PUT', token, json: { classes: [{ id: 'calc', name: 'Calculus II', room: 'Rm 1', periods: [1] }, { id: 'chem', name: 'Chemistry', room: 'Lab', periods: [2] }], presets: [], overrides: {}, showBreaks: true, homework: {}, schoologyDone: {}, classMappings: {}, classKeywords: {} } });
  check('classes listed', (await v1('/classes')).body.classes.length === 2);
  check('homework needs a known class', (await v1('/homework', { method: 'POST', json: { class: 'Art', title: 'x' } })).status === 400);
  const h1 = await v1('/homework', { method: 'POST', json: { class: 'chemistry', title: 'Lab report', due: plus(1), priority: 'med' } });
  check('homework added by class name; urgent medium → Do first', h1.status === 201 && h1.body.homework.class.id === 'chem' && h1.body.homework.quadrant === 'q1', h1.body);
  const h2 = await v1('/homework', { method: 'POST', json: { class: 'calc', title: 'Problem set', due: plus(10), priority: 'med' } });
  check('far medium → Schedule', h2.body.homework.quadrant === 'q2');
  const h3 = await v1('/homework', { method: 'POST', json: { class: 'calc', title: 'Optional reading', due: plus(1), priority: 'low' } });
  check('urgent low → Delegate', h3.body.homework.quadrant === 'q3');
  const h4 = await v1('/homework', { method: 'POST', json: { class: 'calc', title: 'Doodle', due: plus(30), priority: 'low' } });
  check('far low → Eliminate', h4.body.homework.quadrant === 'q4');
  check('stored in the app\'s format', (await dataOf('school')).homework.chem.some((h: any) => h.title === 'Lab report' && h.priority === 'med' && h.done === false && h.due === plus(1)));
  check('days filter keeps what is due soon', (await v1('/homework?days=3')).body.homework.map((h: any) => h.title).sort().join() === 'Lab report,Optional reading');
  check('class filter', (await v1('/homework?class=calc')).body.homework.length === 3);
  const doneHw = await v1(`/homework/${encodeURIComponent(h1.body.homework.id)}`, { method: 'PATCH', json: { done: true, title: 'Lab report v2' } });
  check('homework completed and renamed', doneHw.body.homework.done && doneHw.body.homework.title === 'Lab report v2', doneHw.body);
  check('open filter hides done homework', !(await v1('/homework')).body.homework.some((h: any) => h.title === 'Lab report v2'));
  // imported assignments (Schoology ICS feed)
  await call('/api/lms?action=schoology', { method: 'PUT', token, json: { icsUrl: `http://127.0.0.1:${FAKE_ANTHROPIC_PORT}/hw.ics` } });
  const imported = (await v1('/homework?status=all')).body.homework.find((h: any) => h.title.startsWith('Essay'));
  check('imported assignment appears, matched to its class', imported?.source === 'schoology' && imported.class?.id === 'calc' && imported.due === '2031-11-20' && imported.quadrant === 'q2', imported);
  check('imported assignment can be marked done', (await v1(`/homework/${encodeURIComponent(imported.id)}`, { method: 'PATCH', json: { done: true } })).body.homework.done === true && (await dataOf('school')).schoologyDone['essay-1@test'] === true);
  check('imported assignment fields are read-only', (await v1(`/homework/${encodeURIComponent(imported.id)}`, { method: 'PATCH', json: { title: 'x' } })).status === 400);
  check('imported assignment cannot be deleted', (await v1(`/homework/${encodeURIComponent(imported.id)}`, { method: 'DELETE' })).status === 400);
  check('old homework endpoint still works with the token', (await call('/api/lms?action=homework&days=36500', { token: apiTok })).body.assignments?.length === 1);
  check('homework deleted', (await v1(`/homework/${encodeURIComponent(h2.body.homework.id)}`, { method: 'DELETE' })).body.ok === true && (await v1(`/homework/${encodeURIComponent(h2.body.homework.id)}`)).status === 404);

  console.log('  habits');
  const hb = await v1('/habits', { method: 'POST', json: { name: 'Read 20 pages', time: '21:00' } });
  check('habit created', hb.status === 201 && hb.body.habit.doneToday === false, hb.body);
  const hid: string = hb.body.habit.id;
  const checkedOff = await v1(`/habits/${hid}`, { method: 'PATCH', json: { done: true } });
  check('habit checked off today, streak 1', checkedOff.body.habit.doneToday && checkedOff.body.habit.streak === 1, checkedOff.body);
  await v1(`/habits/${hid}`, { method: 'PATCH', json: { done: true, date: plus(-1) } });
  check('backfilling yesterday makes a 2-day streak', (await v1(`/habits/${hid}`)).body.habit.streak === 2);
  check('stored in the app\'s format (history of YYYY-MM-DD)', (await dataOf('habits')).find((h: any) => h.id === hid).history.includes(today));
  check('future check-off rejected', (await v1(`/habits/${hid}`, { method: 'PATCH', json: { done: true, date: plus(3) } })).status === 400);
  await v1(`/habits/${hid}`, { method: 'PATCH', json: { done: false } });
  check('habit un-checked', (await v1('/habits')).body.habits.find((h: any) => h.id === hid).doneToday === false);
  check('habit deleted', (await v1(`/habits/${hid}`, { method: 'DELETE' })).body.ok === true && (await v1(`/habits/${hid}`)).status === 404);

  console.log('  countdowns, friends, summary');
  check('impossible date rejected', (await v1('/countdowns', { method: 'POST', json: { name: 'x', month: 2, day: 31 } })).status === 400);
  const cd = await v1('/countdowns', { method: 'POST', json: { name: 'Winter break', month: Number(plus(10).slice(5, 7)), day: Number(plus(10).slice(8, 10)), type: 'holiday' } });
  check('countdown created with days remaining', cd.status === 201 && cd.body.countdown.daysUntil === 10 && cd.body.countdown.nextDate === plus(10), cd.body);
  check('countdown listed', (await v1('/countdowns')).body.countdowns.length === 1);
  await call('/api/data?ns=friends', { method: 'PUT', token, json: { friends: [{ id: 'fr1', name: 'Sam', nickname: 'S', birthday: { month: 3, day: 4 }, avatarDataUrl: 'data:image/png;base64,AAAA', linkedEvents: [], linkedCountdowns: [], fields: [] }], fieldDefs: [] } });
  const friends = (await v1('/friends')).body.friends;
  check('friends are readable (without avatar blobs) and read-only', friends[0].name === 'Sam' && !('avatarDataUrl' in friends[0]) && (await v1('/friends', { method: 'POST', json: {} })).status === 405);
  const summary = await v1('/summary');
  check('summary covers today', summary.status === 200 && summary.body.date === today && summary.body.homework.open >= 1 && summary.body.countdowns.length === 1 && 'doneToday' in summary.body.habits, summary.body);
  check('malformed body is a 400, not a crash', (await call(`/api/v1/tasks?tz=${TZ}`, { method: 'POST', token: apiTok, json: ['not', 'an', 'object'] })).status === 400);
  await call('/api/lms?action=apiToken', { method: 'DELETE', token });
  check('revoked token stops working on v1', (await v1('/tasks')).status === 401);
} catch (err) {
  failures++;
  console.error(err);
} finally {
  server.kill();
  fake.stop(true);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll API checks passed');
process.exit(failures ? 1 : 0);
