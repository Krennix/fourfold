export function getWeekRange(reference: Date = new Date(), days = 7): { start: Date; end: Date } {
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + days - 1);
  return { start, end };
}

/** True if `dateStr` (any Date-parseable string) falls within the next `days` days, inclusive of today. */
export function isWithinDays(dateStr: string | null | undefined, days: number, reference: Date = new Date()): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const startOfToday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()).getTime();
  const diffDays = (d.getTime() - startOfToday) / 86400000;
  return diffDays >= 0 && diffDays < days;
}

/** Matches CalendarContext's `CalEvent.date` format exactly: "Y-M-D", 0-based month, no padding. */
export function calendarDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
