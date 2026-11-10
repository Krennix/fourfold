import type { QuadKey } from '../state/MatrixContext';

/**
 * Natural-language quick-add for tasks, e.g.
 *   "Finish history essay tomorrow 3pm 45m !1"
 *   "Call grandma sat"
 *   "Study chem in 3 days 1h30m #q2"
 *
 * Recognised (anywhere in the text, case-insensitive):
 *   priority  !1 … !4, #q1 … #q4, or "!!" (= urgent & important)
 *   due date  today, tonight, tomorrow/tmr, mon…sun (next occurrence), next week, in N days,
 *             YYYY-MM-DD, M/D, "nov 20" / "20 nov"
 *   time      3pm, 3:30pm, 15:00, at 9 (with an am/pm or "at")
 *   duration  30m, 45min, 1h, 1.5h, 1h30m, "for 2 hours"
 * Whatever's left over becomes the title.
 */
export interface ParsedQuickAdd {
  title: string;
  quad: QuadKey;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
  /** "HH:MM" 24-hour */
  time: string | null;
  durationMin: number | null;
  /** Human-readable pieces that were recognised, for showing chips while typing. */
  chips: { kind: 'quad' | 'date' | 'time' | 'duration'; label: string }[];
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export const QUAD_SHORT: Record<QuadKey, string> = {
  q1: 'Do first',
  q2: 'Schedule',
  q3: 'Delegate',
  q4: 'Eliminate',
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function friendlyDate(iso: string, now = new Date()): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return target.toLocaleDateString(undefined, { weekday: 'long' });
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(y !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

export function friendlyTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: m ? '2-digit' : undefined });
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function parseQuickAdd(input: string, now = new Date()): ParsedQuickAdd {
  let text = ` ${input} `;
  const chips: ParsedQuickAdd['chips'] = [];
  let quad: QuadKey = 'q2';
  let quadSet = false;
  let dueDate: string | null = null;
  let time: string | null = null;
  let durationMin: number | null = null;

  // Uses the *last* match, so a leading word ("Monday standup notes mon") stays in the title.
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    const all = [...text.matchAll(global)];
    const m = all[all.length - 1];
    if (!m || m.index === undefined) return;
    if (fn(m) === false) return;
    text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
  };

  // priority
  take(/\s(?:!|#q)([1-4])(?=\s)/i, (m) => {
    quad = `q${m[1]}` as QuadKey;
    quadSet = true;
  });
  if (!quadSet) take(/\s!!(?=\s)/, () => { quad = 'q1'; quadSet = true; });
  if (quadSet) chips.push({ kind: 'quad', label: QUAD_SHORT[quad] });

  // duration (before time, so "1h" isn't read as an hour-of-day)
  take(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)(?:\s*(\d+)\s*(?:m|min|mins|minutes?))?(?=\s)/i, (m) => {
    durationMin = Math.round(parseFloat(m[1]) * 60) + (m[3] ? Number(m[3]) : 0);
  });
  if (durationMin === null) {
    take(/\s(?:for\s+)?(\d+)\s*(?:m|min|mins|minutes?)(?=\s)/i, (m) => {
      durationMin = Number(m[1]);
    });
  }
  if (durationMin) chips.push({ kind: 'duration', label: formatDuration(durationMin) });

  // explicit time
  take(/\s(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)/i, (m) => {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'pm') h += 12;
    const mm = m[2] ? Number(m[2]) : 0;
    if (h > 23 || mm > 59) return false;
    time = `${pad(h)}:${pad(mm)}`;
  });
  if (!time) {
    take(/\s(?:at\s+|@\s*)(\d{1,2})(?::(\d{2}))?(?=\s)/i, (m) => {
      const h = Number(m[1]);
      const mm = m[2] ? Number(m[2]) : 0;
      if (h > 23 || mm > 59) return false;
      time = `${pad(h)}:${pad(mm)}`;
    });
  }
  if (!time) {
    take(/\s(\d{1,2}):(\d{2})(?=\s)/, (m) => {
      const h = Number(m[1]);
      const mm = Number(m[2]);
      if (h > 23 || mm > 59) return false;
      time = `${pad(h)}:${pad(mm)}`;
    });
  }

  // date
  const setDate = (d: Date) => {
    dueDate = isoDate(d);
  };
  take(/\s(today|tod|tonight)(?=\s)/i, (m) => {
    setDate(now);
    if (m[1].toLowerCase() === 'tonight' && !time) time = '20:00';
  });
  if (!dueDate) take(/\s(tomorrow|tmr|tmrw)(?=\s)/i, () => setDate(addDays(now, 1)));
  if (!dueDate) take(/\snext\s+week(?=\s)/i, () => setDate(addDays(now, 7)));
  if (!dueDate) take(/\sin\s+(\d+)\s+(day|days|week|weeks)(?=\s)/i, (m) => setDate(addDays(now, Number(m[1]) * (m[2].startsWith('week') ? 7 : 1))));
  if (!dueDate) {
    take(/\s(?:on\s+|by\s+|next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|urday|sday)?(?=\s)/i, (m) => {
      const idx = WEEKDAYS.indexOf(m[1].slice(0, 3).toLowerCase());
      let diff = (idx - now.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      setDate(addDays(now, diff));
    });
  }
  if (!dueDate) {
    take(/\s(\d{4})-(\d{2})-(\d{2})(?=\s)/, (m) => setDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  }
  if (!dueDate) {
    take(/\s(\d{1,2})\/(\d{1,2})(?=\s)/, (m) => {
      const mo = Number(m[1]) - 1;
      const day = Number(m[2]);
      if (mo > 11 || day > 31 || day < 1) return false;
      let d = new Date(now.getFullYear(), mo, day);
      if (d < addDays(now, 0)) d = new Date(now.getFullYear() + 1, mo, day);
      setDate(d);
    });
  }
  if (!dueDate) {
    const monthRe = MONTHS.join('|');
    const byMonthDay = new RegExp(`\\s(?:on\\s+|by\\s+)?(${monthRe})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, 'i');
    const byDayMonth = new RegExp(`\\s(?:on\\s+|by\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthRe})[a-z]*\\.?(?=\\s)`, 'i');
    const apply = (monthName: string, dayStr: string) => {
      const mo = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase());
      const day = Number(dayStr);
      if (day < 1 || day > 31) return false;
      let d = new Date(now.getFullYear(), mo, day);
      if (d < addDays(now, 0)) d = new Date(now.getFullYear() + 1, mo, day);
      setDate(d);
    };
    take(byMonthDay, (m) => apply(m[1], m[2]));
    if (!dueDate) take(byDayMonth, (m) => apply(m[2], m[1]));
  }
  // A bare time with no date means today.
  if (time && !dueDate) dueDate = isoDate(now);
  if (dueDate) chips.push({ kind: 'date', label: friendlyDate(dueDate, now) });
  if (time) chips.push({ kind: 'time', label: friendlyTime(time) });

  const title = text.replace(/\s+/g, ' ').trim();
  // Order chips: quad, date, time, duration
  const order = { quad: 0, date: 1, time: 2, duration: 3 } as const;
  chips.sort((a, b) => order[a.kind] - order[b.kind]);
  return { title, quad, dueDate, time, durationMin, chips };
}
