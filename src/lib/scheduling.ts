import type { CalEvent } from '../state/CalendarContext';

export interface FreeSlotOptions {
  /** Don't return a slot starting before this instant. Defaults to now. */
  after?: Date;
  /** Don't return a slot that would run past this instant (e.g. a task's due date). */
  before?: Date;
  /** Earliest hour of the day considered available (0-23). Defaults to 8. */
  dayStartHour?: number;
  /** Latest hour of the day considered available (0-23). Defaults to 22. */
  dayEndHour?: number;
  /** How many days ahead to search when `before` isn't given. Defaults to 30. */
  searchDays?: number;
}

interface Interval {
  start: Date;
  end: Date;
}

/**
 * Parses a CalEvent's date + time into a concrete interval for conflict checking.
 * "All day" events aren't tied to a specific block of hours, so they're excluded
 * from busy time rather than blocking the whole day.
 */
function parseEventInterval(ev: CalEvent): Interval | null {
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

/**
 * Finds the earliest open block of `durationMin` minutes that doesn't overlap any
 * event in `events`, searching forward day by day within [dayStartHour, dayEndHour).
 * Returns null when no such block exists before `before` (or within the search window).
 */
export function findNextFreeSlot(events: CalEvent[], durationMin: number, opts: FreeSlotOptions = {}): Date | null {
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
