import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from './_lib/session.js';
import { resolveApiToken } from './_lib/apiTokens.js';
import { HttpError, makeCtx, route, type Ctx } from './_lib/fourfold.js';
import { addDaysIso, diffDays } from './_lib/domain.js';

/**
 * FourFold MCP server — lets an AI assistant (Claude Code, Claude Desktop, any MCP client) read and
 * change your homework, tasks, calendar, habits and countdowns directly, instead of scripting the
 * REST API. Endpoint: POST /api/mcp (MCP "Streamable HTTP" transport, stateless, JSON responses).
 *
 * Auth is the same as the REST API: `Authorization: Bearer <token>` — a personal API token
 * (Settings → Personal API access) or a signed-in session token. The timezone comes from `?tz=`
 * (or an `X-Timezone` header, IANA name, default UTC) and can be overridden per tool call with the
 * `timezone` argument.
 *
 * Every tool delegates to the same route functions as /api/v1 (_lib/fourfold.ts), so the two can't
 * drift apart: same validation, same locking rules, same data.
 */

const SERVER_INFO = { name: 'fourfold', title: 'FourFold', version: '1.0.0' };
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS =
  'FourFold is a personal productivity app. Start with get_due to see everything overdue or coming up ' +
  '(tasks and homework together), or get_today for a full snapshot of the day. Dates are YYYY-MM-DD and times are ' +
  '24-hour HH:MM in the account timezone. Ids come from the list/get tools — pass them back unchanged. ' +
  'Tasks live in an Eisenhower matrix: q1 Do first (urgent+important), q2 Schedule, q3 Delegate, q4 Eliminate. ' +
  'Locked items ("set in stone") refuse edits until unlocked with update_*({locked:false}).';

// ── tool definitions ────────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;
type JsonSchema = Record<string, unknown>;

interface Tool {
  name: string;
  description: string;
  /** Property schemas; `timezone` is added to every tool. */
  properties: Record<string, JsonSchema>;
  required?: string[];
  readOnly?: boolean;
  destructive?: boolean;
  run: (args: Args, ctx: (tz?: string) => Ctx) => Promise<unknown>;
}

const str = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: 'string', description, ...extra });
const date = (description: string): JsonSchema => str(description, { pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const time = (description: string): JsonSchema => str(description, { pattern: '^\\d{2}:\\d{2}$' });
const int = (description: string, min?: number, max?: number): JsonSchema => ({ type: 'integer', description, ...(min !== undefined ? { minimum: min } : {}), ...(max !== undefined ? { maximum: max } : {}) });
const bool = (description: string): JsonSchema => ({ type: 'boolean', description });
const quadrant = (description: string): JsonSchema => str(description, { enum: ['q1', 'q2', 'q3', 'q4'] });
const status = str('Which items to return. Default "open".', { enum: ['open', 'done', 'all'] });

const idArg = (what: string) => ({ id: str(`The ${what} id, exactly as returned by the list tools.`) });

/** Runs a route and unwraps `{ status, body }` — non-2xx are thrown by the routes as HttpError. */
async function go(c: Ctx, method: string, resource: string, id: string | null = null, query: Record<string, string> = {}, body: Args = {}): Promise<unknown> {
  const result = await route({ ...c, method, query, body }, resource, id);
  return result.body;
}

const asQuery = (args: Args): Record<string, string> => Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
const withoutId = ({ id: _id, ...rest }: Args): Args => rest;
const needId = (args: Args): string => {
  if (typeof args.id !== 'string' || !args.id) throw new HttpError(400, '"id" is required.');
  return args.id;
};

interface DueItem {
  type: 'task' | 'homework';
  id: string;
  title: string;
  due: string;
  daysUntil: number;
  overdue: boolean;
  quadrant: string;
  quadrantName: string;
  class?: string | null;
  source?: string;
  points?: number | null;
  url?: string | null;
  durationMin?: number | null;
  description?: string | null;
}

const TOOLS: Tool[] = [
  // ── read: what's due ─────────────────────────────────────────────────────────────
  {
    name: 'get_due',
    description:
      'Everything that is due: matrix tasks AND homework (typed in plus Schoology/Canvas/Google Classroom), merged into one list sorted by due date, ' +
      'overdue first. This is the best starting point for "what do I need to do?". Items without a due date are not included (use list_tasks / list_homework).',
    properties: {
      days: int('How many days ahead to look, counting today. Default 7. Overdue items are always included unless include_overdue is false.', 0, 365),
      include_overdue: bool('Include items already past due. Default true.'),
      include_done: bool('Include completed items. Default false.'),
    },
    readOnly: true,
    run: async (args, ctx) => {
      const c = ctx();
      const days = typeof args.days === 'number' ? args.days : 7;
      const includeOverdue = args.include_overdue !== false;
      const stat = args.include_done === true ? 'all' : 'open';
      const horizon = addDaysIso(c.today, days);
      const [t, h] = (await Promise.all([
        go(c, 'GET', 'tasks', null, { status: stat, due_before: horizon }),
        go(c, 'GET', 'homework', null, { status: stat, days: String(days) }),
      ])) as [{ tasks: Record<string, any>[] }, { homework: Record<string, any>[] }];
      const items: DueItem[] = [
        ...t.tasks.map((x): DueItem => ({
          type: 'task', id: x.id, title: x.title, due: x.dueDate, daysUntil: 0, overdue: false, quadrant: x.quadrant, quadrantName: x.quadrantName,
          durationMin: x.durationMin, description: x.description || null,
        })),
        ...h.homework.map((x): DueItem => ({
          type: 'homework', id: x.id, title: x.title, due: x.due, daysUntil: 0, overdue: false, quadrant: x.quadrant, quadrantName: x.quadrantName,
          class: x.class?.name ?? null, source: x.source, points: x.points, url: x.url, description: x.description,
        })),
      ]
        .filter((i) => i.due)
        .map((i) => ({ ...i, daysUntil: diffDays(c.today, i.due), overdue: i.due < c.today }))
        .filter((i) => includeOverdue || !i.overdue)
        .sort((a, b) => a.due.localeCompare(b.due) || a.quadrant.localeCompare(b.quadrant) || a.title.localeCompare(b.title));
      return {
        today: c.today,
        timezone: c.tz,
        through: horizon,
        counts: { total: items.length, overdue: items.filter((i) => i.overdue).length, dueToday: items.filter((i) => i.due === c.today).length, tasks: items.filter((i) => i.type === 'task').length, homework: items.filter((i) => i.type === 'homework').length },
        items,
      };
    },
  },
  {
    name: 'get_today',
    description: "A snapshot of today: calendar events, overdue / due-today / Do-first tasks, overdue and soon-due homework, habits still to do, and the nearest countdowns.",
    properties: {},
    readOnly: true,
    run: (_a, ctx) => go(ctx(), 'GET', 'summary'),
  },

  // ── read: lists ──────────────────────────────────────────────────────────────────
  {
    name: 'list_tasks',
    description: 'List Eisenhower-matrix tasks (q1 Do first, q2 Schedule, q3 Delegate, q4 Eliminate).',
    properties: { quadrant: quadrant('Only this quadrant.'), status, due_before: date('Only tasks due on or before this date (overdue included; undated tasks excluded).') },
    readOnly: true,
    run: (a, ctx) => go(ctx(), 'GET', 'tasks', null, asQuery(a)),
  },
  {
    name: 'list_homework',
    description: 'List homework — typed in plus imported from Schoology/Canvas/Google Classroom — each with its class, due date and matrix quadrant.',
    properties: {
      status,
      class: str('Only this class (the class id from list_classes).'),
      quadrant: quadrant('Only this quadrant.'),
      days: int('Only homework that is overdue or due within this many days (undated work is excluded).', 0, 9999),
    },
    readOnly: true,
    run: (a, ctx) => go(ctx(), 'GET', 'homework', null, asQuery(a)),
  },
  {
    name: 'list_events',
    description: 'List calendar events from FourFold, linked Google calendars and ICS feeds. Defaults to the next 14 days; at most 92 days per call.',
    properties: { from: date('First day, inclusive. Default today.'), to: date('Last day, inclusive. Default 13 days after "from".') },
    readOnly: true,
    run: (a, ctx) => go(ctx(), 'GET', 'events', null, asQuery(a)),
  },
  {
    name: 'list_habits',
    description: 'List habits with whether each is done today and its current streak.',
    properties: { include_history: bool('Include every date the habit was completed. Default false.') },
    readOnly: true,
    run: (a, ctx) => go(ctx(), 'GET', 'habits', null, a.include_history === true ? { history: '1' } : {}),
  },
  { name: 'list_countdowns', description: 'List countdowns (birthdays, deadlines, holidays…) with days remaining, soonest first.', properties: {}, readOnly: true, run: (_a, ctx) => go(ctx(), 'GET', 'countdowns') },
  { name: 'list_classes', description: 'List school classes (ids are used by create_homework and list_homework).', properties: {}, readOnly: true, run: (_a, ctx) => go(ctx(), 'GET', 'classes') },
  { name: 'list_calendars', description: 'List the calendars events can be written to (use an id as create_event.calendar).', properties: {}, readOnly: true, run: (_a, ctx) => go(ctx(), 'GET', 'calendars') },
  { name: 'list_friends', description: 'List friends (name, birthday, notes…). Read-only.', properties: {}, readOnly: true, run: (_a, ctx) => go(ctx(), 'GET', 'friends') },

  // ── tasks ────────────────────────────────────────────────────────────────────────
  {
    name: 'create_task',
    description: 'Add a task to the Eisenhower matrix.',
    properties: {
      title: str('What needs doing.'),
      quadrant: quadrant('Default q2 (Schedule). q1 = urgent and important.'),
      dueDate: date('Due date.'),
      time: time('Time of day it is scheduled for.'),
      durationMin: int('Estimated minutes.', 1, 1440),
      description: str('Notes.'),
      list: str('List/tag name. Default "Inbox".'),
    },
    required: ['title'],
    run: (a, ctx) => go(ctx(), 'POST', 'tasks', null, {}, a),
  },
  {
    name: 'update_task',
    description: 'Change a task: mark it done, retitle, set/clear its due date (null clears), move it to another quadrant, lock/unlock it.',
    properties: {
      ...idArg('task'),
      done: bool('Completed or not.'),
      title: str('New title.'),
      quadrant: quadrant('Move to this quadrant.'),
      dueDate: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null to clear.', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      time: { type: ['string', 'null'], description: 'HH:MM, or null to clear.' },
      durationMin: { type: ['integer', 'null'], description: 'Minutes, or null to clear.' },
      description: str('Notes.'),
      list: str('List/tag name.'),
      locked: bool('Lock ("set in stone") or unlock.'),
    },
    required: ['id'],
    run: (a, ctx) => go(ctx(), 'PATCH', 'tasks', needId(a), {}, withoutId(a)),
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a task. Prefer update_task({done:true}) to complete one. Locked tasks refuse deletion.',
    properties: idArg('task'),
    required: ['id'],
    destructive: true,
    run: (a, ctx) => go(ctx(), 'DELETE', 'tasks', needId(a)),
  },

  // ── homework ─────────────────────────────────────────────────────────────────────
  {
    name: 'create_homework',
    description: 'Add a homework item to a class.',
    properties: {
      class: str('The class id or name (see list_classes).'),
      title: str('The assignment.'),
      due: date('Due date.'),
      priority: str('Decides the matrix quadrant together with the due date. Default med.', { enum: ['high', 'med', 'low'] }),
      description: str('Notes.'),
    },
    required: ['class', 'title'],
    run: (a, ctx) => go(ctx(), 'POST', 'homework', null, {}, a),
  },
  {
    name: 'update_homework',
    description: 'Change homework: mark it done, retitle, reschedule, re-prioritise. Imported assignments (Schoology/Canvas/Classroom) only accept done.',
    properties: {
      ...idArg('homework'),
      done: bool('Completed or not.'),
      title: str('New title.'),
      due: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null to clear.', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      priority: str('New priority.', { enum: ['high', 'med', 'low'] }),
      description: str('Notes.'),
    },
    required: ['id'],
    run: (a, ctx) => go(ctx(), 'PATCH', 'homework', needId(a), {}, withoutId(a)),
  },
  {
    name: 'delete_homework',
    description: 'Permanently delete typed-in homework. Imported assignments cannot be deleted — mark them done instead.',
    properties: idArg('homework'),
    required: ['id'],
    destructive: true,
    run: (a, ctx) => go(ctx(), 'DELETE', 'homework', needId(a)),
  },

  // ── calendar ─────────────────────────────────────────────────────────────────────
  {
    name: 'create_event',
    description: 'Add a calendar event (to FourFold by default, or to a linked Google calendar).',
    properties: {
      title: str('Event title.'),
      date: date('Day of the event.'),
      startTime: time('Start, 24-hour. Default 09:00 (ignored for all-day).'),
      durationMin: int('Length in minutes. Default 60.', 1, 1440),
      endTime: time('End, instead of durationMin. Must be after the start on the same day.'),
      allDay: bool('All-day event.'),
      description: str('Notes.'),
      location: str('Where.'),
      calendar: str('"local" (default), "google", or an id from list_calendars.'),
    },
    required: ['title', 'date'],
    run: (a, ctx) => go(ctx(), 'POST', 'events', null, {}, a),
  },
  {
    name: 'update_event',
    description: 'Change or reschedule an event, or lock/unlock it. Events from ICS feeds are changed as local overrides.',
    properties: {
      ...idArg('event'),
      title: str('New title.'),
      date: date('Move to this day.'),
      startTime: time('New start, 24-hour.'),
      durationMin: int('New length in minutes.', 1, 1440),
      endTime: time('New end.'),
      allDay: bool('Make it (or stop it being) all-day.'),
      description: str('Notes.'),
      location: str('Where.'),
      locked: bool('Lock ("set in stone") or unlock.'),
      from: date('Only needed when the event is outside ±2 months of today: start of a window containing it.'),
      to: date('End of that window.'),
    },
    required: ['id'],
    run: (a, ctx) => {
      const { id: _id, from, to, ...body } = a;
      return go(ctx(), 'PATCH', 'events', needId(a), asQuery({ from, to }), body);
    },
  },
  {
    name: 'delete_event',
    description: 'Delete an event (ICS-feed events are hidden locally, since the feed is read-only). Locked events refuse deletion.',
    properties: idArg('event'),
    required: ['id'],
    destructive: true,
    run: (a, ctx) => go(ctx(), 'DELETE', 'events', needId(a)),
  },

  // ── habits ───────────────────────────────────────────────────────────────────────
  {
    name: 'set_habit_done',
    description: 'Check a habit off (or un-check it) for today or a past date.',
    properties: { ...idArg('habit'), done: bool('true to check off, false to un-check. Default true.'), date: date('Day to set. Default today; future dates are rejected.') },
    required: ['id'],
    run: (a, ctx) => go(ctx(), 'PATCH', 'habits', needId(a), {}, { done: a.done ?? true, ...(a.date ? { date: a.date } : {}) }),
  },
];

const toolByName = new Map(TOOLS.map((t) => [t.name, t]));

function describeTool(t: Tool) {
  return {
    name: t.name,
    description: t.description,
    inputSchema: {
      type: 'object',
      properties: {
        ...t.properties,
        timezone: str('IANA timezone such as "America/Los_Angeles" used for "today" and wall-clock times. Defaults to the connection\'s timezone, else UTC.'),
      },
      ...(t.required?.length ? { required: t.required } : {}),
      additionalProperties: false,
    },
    annotations: {
      title: t.name.replace(/_/g, ' '),
      readOnlyHint: !!t.readOnly,
      ...(t.readOnly ? {} : { destructiveHint: !!t.destructive }),
      idempotentHint: !!t.readOnly,
      openWorldHint: false,
    },
  };
}

// ── JSON-RPC plumbing ───────────────────────────────────────────────────────────────

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const PARSE_ERROR = -32700;

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const rpcError = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const toolText = (value: unknown, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});

async function callTool(params: RpcRequest['params'], baseCtx: (tz?: string) => Ctx) {
  const name = params?.name;
  const tool = typeof name === 'string' ? toolByName.get(name) : undefined;
  if (!tool) return { error: { code: INVALID_PARAMS, message: `Unknown tool: ${String(name)}` } };
  const raw = params?.arguments;
  if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) return { error: { code: INVALID_PARAMS, message: '"arguments" must be an object.' } };
  const { timezone, ...args } = (raw ?? {}) as Args;
  try {
    const unknown = Object.keys(args).filter((k) => !(k in tool.properties));
    if (unknown.length) throw new HttpError(400, `Unknown argument${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Accepted: ${Object.keys(tool.properties).join(', ') || 'none'}.`);
    const missing = (tool.required ?? []).filter((k) => args[k] === undefined);
    if (missing.length) throw new HttpError(400, `Missing required argument${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
    return { result: toolText(await tool.run(args, (tz) => baseCtx(typeof timezone === 'string' ? timezone : tz))) };
  } catch (err) {
    // Tool failures are reported inside the result (isError) so the model can read them and recover.
    if (err instanceof HttpError) return { result: toolText(err.message, true) };
    console.error('api/mcp tool failed', name, err);
    return { result: toolText('Something went wrong on our side.', true) };
  }
}

async function handleMessage(msg: unknown, baseCtx: (tz?: string) => Ctx): Promise<object | null> {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return rpcError(null, INVALID_REQUEST, 'Invalid request.');
  const req = msg as RpcRequest;
  const isNotification = req.id === undefined;
  // A response to a server-initiated request (we never send any), or a notification: nothing to say back.
  if (req.method === undefined || isNotification) return null;

  switch (req.method) {
    case 'initialize': {
      const wanted = req.params?.protocolVersion;
      const protocolVersion = typeof wanted === 'string' && SUPPORTED_PROTOCOLS.includes(wanted) ? wanted : SUPPORTED_PROTOCOLS[0];
      return { jsonrpc: '2.0', id: req.id, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS } };
    }
    case 'ping':
      return { jsonrpc: '2.0', id: req.id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id: req.id, result: { tools: TOOLS.map(describeTool) } };
    case 'tools/call': {
      const out = await callTool(req.params, baseCtx);
      return 'error' in out && out.error ? rpcError(req.id, out.error.code, out.error.message) : { jsonrpc: '2.0', id: req.id, result: out.result };
    }
    default:
      return rpcError(req.id, METHOD_NOT_FOUND, `Method not found: ${req.method}`);
  }
}

// ── entry point ─────────────────────────────────────────────────────────────────────

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  // Bearer-token auth, no cookies — so open CORS is safe and lets browser-based MCP clients connect.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, X-Timezone');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    // We don't offer a server-initiated SSE stream (GET) or sessions (DELETE).
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json(rpcError(null, INVALID_REQUEST, 'This MCP server only accepts POST.'));
    return;
  }

  try {
    const token = bearerToken(req);
    const email = verifySession(token) ?? (token ? await resolveApiToken(token) : null);
    if (!email) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="fourfold"');
      res.status(401).json(rpcError(null, INVALID_REQUEST, 'Sign in required — send a FourFold personal API token (Settings → Personal API access) as "Authorization: Bearer <token>".'));
      return;
    }

    const tzRaw = req.query.tz ?? req.headers['x-timezone'];
    const defaultTz = Array.isArray(tzRaw) ? tzRaw[0] : tzRaw;
    const baseCtx = (tz?: string): Ctx => makeCtx(email, tz ?? defaultTz, 'GET', {}, {});

    let payload: unknown = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        res.status(400).json(rpcError(null, PARSE_ERROR, 'Parse error: body is not valid JSON.'));
        return;
      }
    }
    if (payload === undefined || payload === null) {
      res.status(400).json(rpcError(null, INVALID_REQUEST, 'Send a JSON-RPC 2.0 message as the request body (Content-Type: application/json).'));
      return;
    }

    if (Array.isArray(payload)) {
      if (payload.length === 0) {
        res.status(400).json(rpcError(null, INVALID_REQUEST, 'Empty batch.'));
        return;
      }
      const replies = (await Promise.all(payload.map((m) => handleMessage(m, baseCtx)))).filter((r): r is object => r !== null);
      if (replies.length === 0) res.status(202).end();
      else res.status(200).json(replies);
      return;
    }

    const reply = await handleMessage(payload, baseCtx);
    if (reply === null) res.status(202).end();
    else res.status(200).json(reply);
  } catch (err) {
    console.error('api/mcp failed', err);
    res.status(500).json(rpcError(null, -32603, 'Something went wrong on our side.'));
  }
}
