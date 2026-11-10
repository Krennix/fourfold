export type DueTone = 'overdue' | 'today' | 'soon' | 'later';

/** Parses "YYYY-MM-DD" as a local date (not UTC midnight); anything else via Date(). */
export function parseDue(due: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(due);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysUntil(due: string, now = new Date()): number | null {
  const d = parseDue(due);
  if (!d) return null;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

export function dueInfo(due: string | null | undefined, now = new Date()): { label: string; tone: DueTone } | null {
  if (!due) return null;
  const diff = daysUntil(due, now);
  const d = parseDue(due);
  if (diff === null || !d) return { label: due, tone: 'later' };
  if (diff < -1) return { label: `${-diff} days overdue`, tone: 'overdue' };
  if (diff === -1) return { label: 'Yesterday', tone: 'overdue' };
  if (diff === 0) return { label: 'Today', tone: 'today' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (diff < 7) return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), tone: diff <= 3 ? 'soon' : 'later' };
  return {
    label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }),
    tone: 'later',
  };
}
