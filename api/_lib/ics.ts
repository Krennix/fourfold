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
          events.push({
            uid,
            title: current.SUMMARY ? unescapeText(current.SUMMARY.value) : 'Untitled assignment',
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
