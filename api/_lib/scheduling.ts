/** Minimal CalEvent shape needed for conflict scanning — mirrors src/state/CalendarContext.tsx's CalEvent. */
export interface AgentCalEvent {
  id: string;
  date: string; // "YYYY-M-D" with 0-based month
  time: string;
  title: string;
  durationMin?: number;
}

export interface FreeSlotOptions {
  after?: Date;
  before?: Date;
  dayStartHour?: number;
  dayEndHour?: number;
  searchDays?: number;
}

interface Interval {
  start: Date;
  end: Date;
}

function parseEventInterval(ev: AgentCalEvent): Interval | null {
  if (ev.time === 'All day') return null;
  const [y, m, d] = ev.date.split('-').map(Number);

  let hour: number | null = null;
  let minute = 0;
  const ampmMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(ev.time.trim());
  const h24Match = /^(\d{1,2}):(\d{2})$/.exec(ev.time.trim());
  if (ampmMatch) {
    hour = Number(ampmMatch[1]) % 12;
    minute = Number(ampmMatch[2]);
    if (ampmMatch[3].toUpperCase() === 'PM') hour += 12;
  } else if (h24Match) {
    hour = Number(h24Match[1]);
    minute = Number(h24Match[2]);
  }
  if (hour === null) return null;

  const start = new Date(y, m, d, hour, minute);
  const end = new Date(start.getTime() + (ev.durationMin ?? 60) * 60000);
  return { start, end };
}

/** Server-side port of src/lib/scheduling.ts's findNextFreeSlot — kept in sync manually since api/ and src/ compile under separate tsconfigs. */
export function findNextFreeSlot(events: AgentCalEvent[], durationMin: number, opts: FreeSlotOptions = {}): Date | null {
  const dayStartHour = opts.dayStartHour ?? 8;
  const dayEndHour = opts.dayEndHour ?? 22;
  const after = opts.after ?? new Date();
  const before = opts.before ?? new Date(after.getTime() + (opts.searchDays ?? 30) * 24 * 60 * 60 * 1000);

  const busy = events
    .map(parseEventInterval)
    .filter((iv): iv is Interval => iv !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let cursor = new Date(after);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(Math.ceil(cursor.getMinutes() / 5) * 5);

  while (cursor < before) {
    const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), dayStartHour, 0);
    const dayEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), dayEndHour, 0);
    if (cursor < dayStart) cursor = dayStart;

    const slotEnd = new Date(cursor.getTime() + durationMin * 60000);
    if (cursor >= dayEnd || slotEnd > dayEnd) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, dayStartHour, 0);
      continue;
    }

    const conflict = busy.find((b) => cursor < b.end && slotEnd > b.start);
    if (!conflict) return slotEnd > before ? null : cursor;
    cursor = new Date(conflict.end);
  }
  return null;
}

/** Repeatedly calls findNextFreeSlot, excluding previously-found slots, to return up to `count` candidates. */
export function findFreeSlots(events: AgentCalEvent[], durationMin: number, count: number, opts: FreeSlotOptions = {}): Date[] {
  const slots: Date[] = [];
  let after = opts.after;
  for (let i = 0; i < count; i++) {
    const slot = findNextFreeSlot(events, durationMin, { ...opts, after });
    if (!slot) break;
    slots.push(slot);
    after = new Date(slot.getTime() + durationMin * 60000);
  }
  return slots;
}
