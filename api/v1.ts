import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifySession } from './_lib/session.js';
import { resolveApiToken } from './_lib/apiTokens.js';
import { fetchAllAssignments } from './_lib/lmsAssignments.js';
import { fetchAllIcsFeeds, loadStoredFeeds } from './_lib/icsFeeds.js';
import {
  accessTokenFor,
  deleteGoogleEvent,
  insertGoogleEvent,
  listGoogleEvents,
  loadLinkedAccounts,
  patchGoogleEvent,
  type GoogleEvent,
  type GoogleEventInput,
} from './_lib/googleCalendarApi.js';
import {
  addDaysIso,
  addMinutes,
  appDateToIso,
  daysUntilNext,
  diffDays,
  dueToIso,
  habitStreak,
  homeworkQuadrant,
  isHHMM,
  isIsoDate,
  isoDateIn,
  isoToAppDate,
  matchAssignmentToClass,
  to24h,
  validTimeZone,
  wallClockIn,
  type HwPriority,
  type QuadKey,
} from './_lib/domain.js';

/**
 * FourFold public REST API — one function (Vercel's Hobby plan caps function count) routed by
 * path: /api/v1/<resource>[/<id>], rewritten to /api/v1?path=<resource>/<id> in vercel.json.
 *
 * Auth: `Authorization: Bearer <token>` — a personal API token (Settings → Personal API access)
 * or a signed-in session token. Every endpoint reads and writes the same data the app shows.
 * Dates are ISO ("YYYY-MM-DD"), times are 24-hour "HH:MM", in the timezone given by `?tz=`
 * (an IANA name like "America/Los_Angeles"; default UTC).
 */

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

// ── tiny helpers ─────────────────────────────────────────────────────────────────────

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const bad = (message: string) => new HttpError(400, message);
const notFound = (what: string) => new HttpError(404, `${what} not found.`);
const locked = (what: string) => new HttpError(423, `That ${what} is locked ("set in stone"). Unlock it first (PATCH {"locked": false}).`);

type Json = Record<string, unknown>;

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

async function load<T>(email: string, ns: string, fallback: T): Promise<T> {
  return ((await redis.get<T>(`fourfold:${email}:${ns}`)) ?? fallback) as T;
}

/** Like `load`, but for namespaces that hold a list — anything else (corrupt/legacy data) reads as empty. */
async function loadList<T>(email: string, ns: string): Promise<T[]> {
  const v = await redis.get<unknown>(`fourfold:${email}:${ns}`);
  return Array.isArray(v) ? (v as T[]) : [];
}

async function save(email: string, ns: string, value: unknown): Promise<void> {
  await redis.set(`fourfold:${email}:${ns}`, value);
}

function optStr(body: Json, key: string, max = 500): string | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw bad(`"${key}" must be a string.`);
  if (v.length > max) throw bad(`"${key}" is too long (max ${max} characters).`);
  return v;
}

function reqStr(body: Json, key: string, max = 200): string {
  const v = optStr(body, key, max)?.trim();
  if (!v) throw bad(`"${key}" is required.`);
  return v;
}

function optBool(body: Json, key: string): boolean | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw bad(`"${key}" must be true or false.`);
  return v;
}

function optInt(body: Json, key: string, min: number, max: number): number | null | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw bad(`"${key}" must be a whole number from ${min} to ${max}.`);
  return v;
}

function optDate(body: Json, key: string): string | null | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (!isIsoDate(v)) throw bad(`"${key}" must be a date like 2026-11-20.`);
  return v;
}

function optTime(body: Json, key: string): string | null | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (!isHHMM(v)) throw bad(`"${key}" must be a 24-hour time like 15:30.`);
  return v;
}

function oneOf<T extends string>(body: Json, key: string, allowed: readonly T[]): T | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw bad(`"${key}" must be one of: ${allowed.join(', ')}.`);
  return v as T;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface Ctx {
  email: string;
  tz: string;
  today: string;
  query: Record<string, string | string[] | undefined>;
  body: Json;
  method: string;
}

const q1 = (ctx: Ctx, key: string): string | undefined => {
  const v = ctx.query[key];
  return Array.isArray(v) ? v[0] : v;
};

// ── stored shapes (mirrors src/state/*) ─────────────────────────────────────────────

const QUADS = ['q1', 'q2', 'q3', 'q4'] as const;
const QUAD_NAMES: Record<QuadKey, string> = { q1: 'Do first', q2: 'Schedule', q3: 'Delegate', q4: 'Eliminate' };

interface StoredTask {
  id: string;
  title: string;
  description: string;
  done: boolean;
  time: string | null;
  listTag: string;
  dueDate: string | null;
  link: unknown;
  durationMin: number | null;
  locked: boolean;
}
type StoredMatrix = Record<QuadKey, StoredTask[]>;

interface StoredHabit {
  id: string;
  name: string;
  time: string | null;
  quote: string | null;
  streak: number;
  done: boolean;
  history: string[];
}

interface StoredCountdown {
  id: string;
  name: string;
  month: number;
  day: number;
  type: 'birthday' | 'holiday' | 'anniversary' | 'deadline' | 'event';
  friendId?: string;
}

interface StoredHomework {
  id: number;
  title: string;
  due: string;
  priority: HwPriority;
  done: boolean;
  description?: string;
}

interface StoredSchool {
  classes: { id: string; name: string; room: string; periods: number[] }[];
  homework?: Record<string, StoredHomework[]>;
  schoologyDone?: Record<string, boolean>;
  classMappings?: Record<string, string>;
  classKeywords?: Record<string, string[]>;
  /** Homework the user dragged to another quadrant, keyed by homework id ("manual:<class>:<n>" or "<source>:<uid>"). */
  quadOverrides?: Record<string, QuadKey>;
  [k: string]: unknown;
}

interface StoredLocalEvent {
  id: string;
  /** "YYYY-M-D" with a 0-based month. */
  date: string;
  time: string;
  title: string;
  cls: '' | 'google';
  durationMin?: number;
  description?: string;
  location?: string;
  allDay?: boolean;
}

interface IcsOverride {
  date?: string;
  time?: string;
  title?: string;
  durationMin?: number;
  description?: string;
  location?: string;
  allDay?: boolean;
  hidden?: boolean;
}

interface CalendarMeta {
  locked: string[];
  colors: Record<string, string>;
  icsOverrides: Record<string, IcsOverride>;
}

async function loadMatrix(email: string): Promise<StoredMatrix> {
  const m = await load<Partial<StoredMatrix>>(email, 'matrix', {});
  return { q1: m.q1 ?? [], q2: m.q2 ?? [], q3: m.q3 ?? [], q4: m.q4 ?? [] };
}

async function loadMeta(email: string): Promise<CalendarMeta> {
  const m = await load<Partial<CalendarMeta>>(email, 'calendarMeta', {});
  return { locked: m.locked ?? [], colors: m.colors ?? {}, icsOverrides: m.icsOverrides ?? {} };
}

// ── tasks (Eisenhower matrix) ───────────────────────────────────────────────────────

function taskOut(t: StoredTask, quad: QuadKey) {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? '',
    done: !!t.done,
    quadrant: quad,
    quadrantName: QUAD_NAMES[quad],
    dueDate: t.dueDate ? (dueToIso(t.dueDate, 'UTC') ?? t.dueDate) : null,
    time: t.time,
    durationMin: t.durationMin ?? null,
    locked: !!t.locked,
    list: t.listTag || 'Inbox',
  };
}

function findTask(m: StoredMatrix, id: string): { quad: QuadKey; task: StoredTask } | null {
  for (const quad of QUADS) {
    const task = m[quad].find((t) => t.id === id);
    if (task) return { quad, task };
  }
  return null;
}

async function tasksRoute(ctx: Ctx, id: string | null) {
  const matrix = await loadMatrix(ctx.email);

  if (!id) {
    if (ctx.method === 'GET') {
      const quadrant = q1(ctx, 'quadrant');
      if (quadrant && !(QUADS as readonly string[]).includes(quadrant)) throw bad('"quadrant" must be q1, q2, q3 or q4.');
      const status = q1(ctx, 'status') ?? 'open';
      if (!['open', 'done', 'all'].includes(status)) throw bad('"status" must be open, done or all.');
      const dueBefore = q1(ctx, 'due_before');
      if (dueBefore !== undefined && !isIsoDate(dueBefore)) throw bad('"due_before" must be a date like 2026-11-20.');
      const out = QUADS.filter((qd) => !quadrant || qd === quadrant)
        .flatMap((qd) => matrix[qd].map((t) => taskOut(t, qd)))
        .filter((t) => status === 'all' || (status === 'done' ? t.done : !t.done))
        .filter((t) => !dueBefore || (t.dueDate !== null && t.dueDate <= dueBefore));
      return { status: 200, body: { tasks: out } };
    }
    if (ctx.method === 'POST') {
      const quadrant = oneOf(ctx.body, 'quadrant', QUADS) ?? 'q2';
      const task: StoredTask = {
        id: newId('task'),
        title: reqStr(ctx.body, 'title'),
        description: optStr(ctx.body, 'description', 2000) ?? '',
        done: false,
        time: optTime(ctx.body, 'time') ?? null,
        listTag: optStr(ctx.body, 'list', 60)?.trim() || 'Inbox',
        dueDate: optDate(ctx.body, 'dueDate') ?? null,
        link: null,
        durationMin: optInt(ctx.body, 'durationMin', 1, 1440) ?? null,
        locked: optBool(ctx.body, 'locked') ?? false,
      };
      matrix[quadrant].push(task);
      await save(ctx.email, 'matrix', matrix);
      return { status: 201, body: { task: taskOut(task, quadrant) } };
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  const found = findTask(matrix, id);
  if (!found) throw notFound('Task');

  if (ctx.method === 'GET') return { status: 200, body: { task: taskOut(found.task, found.quad) } };

  if (ctx.method === 'PATCH') {
    const b = ctx.body;
    const wantsLockOnly = Object.keys(b).every((k) => k === 'locked');
    if (found.task.locked && !wantsLockOnly && b.locked !== false) throw locked('task');
    const t = found.task;
    const title = optStr(b, 'title', 200);
    if (title !== undefined) {
      if (!title.trim()) throw bad('"title" cannot be empty.');
      t.title = title.trim();
    }
    const description = optStr(b, 'description', 2000);
    if (description !== undefined) t.description = description;
    const dueDate = optDate(b, 'dueDate');
    if (dueDate !== undefined) t.dueDate = dueDate;
    const time = optTime(b, 'time');
    if (time !== undefined) t.time = time;
    const durationMin = optInt(b, 'durationMin', 1, 1440);
    if (durationMin !== undefined) t.durationMin = durationMin;
    const done = optBool(b, 'done');
    if (done !== undefined) t.done = done;
    const list = optStr(b, 'list', 60);
    if (list !== undefined) t.listTag = list.trim() || 'Inbox';
    const lockedNext = optBool(b, 'locked');
    if (lockedNext !== undefined) t.locked = lockedNext;
    let quad = found.quad;
    const target = oneOf(b, 'quadrant', QUADS);
    if (target && target !== found.quad) {
      matrix[found.quad] = matrix[found.quad].filter((x) => x.id !== t.id);
      matrix[target].push(t);
      quad = target;
    }
    await save(ctx.email, 'matrix', matrix);
    return { status: 200, body: { task: taskOut(t, quad) } };
  }

  if (ctx.method === 'DELETE') {
    if (found.task.locked) throw locked('task');
    matrix[found.quad] = matrix[found.quad].filter((x) => x.id !== id);
    await save(ctx.email, 'matrix', matrix);
    return { status: 200, body: { ok: true, deleted: id } };
  }
  throw new HttpError(405, 'Method not allowed.');
}

// ── homework ────────────────────────────────────────────────────────────────────────

const HW_SOURCES = ['schoology', 'canvas', 'classroom'] as const;

interface HwOut {
  id: string;
  title: string;
  due: string | null;
  done: boolean;
  priority: HwPriority | null;
  source: 'manual' | (typeof HW_SOURCES)[number];
  class: { id: string; name: string } | null;
  description: string | null;
  points: number | null;
  url: string | null;
  quadrant: QuadKey;
  quadrantName: string;
}

/** The quadrant the user dragged this homework to, if any. */
function pinnedQuad(school: StoredSchool, id: string): QuadKey | null {
  const q = school.quadOverrides?.[id];
  return q && (QUADS as readonly string[]).includes(q) ? q : null;
}

async function buildHomework(ctx: Ctx, school: StoredSchool): Promise<HwOut[]> {
  const classes = school.classes ?? [];
  const classById = new Map(classes.map((c) => [c.id, c]));
  const out: HwOut[] = [];

  for (const [classId, items] of Object.entries(school.homework ?? {})) {
    const cls = classById.get(classId);
    for (const hw of items) {
      const due = dueToIso(hw.due, ctx.tz);
      const quadrant = pinnedQuad(school, `manual:${classId}:${hw.id}`) ?? homeworkQuadrant({ manualPriority: hw.priority, dueIso: due }, ctx.today);
      out.push({
        id: `manual:${classId}:${hw.id}`,
        title: hw.title,
        due,
        done: !!hw.done,
        priority: hw.priority,
        source: 'manual',
        class: cls ? { id: cls.id, name: cls.name } : null,
        description: hw.description ?? null,
        points: null,
        url: null,
        quadrant,
        quadrantName: QUAD_NAMES[quadrant],
      });
    }
  }

  const assignments = await fetchAllAssignments(ctx.email);
  for (const a of assignments) {
    const due = dueToIso(a.due, ctx.tz);
    const classId = matchAssignmentToClass(a, classes, school.classMappings ?? {}, school.classKeywords ?? {});
    const cls = classId ? classById.get(classId) : undefined;
    const quadrant = pinnedQuad(school, `${a.source}:${a.uid}`) ?? homeworkQuadrant({ icsPriority: a.priority, dueIso: due }, ctx.today);
    out.push({
      id: `${a.source}:${a.uid}`,
      title: a.title,
      due,
      done: school.schoologyDone?.[a.uid] ?? false,
      priority: null,
      source: a.source,
      class: cls ? { id: cls.id, name: cls.name } : a.categories[0] ? { id: '', name: a.categories[0] } : null,
      description: a.description,
      points: a.points,
      url: a.url,
      quadrant,
      quadrantName: QUAD_NAMES[quadrant],
    });
  }

  out.sort((a, b) => (a.due ?? '9999-12-31').localeCompare(b.due ?? '9999-12-31'));
  return out;
}

const emptySchool = (): StoredSchool => ({ classes: [], homework: {}, schoologyDone: {}, classMappings: {}, classKeywords: {} });

async function homeworkRoute(ctx: Ctx, idParts: string | null) {
  const school = { ...emptySchool(), ...(await load<StoredSchool | null>(ctx.email, 'school', null)) };
  school.homework ??= {};
  school.schoologyDone ??= {};

  if (!idParts) {
    if (ctx.method === 'GET') {
      const status = q1(ctx, 'status') ?? 'open';
      if (!['open', 'done', 'all'].includes(status)) throw bad('"status" must be open, done or all.');
      const classId = q1(ctx, 'class');
      const quadrant = q1(ctx, 'quadrant');
      if (quadrant && !(QUADS as readonly string[]).includes(quadrant)) throw bad('"quadrant" must be q1, q2, q3 or q4.');
      const days = q1(ctx, 'days');
      if (days !== undefined && !/^\d{1,4}$/.test(days)) throw bad('"days" must be a whole number.');
      const horizon = days !== undefined ? addDaysIso(ctx.today, Number(days)) : null;
      const all = await buildHomework(ctx, school);
      const homework = all
        .filter((h) => status === 'all' || (status === 'done' ? h.done : !h.done))
        .filter((h) => !classId || h.class?.id === classId)
        .filter((h) => !quadrant || h.quadrant === quadrant)
        // `days` keeps everything overdue or due within N days (undated work isn't "due soon").
        .filter((h) => horizon === null || (h.due !== null && h.due <= horizon));
      return { status: 200, body: { homework } };
    }
    if (ctx.method === 'POST') {
      const classes = school.classes;
      if (classes.length === 0) throw bad('No classes are set up yet — add your classes in the app (Settings → School) first.');
      const ref = reqStr(ctx.body, 'class', 100);
      const cls = classes.find((c) => c.id === ref) ?? classes.find((c) => c.name.trim().toLowerCase() === ref.toLowerCase());
      if (!cls) throw bad(`Unknown class "${ref}". Known classes: ${classes.map((c) => `${c.id} (${c.name})`).join(', ')}.`);
      const hw: StoredHomework = {
        id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
        title: reqStr(ctx.body, 'title'),
        due: optDate(ctx.body, 'due') ?? '',
        priority: oneOf(ctx.body, 'priority', ['high', 'med', 'low'] as const) ?? 'med',
        done: false,
        description: optStr(ctx.body, 'description', 2000)?.trim() || undefined,
      };
      school.homework[cls.id] = [...(school.homework[cls.id] ?? []), hw];
      await save(ctx.email, 'school', school);
      const created = (await buildHomework(ctx, school)).find((h) => h.id === `manual:${cls.id}:${hw.id}`);
      return { status: 201, body: { homework: created } };
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  // id: "manual:<classId>:<n>" or "<source>:<uid>"
  const [kind, ...rest] = idParts.split(':');
  const tail = rest.join(':');

  if (kind === 'manual') {
    const sep = tail.lastIndexOf(':');
    const classId = tail.slice(0, sep);
    const n = Number(tail.slice(sep + 1));
    const list = school.homework[classId] ?? [];
    const hw = list.find((h) => h.id === n);
    if (!hw) throw notFound('Homework');
    const hwId = `manual:${classId}:${hw.id}`;

    if (ctx.method === 'GET') {
      return { status: 200, body: { homework: (await buildHomework(ctx, school)).find((h) => h.id === hwId) } };
    }
    if (ctx.method === 'PATCH') {
      const b = ctx.body;
      const title = optStr(b, 'title', 200);
      if (title !== undefined) {
        if (!title.trim()) throw bad('"title" cannot be empty.');
        hw.title = title.trim();
      }
      const due = optDate(b, 'due');
      if (due !== undefined) hw.due = due ?? '';
      const priority = oneOf(b, 'priority', ['high', 'med', 'low'] as const);
      if (priority) hw.priority = priority;
      const description = optStr(b, 'description', 2000);
      if (description !== undefined) hw.description = description.trim() || undefined;
      const done = optBool(b, 'done');
      if (done !== undefined) hw.done = done;
      await save(ctx.email, 'school', school);
      return { status: 200, body: { homework: (await buildHomework(ctx, school)).find((h) => h.id === hwId) } };
    }
    if (ctx.method === 'DELETE') {
      school.homework[classId] = list.filter((h) => h.id !== n);
      await save(ctx.email, 'school', school);
      return { status: 200, body: { ok: true, deleted: hwId } };
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  if ((HW_SOURCES as readonly string[]).includes(kind)) {
    const all = await buildHomework(ctx, school);
    const item = all.find((h) => h.id === idParts);
    if (!item) throw notFound('Assignment');
    if (ctx.method === 'GET') return { status: 200, body: { homework: item } };
    if (ctx.method === 'PATCH') {
      const keys = Object.keys(ctx.body);
      if (keys.some((k) => k !== 'done')) throw bad(`Imported ${kind} assignments are read-only — only "done" can be changed.`);
      const done = optBool(ctx.body, 'done');
      if (done === undefined) throw bad('"done" is required.');
      school.schoologyDone[tail] = done;
      await save(ctx.email, 'school', school);
      return { status: 200, body: { homework: { ...item, done } } };
    }
    if (ctx.method === 'DELETE') throw bad(`Imported ${kind} assignments can't be deleted — mark them done instead (PATCH {"done": true}).`);
    throw new HttpError(405, 'Method not allowed.');
  }
  throw notFound('Homework');
}

async function classesRoute(ctx: Ctx) {
  if (ctx.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
  const school = await load<StoredSchool | null>(ctx.email, 'school', null);
  return { status: 200, body: { classes: (school?.classes ?? []).map((c) => ({ id: c.id, name: c.name, room: c.room, periods: c.periods })) } };
}

// ── habits ──────────────────────────────────────────────────────────────────────────

function habitOut(h: StoredHabit, ctx: Ctx, withHistory: boolean) {
  const history = h.history ?? [];
  return {
    id: h.id,
    name: h.name,
    time: h.time,
    quote: h.quote,
    doneToday: history.includes(ctx.today),
    streak: habitStreak(history, ctx.today),
    ...(withHistory ? { history: [...history].sort() } : {}),
  };
}

async function habitsRoute(ctx: Ctx, id: string | null) {
  const habits = await loadList<StoredHabit>(ctx.email, 'habits');
  const withHistory = q1(ctx, 'history') === '1';

  if (!id) {
    if (ctx.method === 'GET') return { status: 200, body: { today: ctx.today, habits: habits.map((h) => habitOut(h, ctx, withHistory)) } };
    if (ctx.method === 'POST') {
      const habit: StoredHabit = {
        id: newId('habit'),
        name: reqStr(ctx.body, 'name'),
        time: optTime(ctx.body, 'time') ?? null,
        quote: optStr(ctx.body, 'quote', 300)?.trim() || null,
        streak: 0,
        done: false,
        history: [],
      };
      await save(ctx.email, 'habits', [...habits, habit]);
      return { status: 201, body: { habit: habitOut(habit, ctx, false) } };
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  const habit = habits.find((h) => h.id === id);
  if (!habit) throw notFound('Habit');
  if (ctx.method === 'GET') return { status: 200, body: { habit: habitOut(habit, ctx, true) } };
  if (ctx.method === 'PATCH') {
    const b = ctx.body;
    const name = optStr(b, 'name', 200);
    if (name !== undefined) {
      if (!name.trim()) throw bad('"name" cannot be empty.');
      habit.name = name.trim();
    }
    const time = optTime(b, 'time');
    if (time !== undefined) habit.time = time;
    const quote = optStr(b, 'quote', 300);
    if (quote !== undefined) habit.quote = quote.trim() || null;
    const done = optBool(b, 'done');
    if (done !== undefined) {
      const date = optDate(b, 'date') ?? ctx.today;
      if (diffDays(ctx.today, date) > 0) throw bad('You can\'t check off a habit for a future date.');
      const history = new Set(habit.history ?? []);
      if (done) history.add(date);
      else history.delete(date);
      habit.history = [...history].sort();
    }
    await save(ctx.email, 'habits', habits);
    return { status: 200, body: { habit: habitOut(habit, ctx, false) } };
  }
  if (ctx.method === 'DELETE') {
    await save(ctx.email, 'habits', habits.filter((h) => h.id !== id));
    return { status: 200, body: { ok: true, deleted: id } };
  }
  throw new HttpError(405, 'Method not allowed.');
}

// ── countdowns ──────────────────────────────────────────────────────────────────────

const CD_TYPES = ['birthday', 'holiday', 'anniversary', 'deadline', 'event'] as const;

function countdownOut(c: StoredCountdown, ctx: Ctx) {
  const days = daysUntilNext(c.month, c.day, ctx.today);
  const year = Number(ctx.today.slice(0, 4)) + (diffDays(ctx.today, `${ctx.today.slice(0, 4)}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`) < 0 ? 1 : 0);
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    month: c.month,
    day: c.day,
    nextDate: `${year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`,
    daysUntil: days,
    friendId: c.friendId ?? null,
  };
}

function validMonthDay(month: number, day: number): void {
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > max) throw bad(`Month ${month} has at most ${max} days.`);
}

async function countdownsRoute(ctx: Ctx, id: string | null) {
  const list = await loadList<StoredCountdown>(ctx.email, 'countdowns');
  if (!id) {
    if (ctx.method === 'GET') {
      return { status: 200, body: { countdowns: list.map((c) => countdownOut(c, ctx)).sort((a, b) => a.daysUntil - b.daysUntil) } };
    }
    if (ctx.method === 'POST') {
      const month = optInt(ctx.body, 'month', 1, 12);
      const day = optInt(ctx.body, 'day', 1, 31);
      if (month == null || day == null) throw bad('"month" (1-12) and "day" (1-31) are required.');
      validMonthDay(month, day);
      const c: StoredCountdown = { id: newId('countdown'), name: reqStr(ctx.body, 'name'), month, day, type: oneOf(ctx.body, 'type', CD_TYPES) ?? 'event' };
      await save(ctx.email, 'countdowns', [...list, c]);
      return { status: 201, body: { countdown: countdownOut(c, ctx) } };
    }
    throw new HttpError(405, 'Method not allowed.');
  }
  const c = list.find((x) => x.id === id);
  if (!c) throw notFound('Countdown');
  if (ctx.method === 'GET') return { status: 200, body: { countdown: countdownOut(c, ctx) } };
  if (ctx.method === 'PATCH') {
    const name = optStr(ctx.body, 'name', 200);
    if (name !== undefined) {
      if (!name.trim()) throw bad('"name" cannot be empty.');
      c.name = name.trim();
    }
    const month = optInt(ctx.body, 'month', 1, 12);
    const day = optInt(ctx.body, 'day', 1, 31);
    if (month != null) c.month = month;
    if (day != null) c.day = day;
    validMonthDay(c.month, c.day);
    const type = oneOf(ctx.body, 'type', CD_TYPES);
    if (type) c.type = type;
    await save(ctx.email, 'countdowns', list);
    return { status: 200, body: { countdown: countdownOut(c, ctx) } };
  }
  if (ctx.method === 'DELETE') {
    await save(ctx.email, 'countdowns', list.filter((x) => x.id !== id));
    return { status: 200, body: { ok: true, deleted: id } };
  }
  throw new HttpError(405, 'Method not allowed.');
}

// ── friends (read-only) ─────────────────────────────────────────────────────────────

async function friendsRoute(ctx: Ctx) {
  if (ctx.method !== 'GET') throw new HttpError(405, 'Friends are read-only through the API.');
  const data = await load<{ friends?: Record<string, unknown>[] } | null>(ctx.email, 'friends', null);
  const friends = (data?.friends ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    nickname: f.nickname ?? null,
    birthday: f.birthday ?? null,
    phone: f.phone ?? null,
    address: f.address ?? null,
    notes: f.notes ?? null,
  }));
  return { status: 200, body: { friends } };
}

// ── calendar events ─────────────────────────────────────────────────────────────────

interface EventOut {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  durationMin: number | null;
  description: string | null;
  location: string | null;
  source: 'local' | 'google' | 'ics';
  calendar: string;
  color: string | null;
  locked: boolean;
  editable: boolean;
}

const localKey = (id: string) => `local:local:${id}`;
const googleKey = (account: string, cal: string, id: string) => `${account}:${cal}:${id}`;
const icsKey = (feedId: string, uid: string) => `ics:${feedId}:${uid}`;

function isEventLocked(meta: CalendarMeta, key: string, bareId: string): boolean {
  return meta.locked.includes(key) || meta.locked.includes(bareId);
}

function endTimeFor(start: string | null, durationMin: number | null | undefined): string | null {
  if (!start || !durationMin) return null;
  return addMinutes(start, durationMin).time;
}

function localEventOut(e: StoredLocalEvent, meta: CalendarMeta): EventOut | null {
  const date = appDateToIso(e.date);
  if (!date) return null;
  const allDay = !!e.allDay || e.time === 'All day';
  const startTime = allDay ? null : to24h(e.time);
  const key = localKey(e.id);
  return {
    id: `local:${e.id}`,
    title: e.title,
    date,
    startTime,
    endTime: allDay ? null : endTimeFor(startTime, e.durationMin ?? 60),
    allDay,
    durationMin: allDay ? null : (e.durationMin ?? 60),
    description: e.description ?? null,
    location: e.location ?? null,
    source: 'local',
    calendar: 'FourFold',
    color: meta.colors[key] ?? null,
    locked: isEventLocked(meta, key, e.id),
    editable: true,
  };
}

function googleEventOut(
  ev: GoogleEvent,
  src: { account: string; calendarId: string; calendarName: string; color: string },
  tz: string,
  meta: CalendarMeta,
): EventOut | null {
  const startRaw = ev.start.dateTime ?? ev.start.date;
  if (!startRaw) return null;
  const allDay = !ev.start.dateTime;
  let date: string;
  let startTime: string | null = null;
  let durationMin: number | null = null;
  if (allDay) {
    date = ev.start.date as string;
  } else {
    const start = wallClockIn(tz, new Date(startRaw));
    date = start.date;
    startTime = start.time;
    if (ev.end.dateTime) durationMin = Math.max(0, Math.round((new Date(ev.end.dateTime).getTime() - new Date(startRaw).getTime()) / 60000));
  }
  const key = googleKey(src.account, src.calendarId, ev.id);
  return {
    id: `google:${src.account}:${src.calendarId}:${ev.id}`,
    title: ev.summary || '(no title)',
    date,
    startTime,
    endTime: endTimeFor(startTime, durationMin),
    allDay,
    durationMin,
    description: ev.description ?? null,
    location: ev.location ?? null,
    source: 'google',
    calendar: src.calendarName,
    color: meta.colors[key] ?? src.color,
    locked: isEventLocked(meta, key, ev.id),
    editable: true,
  };
}

async function gatherEvents(ctx: Ctx, from: string, to: string): Promise<{ events: EventOut[]; warnings: string[] }> {
  const meta = await loadMeta(ctx.email);
  const warnings: string[] = [];
  const events: EventOut[] = [];

  // local (FourFold) events
  const local = await loadList<StoredLocalEvent>(ctx.email, 'calendar');
  for (const e of local) {
    const out = localEventOut(e, meta);
    if (out && out.date >= from && out.date <= to) events.push(out);
  }

  // Google calendars (live, through the stored refresh token) and ICS feeds, in parallel
  const accounts = await loadLinkedAccounts(ctx.email);
  const timeMin = new Date(`${from}T00:00:00Z`);
  timeMin.setHours(timeMin.getHours() - 14);
  const timeMax = new Date(`${addDaysIso(to, 1)}T00:00:00Z`);
  timeMax.setHours(timeMax.getHours() + 14);

  const googleJobs = accounts.map(async (acct) => {
    const selected = acct.calendars.filter((c) => c.selected);
    if (selected.length === 0) return;
    const token = await accessTokenFor(ctx.email, acct.email);
    if (!token) {
      warnings.push(`Google account ${acct.email} needs to be reconnected in the app.`);
      return;
    }
    await Promise.all(
      selected.map(async (cal) => {
        try {
          for (const ev of await listGoogleEvents(token, cal.id, timeMin, timeMax)) {
            const out = googleEventOut(ev, { account: acct.email, calendarId: cal.id, calendarName: cal.summary, color: cal.colorOverride || cal.color }, ctx.tz, meta);
            if (out && out.date >= from && out.date <= to) events.push(out);
          }
        } catch {
          warnings.push(`Could not read Google calendar "${cal.summary}".`);
        }
      }),
    );
  });

  const icsJob = (async () => {
    const feeds = await loadStoredFeeds(`fourfold:${ctx.email}:googleIcsFeed`);
    if (feeds.length === 0) return;
    for (const feed of await fetchAllIcsFeeds(feeds)) {
      if (feed.error) warnings.push(`Could not read calendar feed "${feed.label}".`);
      for (const ev of feed.events) {
        const key = icsKey(feed.id, ev.uid);
        const override = meta.icsOverrides[`ics:${feed.id}:${ev.uid}`];
        if (override?.hidden) continue;
        const allDay = override?.allDay ?? ev.allDay;
        let date: string;
        let startTime: string | null = null;
        let durationMin: number | null = null;
        if (allDay && !override?.date) {
          date = ev.startISO.slice(0, 10);
        } else if (override?.date) {
          date = appDateToIso(override.date) ?? ev.startISO.slice(0, 10);
          startTime = allDay ? null : to24h(override.time);
          durationMin = override.durationMin ?? null;
        } else {
          const start = ev.startISO.endsWith('Z') ? wallClockIn(ctx.tz, new Date(ev.startISO)) : { date: ev.startISO.slice(0, 10), time: ev.startISO.slice(11, 16) };
          date = start.date;
          startTime = start.time;
          durationMin = Math.max(0, Math.round((new Date(ev.endISO).getTime() - new Date(ev.startISO).getTime()) / 60000)) || null;
        }
        if (date < from || date > to) continue;
        events.push({
          id: `ics:${feed.id}:${ev.uid}`,
          title: override?.title ?? ev.title,
          date,
          startTime,
          endTime: endTimeFor(startTime, durationMin),
          allDay: !!allDay,
          durationMin,
          description: override?.description ?? ev.description,
          location: override?.location ?? ev.location,
          source: 'ics',
          calendar: feed.label,
          color: meta.colors[key] ?? feed.color ?? null,
          locked: isEventLocked(meta, key, ev.uid),
          editable: true,
        });
      }
    }
  })().catch(() => warnings.push('Could not read the calendar feeds.'));

  await Promise.all([...googleJobs, icsJob]);
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title));
  return { events, warnings };
}

interface EventRef {
  source: 'local' | 'google' | 'ics';
  account?: string;
  calendarId?: string;
  feedId?: string;
  id: string;
}

function parseEventId(raw: string): EventRef {
  const [kind, ...rest] = raw.split(':');
  if (kind === 'local' && rest.length) return { source: 'local', id: rest.join(':') };
  if (kind === 'ics' && rest.length >= 2) return { source: 'ics', feedId: rest[0], id: rest.slice(1).join(':') };
  if (kind === 'google' && rest.length >= 3) return { source: 'google', account: rest[0], calendarId: rest[1], id: rest.slice(2).join(':') };
  throw bad('Event ids look like "local:<id>", "google:<account>:<calendar>:<id>" or "ics:<feed>:<id>" — use the "id" from GET /events.');
}

interface TimingInput {
  allDay: boolean;
  date: string;
  startTime: string | null;
  durationMin: number;
  endTime: string | null;
}

/** Applies create/patch timing fields on top of existing values and resolves end time ↔ duration. */
function resolveTiming(b: Json, base: { allDay: boolean; date: string; startTime: string | null; durationMin: number | null }): TimingInput {
  const allDay = optBool(b, 'allDay') ?? base.allDay;
  const date = optDate(b, 'date') ?? base.date;
  if (!date) throw bad('"date" is required.');
  let startTime = optTime(b, 'startTime');
  if (startTime === undefined) startTime = base.startTime;
  const endTime = optTime(b, 'endTime');
  let durationMin = optInt(b, 'durationMin', 1, 1440);
  if (durationMin === undefined) durationMin = base.durationMin ?? 60;
  if (durationMin === null) durationMin = 60;
  if (allDay) return { allDay, date, startTime: null, durationMin, endTime: null };
  const start = startTime ?? '09:00';
  if (endTime) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    if (diff <= 0) throw bad('"endTime" must be after "startTime" (events can\'t cross midnight — use durationMin).');
    durationMin = diff;
  }
  return { allDay, date, startTime: start, durationMin, endTime: addMinutes(start, durationMin).time };
}

function googleInput(timing: TimingInput, b: Json, tz: string, include: { fields: boolean }): GoogleEventInput {
  return {
    title: include.fields ? optStr(b, 'title', 200) : undefined,
    description: include.fields ? optStr(b, 'description', 2000) : undefined,
    location: include.fields ? optStr(b, 'location', 300) : undefined,
    allDay: timing.allDay,
    date: timing.date,
    startTime: timing.startTime ?? undefined,
    endTime: timing.endTime ?? undefined,
    timeZone: tz,
  };
}

async function listCalendarTargets(ctx: Ctx) {
  const accounts = await loadLinkedAccounts(ctx.email);
  const feeds = await loadStoredFeeds(`fourfold:${ctx.email}:googleIcsFeed`);
  return {
    calendars: [
      { id: 'local', name: 'FourFold', kind: 'local', writable: true },
      ...accounts.flatMap((a) =>
        a.calendars.map((c) => ({ id: `google:${a.email}:${c.id}`, name: c.summary, kind: 'google', account: a.email, selected: c.selected, writable: true })),
      ),
      ...feeds.map((f) => ({ id: `ics:${f.id}`, name: f.label, kind: 'ics', writable: false })),
    ],
  };
}

async function eventsRoute(ctx: Ctx, rawId: string | null) {
  if (!rawId) {
    if (ctx.method === 'GET') {
      const from = q1(ctx, 'from') ?? ctx.today;
      const to = q1(ctx, 'to') ?? addDaysIso(from, 13);
      if (!isIsoDate(from) || !isIsoDate(to)) throw bad('"from" and "to" must be dates like 2026-11-20.');
      if (diffDays(from, to) < 0) throw bad('"to" must not be before "from".');
      if (diffDays(from, to) > 92) throw bad('Date range too long — ask for 92 days or fewer at a time.');
      const { events, warnings } = await gatherEvents(ctx, from, to);
      return { status: 200, body: { from, to, timezone: ctx.tz, events, ...(warnings.length ? { warnings } : {}) } };
    }
    if (ctx.method === 'POST') {
      const b = ctx.body;
      const title = reqStr(b, 'title');
      const timing = resolveTiming(b, { allDay: false, date: '', startTime: null, durationMin: 60 });
      const target = optStr(b, 'calendar', 300) ?? 'local';

      if (target === 'local') {
        const meta = await loadMeta(ctx.email);
        const ev: StoredLocalEvent = {
          id: newId('event'),
          date: isoToAppDate(timing.date),
          time: timing.allDay ? 'All day' : (timing.startTime as string),
          title,
          cls: '',
          durationMin: timing.durationMin,
          description: optStr(b, 'description', 2000),
          location: optStr(b, 'location', 300),
          allDay: timing.allDay || undefined,
        };
        const local = await loadList<StoredLocalEvent>(ctx.email, 'calendar');
        await save(ctx.email, 'calendar', [...local, ev]);
        return { status: 201, body: { event: localEventOut(ev, meta) } };
      }

      let account: string | undefined;
      let calendarId: string | undefined;
      const accounts = await loadLinkedAccounts(ctx.email);
      if (target === 'google') {
        const first = accounts.find((a) => a.calendars.some((c) => c.selected));
        account = first?.email;
        calendarId = first?.calendars.find((c) => c.selected)?.id;
      } else if (target.startsWith('google:')) {
        const parts = target.split(':');
        account = parts[1];
        calendarId = parts.slice(2).join(':');
      }
      if (!account || !calendarId || !accounts.some((a) => a.email === account && a.calendars.some((c) => c.id === calendarId))) {
        throw bad('Unknown calendar. Use "local", "google", or an id from GET /calendars.');
      }
      const token = await accessTokenFor(ctx.email, account);
      if (!token) throw new HttpError(502, `Google account ${account} needs to be reconnected in the app.`);
      const created = await insertGoogleEvent(token, calendarId, { ...googleInput(timing, b, ctx.tz, { fields: true }), title });
      const cal = accounts.find((a) => a.email === account)?.calendars.find((c) => c.id === calendarId);
      const meta = await loadMeta(ctx.email);
      const out = googleEventOut(created, { account, calendarId, calendarName: cal?.summary ?? calendarId, color: cal?.colorOverride || cal?.color || '#4285f4' }, ctx.tz, meta);
      return { status: 201, body: { event: out } };
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  const ref = parseEventId(rawId);
  const meta = await loadMeta(ctx.email);
  const key = ref.source === 'local' ? localKey(ref.id) : ref.source === 'ics' ? icsKey(ref.feedId as string, ref.id) : googleKey(ref.account as string, ref.calendarId as string, ref.id);
  const isLockedNow = isEventLocked(meta, key, ref.id);

  // GET one event: look it up through the same merged view (a wide window, filtered by id)
  if (ctx.method === 'GET') {
    const from = q1(ctx, 'from') ?? addDaysIso(ctx.today, -31);
    const to = q1(ctx, 'to') ?? addDaysIso(ctx.today, 60);
    const found = (await gatherEvents(ctx, from, to)).events.find((e) => e.id === rawId);
    if (!found) throw notFound('Event (searched ±2 months — pass ?from=&to= for other dates)');
    return { status: 200, body: { event: found } };
  }

  if (ctx.method !== 'PATCH' && ctx.method !== 'DELETE') throw new HttpError(405, 'Method not allowed.');

  // lock / colour changes are metadata, allowed even when locked
  if (ctx.method === 'PATCH') {
    const keys = Object.keys(ctx.body);
    const metaOnly = keys.length > 0 && keys.every((k) => k === 'locked' || k === 'color');
    const lockedNext = optBool(ctx.body, 'locked');
    const color = ctx.body.color;
    if (color !== undefined && color !== null && (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))) throw bad('"color" must be a hex color like #4a67e8, or null to clear.');
    if (lockedNext !== undefined || color !== undefined) {
      if (lockedNext !== undefined) {
        const set = new Set(meta.locked);
        set.delete(ref.id);
        if (lockedNext) set.add(key);
        else set.delete(key);
        meta.locked = [...set];
      }
      if (color !== undefined) {
        if (color === null) delete meta.colors[key];
        else meta.colors[key] = color as string;
      }
      await save(ctx.email, 'calendarMeta', meta);
      if (metaOnly) {
        const from = q1(ctx, 'from') ?? addDaysIso(ctx.today, -31);
        const to = q1(ctx, 'to') ?? addDaysIso(ctx.today, 60);
        const found = (await gatherEvents(ctx, from, to)).events.find((e) => e.id === rawId);
        return { status: 200, body: { event: found ?? null } };
      }
    }
  }

  const stillLocked = isLockedNow && !(ctx.method === 'PATCH' && ctx.body.locked === false);
  if (stillLocked) throw locked('event');

  if (ref.source === 'local') {
    const local = await loadList<StoredLocalEvent>(ctx.email, 'calendar');
    const ev = local.find((e) => e.id === ref.id);
    if (!ev) throw notFound('Event');
    if (ctx.method === 'DELETE') {
      await save(ctx.email, 'calendar', local.filter((e) => e.id !== ref.id));
      return { status: 200, body: { ok: true, deleted: rawId } };
    }
    const cur = localEventOut(ev, meta);
    const timing = resolveTiming(ctx.body, { allDay: cur?.allDay ?? false, date: cur?.date ?? '', startTime: cur?.startTime ?? null, durationMin: cur?.durationMin ?? 60 });
    const title = optStr(ctx.body, 'title', 200);
    if (title !== undefined) {
      if (!title.trim()) throw bad('"title" cannot be empty.');
      ev.title = title.trim();
    }
    const description = optStr(ctx.body, 'description', 2000);
    if (description !== undefined) ev.description = description;
    const location = optStr(ctx.body, 'location', 300);
    if (location !== undefined) ev.location = location;
    ev.date = isoToAppDate(timing.date);
    ev.allDay = timing.allDay || undefined;
    ev.time = timing.allDay ? 'All day' : (timing.startTime as string);
    ev.durationMin = timing.durationMin;
    await save(ctx.email, 'calendar', local);
    return { status: 200, body: { event: localEventOut(ev, await loadMeta(ctx.email)) } };
  }

  if (ref.source === 'google') {
    const token = await accessTokenFor(ctx.email, ref.account as string);
    if (!token) throw new HttpError(502, `Google account ${ref.account} needs to be reconnected in the app.`);
    try {
      if (ctx.method === 'DELETE') {
        await deleteGoogleEvent(token, ref.calendarId as string, ref.id);
        return { status: 200, body: { ok: true, deleted: rawId } };
      }
      const touchesTiming = ['date', 'startTime', 'endTime', 'durationMin', 'allDay'].some((k) => k in ctx.body);
      let input: GoogleEventInput = { ...googleInput({ allDay: false, date: '', startTime: null, durationMin: 60, endTime: null }, ctx.body, ctx.tz, { fields: true }), date: undefined, allDay: undefined, startTime: undefined, endTime: undefined };
      if (touchesTiming) {
        // Timing edits need the current values for anything not supplied.
        const current = (await gatherEvents(ctx, q1(ctx, 'from') ?? addDaysIso(ctx.today, -31), q1(ctx, 'to') ?? addDaysIso(ctx.today, 60))).events.find((e) => e.id === rawId);
        if (!current) throw notFound('Event (pass ?from=&to= covering its date)');
        input = googleInput(resolveTiming(ctx.body, current), ctx.body, ctx.tz, { fields: true });
      }
      const updated = await patchGoogleEvent(token, ref.calendarId as string, ref.id, input);
      const cal = (await loadLinkedAccounts(ctx.email)).find((a) => a.email === ref.account)?.calendars.find((c) => c.id === ref.calendarId);
      return {
        status: 200,
        body: { event: googleEventOut(updated, { account: ref.account as string, calendarId: ref.calendarId as string, calendarName: cal?.summary ?? (ref.calendarId as string), color: cal?.colorOverride || cal?.color || '#4285f4' }, ctx.tz, await loadMeta(ctx.email)) },
      };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(502, 'Google Calendar rejected that change.');
    }
  }

  // ICS: read-only upstream, so edits and deletes are local overrides, same as in the app.
  const overrideKey = `ics:${ref.feedId}:${ref.id}`;
  if (ctx.method === 'DELETE') {
    meta.icsOverrides[overrideKey] = { hidden: true };
    await save(ctx.email, 'calendarMeta', meta);
    return { status: 200, body: { ok: true, deleted: rawId, note: 'Hidden in FourFold — the upstream feed is read-only.' } };
  }
  const current = (await gatherEvents(ctx, q1(ctx, 'from') ?? addDaysIso(ctx.today, -31), q1(ctx, 'to') ?? addDaysIso(ctx.today, 60))).events.find((e) => e.id === rawId);
  if (!current) throw notFound('Event (pass ?from=&to= covering its date)');
  const timing = resolveTiming(ctx.body, current);
  meta.icsOverrides[overrideKey] = {
    ...(meta.icsOverrides[overrideKey] ?? {}),
    date: isoToAppDate(timing.date),
    time: timing.allDay ? 'All day' : (timing.startTime as string),
    durationMin: timing.durationMin,
    allDay: timing.allDay,
    title: optStr(ctx.body, 'title', 200)?.trim() || current.title,
    description: optStr(ctx.body, 'description', 2000) ?? current.description ?? undefined,
    location: optStr(ctx.body, 'location', 300) ?? current.location ?? undefined,
  };
  await save(ctx.email, 'calendarMeta', meta);
  const refreshed = (await gatherEvents(ctx, timing.date, timing.date)).events.find((e) => e.id === rawId);
  return { status: 200, body: { event: refreshed ?? null } };
}

// ── summary ("what's on today") ─────────────────────────────────────────────────────

async function summaryRoute(ctx: Ctx) {
  if (ctx.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
  const [{ events, warnings }, matrix, habits, countdowns, school] = await Promise.all([
    gatherEvents(ctx, ctx.today, ctx.today),
    loadMatrix(ctx.email),
    loadList<StoredHabit>(ctx.email, 'habits'),
    loadList<StoredCountdown>(ctx.email, 'countdowns'),
    load<StoredSchool | null>(ctx.email, 'school', null),
  ]);
  const open = QUADS.flatMap((qd) => matrix[qd].filter((t) => !t.done).map((t) => taskOut(t, qd)));
  const homework = (await buildHomework(ctx, { ...emptySchool(), ...school })).filter((h) => !h.done);
  const soon = addDaysIso(ctx.today, 2);
  return {
    status: 200,
    body: {
      date: ctx.today,
      timezone: ctx.tz,
      events,
      tasks: {
        open: open.length,
        overdue: open.filter((t) => t.dueDate && t.dueDate < ctx.today),
        dueToday: open.filter((t) => t.dueDate === ctx.today),
        doFirst: open.filter((t) => t.quadrant === 'q1'),
      },
      homework: {
        open: homework.length,
        overdue: homework.filter((h) => h.due && h.due < ctx.today),
        dueSoon: homework.filter((h) => h.due && h.due >= ctx.today && h.due <= soon),
      },
      habits: {
        total: habits.length,
        doneToday: habits.filter((h) => (h.history ?? []).includes(ctx.today)).length,
        remaining: habits.filter((h) => !(h.history ?? []).includes(ctx.today)).map((h) => ({ id: h.id, name: h.name, streak: habitStreak(h.history ?? [], ctx.today) })),
      },
      countdowns: countdowns
        .map((c) => countdownOut(c, ctx))
        .sort((a, b) => a.daysUntil - b.daysUntil)
        .slice(0, 3),
      ...(warnings.length ? { warnings } : {}),
    },
  };
}

function indexRoute(ctx: Ctx) {
  return {
    status: 200,
    body: {
      name: 'FourFold API',
      version: 1,
      timezone: ctx.tz,
      today: ctx.today,
      note: 'Send "Authorization: Bearer <token>". Dates are YYYY-MM-DD, times HH:MM (24h) in ?tz= (IANA name, default UTC).',
      endpoints: {
        'GET /api/v1/summary': 'Everything due today: events, tasks, homework, habits, countdowns',
        'GET|POST /api/v1/events': 'Calendar events (FourFold, Google, ICS). GET ?from=&to= · POST {title,date,startTime?,durationMin?,allDay?,calendar?}',
        'GET|PATCH|DELETE /api/v1/events/:id': 'One event; PATCH also takes {locked,color}',
        'GET /api/v1/calendars': 'Calendars you can write events to',
        'GET|POST /api/v1/tasks': 'Matrix tasks. GET ?quadrant=&status=open|done|all&due_before= · POST {title,quadrant?,dueDate?,durationMin?}',
        'GET|PATCH|DELETE /api/v1/tasks/:id': 'PATCH {title,done,dueDate,quadrant,time,durationMin,locked,…}',
        'GET|POST /api/v1/homework': 'All homework (typed-in + Schoology/Canvas/Classroom). GET ?status=&class=&quadrant=&days= · POST {class,title,due?,priority?}',
        'GET|PATCH|DELETE /api/v1/homework/:id': 'PATCH {done,title,due,priority} (imported assignments: only done)',
        'GET /api/v1/classes': 'Your classes',
        'GET|POST /api/v1/habits': 'Habits with today status and streak',
        'GET|PATCH|DELETE /api/v1/habits/:id': 'PATCH {done: true|false, date?, name?, time?, quote?}',
        'GET|POST /api/v1/countdowns': 'Countdowns with days remaining',
        'GET|PATCH|DELETE /api/v1/countdowns/:id': 'PATCH {name,month,day,type}',
        'GET /api/v1/friends': 'Friends (read-only)',
      },
    },
  };
}

// ── entry point ─────────────────────────────────────────────────────────────────────

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
    const tz = validTimeZone(Array.isArray(tzRaw) ? tzRaw[0] : tzRaw);
    const method = req.method ?? 'GET';
    const body: Json = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Json) : {};
    if ((method === 'POST' || method === 'PATCH') && req.body !== undefined && req.body !== null && (typeof req.body !== 'object' || Array.isArray(req.body))) {
      throw bad('Send a JSON object as the request body (Content-Type: application/json).');
    }

    const ctx: Ctx = { email, tz, today: isoDateIn(tz), query: req.query, body, method };

    let result: { status: number; body: unknown };
    switch (resource) {
      case '':
        result = indexRoute(ctx);
        break;
      case 'summary':
        result = await summaryRoute(ctx);
        break;
      case 'events':
        result = await eventsRoute(ctx, id);
        break;
      case 'calendars':
        if (method !== 'GET') throw new HttpError(405, 'Method not allowed.');
        result = { status: 200, body: await listCalendarTargets(ctx) };
        break;
      case 'tasks':
        result = await tasksRoute(ctx, id);
        break;
      case 'homework':
        result = await homeworkRoute(ctx, id);
        break;
      case 'classes':
        result = await classesRoute(ctx);
        break;
      case 'habits':
        result = await habitsRoute(ctx, id);
        break;
      case 'countdowns':
        result = await countdownsRoute(ctx, id);
        break;
      case 'friends':
        result = await friendsRoute(ctx);
        break;
      default:
        throw notFound(`Endpoint "/${resource}"`);
    }
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
