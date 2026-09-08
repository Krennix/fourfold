import type { Homework, SchoolClass } from '../state/SchoolContext';
import type { SchoologyAssignment } from '../state/SchoologyContext';
import { computeUrgency, isPastDue, urgencyRank, type Urgency } from './urgency';

export interface MergedHomeworkItem {
  key: string;
  source: 'manual' | 'schoology';
  title: string;
  due: string | null;
  done: boolean;
  urgency: Urgency;
  priorityLabel?: Homework['priority'];
  uid?: string;
  homeworkId?: number;
}

/** Manual mapping wins; otherwise exact/fuzzy match against class names. */
export function matchCategoryToClass(
  category: string,
  classes: SchoolClass[],
  mappings: Record<string, string>,
): string | null {
  const key = category.trim().toLowerCase();
  if (!key) return null;
  if (mappings[key]) return mappings[key];
  const exact = classes.find((c) => c.name.trim().toLowerCase() === key);
  if (exact) return exact.id;
  const fuzzy = classes.find((c) => {
    const n = c.name.trim().toLowerCase();
    return n && (n.includes(key) || key.includes(n));
  });
  return fuzzy?.id ?? null;
}

export function mergeHomeworkForClass(
  classId: string,
  manual: Homework[],
  assignments: SchoologyAssignment[],
  classes: SchoolClass[],
  mappings: Record<string, string>,
  schoologyDone: Record<string, boolean>,
  now: Date = new Date(),
): MergedHomeworkItem[] {
  const manualItems: MergedHomeworkItem[] = manual.map((hw) => ({
    key: `manual-${hw.id}`,
    source: 'manual',
    title: hw.title,
    due: hw.due || null,
    done: hw.done,
    urgency: computeUrgency(hw.due || null, null, now),
    priorityLabel: hw.priority,
    homeworkId: hw.id,
  }));

  const matched = assignments.filter((a) =>
    a.categories.some((cat) => matchCategoryToClass(cat, classes, mappings) === classId),
  );
  const schoologyItems: MergedHomeworkItem[] = matched.map((a) => ({
    key: `schoology-${a.uid}`,
    source: 'schoology',
    title: a.title,
    due: a.due || null,
    done: schoologyDone[a.uid] ?? false,
    urgency: computeUrgency(a.due || null, a.priority, now),
    uid: a.uid,
  }));

  const all = [...manualItems, ...schoologyItems].filter((item) => !(item.done && isPastDue(item.due, now)));

  all.sort((a, b) => {
    if (!a.due && !b.due) return 0;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return new Date(a.due).getTime() - new Date(b.due).getTime();
  });

  return all;
}

export function classBadge(openItems: MergedHomeworkItem[]): { count: number; color: Urgency } | null {
  if (openItems.length === 0) return null;
  let color: Urgency = 'blue';
  for (const item of openItems) {
    if (urgencyRank(item.urgency) < urgencyRank(color)) color = item.urgency;
  }
  return { count: openItems.length, color };
}

/** Distinct categories seen across the feed that don't resolve to any class, for the Settings mapping UI. */
export function unmatchedCategories(
  assignments: SchoologyAssignment[],
  classes: SchoolClass[],
  mappings: Record<string, string>,
): string[] {
  const seen = new Set<string>();
  for (const a of assignments) {
    for (const cat of a.categories) {
      if (cat.trim()) seen.add(cat.trim());
    }
  }
  return Array.from(seen).filter((cat) => !matchCategoryToClass(cat, classes, mappings));
}

/** All distinct categories seen across the feed, for the Settings mapping UI. */
export function allCategories(assignments: SchoologyAssignment[]): string[] {
  const seen = new Set<string>();
  for (const a of assignments) {
    for (const cat of a.categories) {
      if (cat.trim()) seen.add(cat.trim());
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}
