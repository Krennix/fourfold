import type { QuadKey } from '../state/MatrixContext';

/**
 * Natural-language quick-add for tasks, e.g.
 *   "Finish history essay tomorrow 3pm 45m !1"
 *   "Call grandma sat"
 *   "Study chem in 3 days 1h30m #q2"
 *
 * Recognised (anywhere in the text, case-insensitive):
 *   priority  !1 … !4, #q1 … #q4, "!!" or "asap", or "urgent" as the last word (= urgent & important)
 *   due date  today, tonight, tomorrow/tmr, mon…sun (next occurrence), this/next fri, next week,
 *             in N days / in a week, YYYY-MM-DD, M/D, "nov 20" / "20 nov", "the 16th", eod
 *             (a leading "due", "due on", "by"… is swallowed with it)
 *   time      in 2 hours, 3pm, 3:30pm, 15:00, @noon, at 9 (with an am/pm or "at"; a bare 1–6 means pm)
 *             this weekend, eow; "tomorrow morning" / "this evening" pick a rough time
 *   duration  30m, 45min, 1h, 1.5h, 1h30m, "for 2 hours", "half an hour"
 * Whatever's left over becomes the title, minus casual filler ("ohh yah", "is due", "or smth").
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

/** Leading "due"/"by"/"on"… that belongs to a date, so it's consumed along with it. */
const DUE_PREFIX = '(?:(?:(?:is|are)\\s+)?due\\s+)?(?:(?:on|by|before|until|till|for)\\s+)?';

const SMALL_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** Casual lead-ins that carry no meaning ("ohh yah", "remember to", "so"). */
const LEADING_FILLER = /^(?:(?:o+h+|a+h+|u+m+|u+h+|h+m+|ya+h+|yea+h*|yep|yup|ok(?:ay)?|so|hey|btw|also|and|then|remember to|don'?t forget to|need to|gotta|have to|i need to)[\s,]+)+/i;
/** Hedging that trails a casual entry ("or smth", "i think", "ish"). */
const TRAILING_FILLER = /(?:[\s,]+(?:or\s+)?(?:smth|something|sth|idk|maybe|ish|whatever|lol|i\s+think|i\s+guess|or\s+so))+$/i;
/** Connector words left dangling once the date/time was lifted out ("essay outline is due"). */
const DANGLING = /(?:[\s,]+(?:is|are|due|on|by|at|for|the|this|next|before|until|till|@))+$/i;

/** 1–6 → pm, 7–11 → am: nobody means a 3 a.m. deadline when they type "@3". */
function guessHour(h: number, raw: string): number {
  if (raw.startsWith('0') || h < 1 || h > 6) return h;
  return h + 12;
}

export function parseQuickAdd(input: string, now = new Date()): ParsedQuickAdd {
  // Commas/semicolons glued to a word ("monday, 3pm") would defeat the word-boundary checks below.
  let text = ` ${input.replace(/[,;](?=\s|$)/g, ' $&').replace(/\.+\s*$/, '')} `;
  const chips: ParsedQuickAdd['chips'] = [];
  let quad: QuadKey = 'q2';
  let quadSet = false;
  let dueDate: string | null = null;
  let time: string | null = null;
  let durationMin: number | null = null;
  let extracted = false;

  // Uses the *last* match, so a leading word ("Monday standup notes mon") stays in the title.
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    const all = [...text.matchAll(global)];
    const m = all[all.length - 1];
    if (!m || m.index === undefined) return;
    if (fn(m) === false) return;
    text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
    extracted = true;
  };

  // priority
  take(/\s(?:!|#q)([1-4])(?=\s)/i, (m) => {
    quad = `q${m[1]}` as QuadKey;
    quadSet = true;
  });
  if (!quadSet) take(/\s!!(?=\s)/, () => { quad = 'q1'; quadSet = true; });
  if (!quadSet) take(/\s(?:asap|urgent)(?=\s*$)|\sasap(?=\s)/i, () => { quad = 'q1'; quadSet = true; });
  if (quadSet) chips.push({ kind: 'quad', label: QUAD_SHORT[quad] });

  // relative time — "in 2 hours", "in 30 min" (before duration, which would otherwise claim "2 hours")
  take(/\s(?:due\s+)?in\s+(\d+(?:\.\d+)?|an?|half\s+an)\s*(hours?|hrs?|h|minutes?|mins?|m)(?=\s)/i, (m) => {
    const n = /^\d/.test(m[1]) ? parseFloat(m[1]) : m[1].toLowerCase().startsWith('half') ? 0.5 : 1;
    const mins = Math.round(n * (m[2].toLowerCase().startsWith('h') ? 60 : 1));
    // Round up to the next 5 minutes so the booked slot looks intentional.
    const when = new Date(Math.ceil((now.getTime() + mins * 60000) / 300000) * 300000);
    time = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
    dueDate = isoDate(when);
  });

  // duration (before time, so "1h" isn't read as an hour-of-day)
  take(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)(?:\s*(\d+)\s*(?:m|min|mins|minutes?))?(?=\s)/i, (m) => {
    durationMin = Math.round(parseFloat(m[1]) * 60) + (m[3] ? Number(m[3]) : 0);
  });
  if (durationMin === null) {
    take(/\s(?:for\s+)?(\d+)\s*(?:m|min|mins|minutes?)(?=\s)/i, (m) => {
      durationMin = Number(m[1]);
    });
  }
  if (durationMin === null) {
    take(/\s(?:for\s+)?(half\s+(?:an?\s+)?hour|an?\s+hour)(?=\s)/i, (m) => {
      durationMin = m[1].toLowerCase().startsWith('half') ? 30 : 60;
    });
  }
  if (durationMin) chips.push({ kind: 'duration', label: formatDuration(durationMin) });

  // explicit time
  take(/\s(?:due\s+)?(?:(?:at|by)\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)/i, (m) => {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'pm') h += 12;
    const mm = m[2] ? Number(m[2]) : 0;
    if (h > 23 || mm > 59) return false;
    time = `${pad(h)}:${pad(mm)}`;
  });
  if (!time) {
    take(/\s(?:at|by)\s+(noon|midnight)(?=\s)|\s@\s*(noon|midnight)(?=\s)/i, (m) => {
      time = (m[1] ?? m[2]).toLowerCase() === 'noon' ? '12:00' : '23:59';
    });
  }
  if (!time) {
    take(/\s(?:at\s+|@\s*)(\d{1,2})(?::(\d{2}))?(?=\s)/i, (m) => {
      const h = Number(m[1]);
      const mm = m[2] ? Number(m[2]) : 0;
      if (h > 23 || mm > 59) return false;
      time = `${pad(guessHour(h, m[1]))}:${pad(mm)}`;
    });
  }
  if (!time) {
    take(/\s(\d{1,2}):(\d{2})(?=\s)/, (m) => {
      const h = Number(m[1]);
      const mm = Number(m[2]);
      if (h > 23 || mm > 59) return false;
      time = `${pad(guessHour(h, m[1]))}:${pad(mm)}`;
    });
  }

  // date — each form also swallows a leading "due", "due on", "by"…
  const setDate = (d: Date) => {
    dueDate = isoDate(d);
  };
  take(new RegExp(`\\s${DUE_PREFIX}(today|tod|tonight)(?=\\s)`, 'i'), (m) => {
    setDate(now);
    if (m[1].toLowerCase() === 'tonight' && !time) time = '20:00';
  });
  if (!dueDate) take(new RegExp(`\\s${DUE_PREFIX}(?:tomorrow|tmr|tmrw)(?=\\s)`, 'i'), () => setDate(addDays(now, 1)));
  if (!dueDate) take(new RegExp(`\\s${DUE_PREFIX}next\\s+week(?=\\s)`, 'i'), () => setDate(addDays(now, 7)));
  if (!dueDate) take(new RegExp(`\\s${DUE_PREFIX}(?:this\\s+weekend|the\\s+weekend)(?=\\s)`, 'i'), () => setDate(addDays(now, (6 - now.getDay() + 7) % 7)));
  if (!dueDate) take(new RegExp(`\\s${DUE_PREFIX}(?:eow|end\\s+of\\s+(?:the\\s+)?week)(?=\\s)`, 'i'), () => setDate(addDays(now, (5 - now.getDay() + 7) % 7)));
  if (!dueDate) {
    take(new RegExp(`\\s${DUE_PREFIX}in\\s+(\\d+|an?|one|two|three|four|five|six)\\s+(day|days|week|weeks)(?=\\s)`, 'i'), (m) => {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : SMALL_NUMBERS[m[1].toLowerCase()];
      setDate(addDays(now, n * (m[2].toLowerCase().startsWith('week') ? 7 : 1)));
    });
  }
  if (!dueDate) {
    // "next fri" = that day in the calendar week after this one (weeks start Monday);
    // "this fri" = the coming one, today included; a bare weekday never means today.
    take(new RegExp(`\\s${DUE_PREFIX}(?:(next|this)\\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|urday|sday)?(?=\\s)`, 'i'), (m) => {
      const idx = WEEKDAYS.indexOf(m[2].slice(0, 3).toLowerCase());
      const which = m[1]?.toLowerCase();
      if (which === 'next') {
        const toNextMonday = (8 - now.getDay()) % 7 || 7;
        setDate(addDays(now, toNextMonday + ((idx + 6) % 7)));
        return;
      }
      let diff = (idx - now.getDay() + 7) % 7;
      if (diff === 0 && which !== 'this') diff = 7;
      setDate(addDays(now, diff));
    });
  }
  if (!dueDate) {
    take(new RegExp(`\\s${DUE_PREFIX}(\\d{4})-(\\d{2})-(\\d{2})(?=\\s)`), (m) => setDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  }
  if (!dueDate) {
    take(new RegExp(`\\s${DUE_PREFIX}(\\d{1,2})/(\\d{1,2})(?=\\s)`), (m) => {
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
    const byMonthDay = new RegExp(`\\s${DUE_PREFIX}(${monthRe})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, 'i');
    const byDayMonth = new RegExp(`\\s${DUE_PREFIX}(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthRe})[a-z]*\\.?(?=\\s)`, 'i');
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
  if (!dueDate) {
    // "the 16th" — the next time that day-of-month comes around (today counts).
    take(new RegExp(`\\s${DUE_PREFIX}the\\s+(\\d{1,2})(?:st|nd|rd|th)(?=\\s)`, 'i'), (m) => {
      const day = Number(m[1]);
      if (day < 1 || day > 31) return false;
      let d = new Date(now.getFullYear(), now.getMonth(), day);
      if (d < addDays(now, 0)) d = new Date(now.getFullYear(), now.getMonth() + 1, day);
      setDate(d);
    });
  }
  // "eod" / "end of day" adds nothing but "today" when no other date was given.
  take(/\s(?:by\s+)?(?:eod|cob|end\s+of\s+(?:the\s+)?day)(?=\s)/i, () => {
    if (!dueDate) setDate(now);
  });
  // "tomorrow morning", "this evening" — a rough time for the day part (never overrides an explicit one).
  take(/\s(?:(this)\s+)?(?:in\s+the\s+)?(morning|afternoon|evening|night)(?=\s)/i, (m) => {
    if (!dueDate && !m[1]) return false;
    if (!dueDate) setDate(now);
    if (!time) time = { morning: '09:00', afternoon: '15:00', evening: '19:00', night: '20:00' }[m[2].toLowerCase() as 'morning'];
  });
  // A bare time with no date means today — or tomorrow, if that time has already passed.
  if (time && !dueDate) {
    const [h, mi] = (time as string).split(':').map(Number);
    const passed = h * 60 + mi <= now.getHours() * 60 + now.getMinutes();
    dueDate = isoDate(passed ? addDays(now, 1) : now);
  }
  if (dueDate) chips.push({ kind: 'date', label: friendlyDate(dueDate, now) });
  if (time) chips.push({ kind: 'time', label: friendlyTime(time) });

  let title = text.replace(/\s+/g, ' ').replace(/\s+([,;])/g, '$1').trim();
  title = title.replace(LEADING_FILLER, '');
  // Only trim connectors when something was lifted out — otherwise "Log on" is just "Log on".
  if (extracted) {
    for (let prev = ''; prev !== title; ) {
      prev = title;
      title = title.replace(TRAILING_FILLER, '').replace(DANGLING, '').replace(/[\s,;]+$/, '');
    }
  }
  title = title.trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  // Order chips: quad, date, time, duration
  const order = { quad: 0, date: 1, time: 2, duration: 3 } as const;
  chips.sort((a, b) => order[a.kind] - order[b.kind]);
  return { title, quad, dueDate, time, durationMin, chips };
}
