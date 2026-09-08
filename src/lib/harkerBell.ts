// Client for the Harker MS bell schedule API: https://msbell.harker.org/docs/api.html
// Public, unauthenticated endpoint — safe to call directly from the browser.
const BASE_URL = 'https://msbell.dev.harker.org/api';

export interface BellPeriod {
  name: string;
  start: string; // ISO 8601, UTC
  end: string; // ISO 8601, UTC
}

export interface BellSchedule {
  date: string; // ISO 8601, UTC midnight
  code: string; // usually 'A' | 'B' | 'C' | 'D', or blank
  variant?: string; // 'special' | 'adjusted', if applicable
  name?: string; // name of the modified schedule or holiday
  schedule: BellPeriod[];
}

export async function fetchBellSchedule(date: Date): Promise<BellSchedule> {
  const params = new URLSearchParams({
    month: String(date.getMonth() + 1),
    day: String(date.getDate()),
    year: String(date.getFullYear()),
  });
  const res = await fetch(`${BASE_URL}/schedule?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Bell schedule request failed: ${res.status}`);
  return res.json();
}

/**
 * Converts a schedule timestamp to a decimal hour (e.g. 9:30am -> 9.5).
 * The API encodes Harker's local wall-clock time with a "Z" (UTC) suffix rather than
 * true UTC, so the wall-clock hour must be read from the UTC fields, not local ones
 * (using local getters would re-interpret it through the viewer's own timezone).
 */
export function isoToLocalHour(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** True when the whole day is a single named block (holiday / no-school day). */
export function isNoSchoolDay(sched: BellSchedule): boolean {
  return sched.schedule.length === 1 && !!sched.schedule[0].name;
}

/** Finds the period block for a given class-period number (e.g. 1 -> "Class 1"), if it meets that day. */
export function findPeriod(sched: BellSchedule, period: number): BellPeriod | undefined {
  const target = `class ${period}`;
  return sched.schedule.find((p) => p.name.trim().toLowerCase() === target);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Walks forward day by day (starting today) to find the next date this class actually meets,
 * honoring day overrides (special/no-school presets) ahead of the normal bell schedule.
 * Returns a YYYY-MM-DD string suitable for an `<input type="date">`, or null if none found within range.
 */
export async function findNextClassMeeting(
  classId: string,
  periods: number[],
  overrides: Record<string, { presetId: string | null }>,
  presets: { id: string; meetings: { classId: string }[] }[],
  from: Date = new Date(),
  maxDays = 21,
): Promise<string | null> {
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const key = dayKey(d);
    const override = overrides[key];

    if (override) {
      if (override.presetId === null) continue; // no school this date
      const preset = presets.find((p) => p.id === override.presetId);
      if (preset?.meetings.some((m) => m.classId === classId)) return key;
      continue;
    }

    if (periods.length === 0) continue;
    try {
      const sched = await fetchBellSchedule(d);
      if (isNoSchoolDay(sched)) continue;
      if (periods.some((p) => findPeriod(sched, p))) return key;
    } catch {
      continue;
    }
  }
  return null;
}
