export type Urgency = 'red' | 'yellow' | 'blue';

const URGENCY_RANK: Record<Urgency, number> = { red: 0, yellow: 1, blue: 2 };

/** Most-urgent-first rank (red < yellow < blue). */
export function urgencyRank(u: Urgency): number {
  return URGENCY_RANK[u];
}

/** ICS PRIORITY 1-9 (RFC 5545): 1-4 high, 5 normal, 6-9 low. 0/absent = no signal. */
export function urgencyFromIcsPriority(priority: number | null | undefined): Urgency | null {
  if (!priority) return null;
  if (priority <= 4) return 'red';
  if (priority === 5) return 'yellow';
  return 'blue';
}

/** Date-based fallback. `due` may be null/unparseable -> lowest urgency (blue). */
export function urgencyFromDue(due: string | null | undefined, now: Date = new Date()): Urgency {
  if (!due) return 'blue';
  const dueDate = new Date(due);
  if (Number.isNaN(dueDate.getTime())) return 'blue';
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daysUntil = (dueDate.getTime() - startOfToday) / dayMs;
  if (daysUntil <= 0) return 'red';
  if (daysUntil <= 3) return 'yellow';
  return 'blue';
}

/** ICS PRIORITY wins when present, else date-based. */
export function computeUrgency(due: string | null | undefined, priority: number | null | undefined, now?: Date): Urgency {
  return urgencyFromIcsPriority(priority) ?? urgencyFromDue(due, now);
}

export function isPastDue(due: string | null | undefined, now: Date = new Date()): boolean {
  if (!due) return false;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
