/**
 * Server-side ports of the small pieces of app logic the public API needs (date handling in the
 * user's timezone, habit streaks, homework → Eisenhower quadrant). src/ and api/ compile under
 * separate tsconfigs, so — like api/_lib/scheduling.ts — these are kept in sync by hand with
 * src/lib/{due,habitStats,urgency,useQuadrantHomework,homeworkMerge}.ts.
 */

export type QuadKey = 'q1' | 'q2' | 'q3' | 'q4';

/** Days before a due date at which homework counts as urgent (see src/lib/useQuadrantHomework.ts). */
export const HOMEWORK_URGENT_DAYS = 2;

export function validTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" for the given instant as seen in `tz`. */
export function isoDateIn(tz: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Wall-clock { date: "YYYY-MM-DD", time: "HH:MM" } for an instant as seen in `tz`. */
export function wallClockIn(tz: string, at: Date): { date: string; time: string } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso` (both "YYYY-MM-DD"). */
export function diffDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

export function isHHMM(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** Any of "HH:MM", "9:00 AM", "9 PM" → "HH:MM"; null for "All day"/unparseable. */
export function to24h(time: string | null | undefined): string | null {
  if (!time) return null;
  const t = time.trim();
  const ampm = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(t);
  if (ampm) {
    const h = (Number(ampm[1]) % 12) + (ampm[3].toUpperCase() === 'PM' ? 12 : 0);
    return `${pad(h)}:${ampm[2] ?? '00'}`;
  }
  const h24 = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (h24 && Number(h24[1]) < 24 && Number(h24[2]) < 60) return `${pad(Number(h24[1]))}:${h24[2]}`;
  return null;
}

export function addMinutes(hhmm: string, minutes: number): { time: string; dayOffset: number } {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const dayOffset = Math.floor(total / 1440);
  const t = ((total % 1440) + 1440) % 1440;
  return { time: `${pad(Math.floor(t / 60))}:${pad(t % 60)}`, dayOffset };
}

/** The app stores event dates as "YYYY-M-D" with a 0-based month; the API speaks ISO dates. */
export function appDateToIso(app: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(app);
  return m ? `${m[1]}-${pad(Number(m[2]) + 1)}-${pad(Number(m[3]))}` : null;
}

export function isoToAppDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}-${m - 1}-${d}`;
}

// ── habits ────────────────────────────────────────────────────────────────────────────

export function habitStreak(history: string[], todayIso: string): number {
  const set = new Set(history);
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    if (!set.has(addDaysIso(todayIso, -i))) break;
    streak++;
  }
  return streak;
}

// ── countdowns ────────────────────────────────────────────────────────────────────────

/** Days until the next occurrence of month/day (1-based month); 0 = today. */
export function daysUntilNext(month: number, day: number, todayIso: string): number {
  const [y] = todayIso.split('-').map(Number);
  let target = `${y}-${pad(month)}-${pad(day)}`;
  if (diffDays(todayIso, target) < 0) target = `${y + 1}-${pad(month)}-${pad(day)}`;
  return diffDays(todayIso, target);
}

// ── homework ──────────────────────────────────────────────────────────────────────────

export type HwPriority = 'high' | 'med' | 'low';

/** Where homework lands on the matrix: priority decides importance, overdue / due within
 * HOMEWORK_URGENT_DAYS decides urgency. Imported assignments count as medium unless their ICS
 * priority says otherwise. */
export function homeworkQuadrant(item: { manualPriority?: HwPriority; icsPriority?: number | null; dueIso: string | null }, todayIso: string): QuadKey {
  const days = item.dueIso ? diffDays(todayIso, item.dueIso) : null;
  const urgent = days !== null && days <= HOMEWORK_URGENT_DAYS;
  const priority: HwPriority = item.manualPriority ?? (item.icsPriority && item.icsPriority >= 6 ? 'low' : item.icsPriority && item.icsPriority <= 4 ? 'high' : 'med');
  if (priority === 'high') return 'q1';
  if (priority === 'med') return urgent ? 'q1' : 'q2';
  return urgent ? 'q3' : 'q4';
}

export interface ClassLike {
  id: string;
  name: string;
}

/** Manual mapping wins; otherwise exact/fuzzy match against class names. */
function matchCategory(category: string, classes: ClassLike[], mappings: Record<string, string>): string | null {
  const key = category.trim().toLowerCase();
  if (!key) return null;
  if (mappings[key]) return mappings[key];
  const exact = classes.find((c) => c.name.trim().toLowerCase() === key);
  if (exact) return exact.id;
  const fuzzy = classes.find((c) => {
    const n = c.name.trim().toLowerCase();
    return n && (n.includes(key) || key.includes(n));
  });
  return fuzzy?.id ?? null;
}

export function matchAssignmentToClass(
  a: { categories: string[]; title: string; description: string | null },
  classes: ClassLike[],
  mappings: Record<string, string>,
  keywords: Record<string, string[]>,
): string | null {
  for (const cat of a.categories) {
    const match = matchCategory(cat, classes, mappings);
    if (match) return match;
  }
  const haystack = `${a.title} ${a.description ?? ''}`.toLowerCase();
  for (const cls of classes) {
    if ((keywords[cls.id] || []).some((kw) => kw.trim() && haystack.includes(kw.trim().toLowerCase()))) return cls.id;
  }
  return null;
}

/** Due value from the app/LMS ("YYYY-MM-DD" or a full ISO instant) → "YYYY-MM-DD" in `tz`. */
export function dueToIso(due: string | null | undefined, tz: string): string | null {
  if (!due) return null;
  if (isIsoDate(due)) return due;
  const text: string = due;
  const t = new Date(text);
  if (Number.isNaN(t.getTime())) return null;
  // Date-only feed values arrive as local midnight with no zone; keep their calendar day.
  if (/T00:00:00$/.test(text)) return text.slice(0, 10);
  return isoDateIn(tz, t);
}
