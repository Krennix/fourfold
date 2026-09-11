export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeStreak(history: string[], today: Date = new Date()): number {
  const set = new Set(history);
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (!set.has(dateKey(d))) break;
    streak++;
  }
  return streak;
}

/** Longest run of consecutive days ever present in `history`, regardless of recency. */
export function computeLongestStreak(history: string[]): number {
  const sortedKeys = [...new Set(history)].sort();
  let longest = 0;
  let current = 0;
  let prevTime: number | null = null;
  for (const key of sortedKeys) {
    const t = new Date(key).getTime();
    current = prevTime !== null && t - prevTime === 86400000 ? current + 1 : 1;
    longest = Math.max(longest, current);
    prevTime = t;
  }
  return longest;
}

/** % of the last `windowDays` calendar days (including today) present in `history`. */
export function computeCompletionRate(history: string[], windowDays: number, today: Date = new Date()): number {
  const set = new Set(history);
  let hits = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (set.has(dateKey(d))) hits++;
  }
  return Math.round((hits / windowDays) * 100);
}
