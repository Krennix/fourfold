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
