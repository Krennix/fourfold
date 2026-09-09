export interface IcsEvent {
  uid: string;
  title: string;
  description: string | null;
  /** ISO 8601 due date/time. */
  due: string;
  allDay: boolean;
  /** Course/category names from the ICS CATEGORIES property, if present. */
  categories: string[];
  /** RFC 5545 PRIORITY (1-4 high, 5 normal, 6-9 low, 0/absent = none). */
  priority: number | null;
}

function unfold(text: string): string[] {
  const raw = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseDate(value: string, params: Record<string, string>): { iso: string; allDay: boolean } | null {
  const v = value.trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const y = v.slice(0, 4);
    const mo = v.slice(4, 6);
    const d = v.slice(6, 8);
    return { iso: `${y}-${mo}-${d}T00:00:00`, allDay: true };
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`;
  return { iso, allDay: false };
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

export interface IcsCalendarEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startISO: string;
  endISO: string;
  allDay: boolean;
}

/** Parses VEVENT blocks out of an ICS feed into full start/end calendar events (unlike
 * `parseIcsEvents`, which only tracks a single due date for assignment-style feeds). Used for
 * read-only Google Calendar "secret address" subscriptions. */
export function parseIcsCalendarEvents(text: string): IcsCalendarEvent[] {
  const lines = unfold(text);
  const events: IcsCalendarEvent[] = [];
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const startRaw = current.DTSTART;
        const start = startRaw ? parseDate(startRaw.value, startRaw.params) : null;
        if (start) {
          const endRaw = current.DTEND;
          const end = endRaw ? parseDate(endRaw.value, endRaw.params) : null;
          const uid = current.UID?.value ?? `${current.SUMMARY?.value ?? 'event'}-${start.iso}`;
          events.push({
            uid,
            title: current.SUMMARY ? unescapeText(current.SUMMARY.value) : '(no title)',
            description: current.DESCRIPTION ? unescapeText(current.DESCRIPTION.value) : null,
            location: current.LOCATION ? unescapeText(current.LOCATION.value) : null,
            startISO: start.iso,
            endISO: end?.iso ?? start.iso,
            allDay: start.allDay,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const [name, ...paramParts] = rawKey.split(';');
    const params: Record<string, string> = {};
    for (const part of paramParts) {
      const [pk, pv] = part.split('=');
      if (pk && pv) params[pk] = pv;
    }
    current[name.toUpperCase()] = { value, params };
  }

  return events;
}

/** Parses VEVENT blocks out of an ICS feed. Assignments without a start/due date are skipped. */
export function parseIcsEvents(text: string): IcsEvent[] {
  const lines = unfold(text);
  const events: IcsEvent[] = [];
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const dt = current.DTSTART ?? current.DTEND ?? current.DUE;
        const parsed = dt ? parseDate(dt.value, dt.params) : null;
        const uid = current.UID?.value ?? `${current.SUMMARY?.value ?? 'event'}-${parsed?.iso ?? ''}`;
        if (parsed) {
          const categoriesRaw = current.CATEGORIES ? unescapeText(current.CATEGORIES.value) : '';
          const categories = categoriesRaw
            .split(/(?<!\\),/)
            .map((s) => s.trim())
            .filter(Boolean);
          const priorityNum = current.PRIORITY ? Number(current.PRIORITY.value) : NaN;
          const priority = Number.isFinite(priorityNum) && priorityNum > 0 ? priorityNum : null;
          const title = current.SUMMARY ? unescapeText(current.SUMMARY.value) : 'Untitled assignment';
          // Many Schoology feeds don't set CATEGORIES; the course name often shows up
          // as a trailing "(Course Name)" on the title instead — use that as a fallback.
          const titleCourseMatch = /\(([^()]+)\)\s*$/.exec(title);
          if (titleCourseMatch && !categories.includes(titleCourseMatch[1].trim())) {
            categories.push(titleCourseMatch[1].trim());
          }
          events.push({
            uid,
            title,
            description: current.DESCRIPTION ? unescapeText(current.DESCRIPTION.value) : null,
            due: parsed.iso,
            allDay: parsed.allDay,
            categories,
            priority,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const [name, ...paramParts] = rawKey.split(';');
    const params: Record<string, string> = {};
    for (const part of paramParts) {
      const [pk, pv] = part.split('=');
      if (pk && pv) params[pk] = pv;
    }
    current[name.toUpperCase()] = { value, params };
  }

  return events;
}
