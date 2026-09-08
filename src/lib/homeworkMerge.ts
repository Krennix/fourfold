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

/**
 * Resolves an assignment to a class id using, in order: its categories (real ICS
 * CATEGORIES or a guessed trailing "(Course)" on the title), then per-class keywords
 * matched as a substring against the title/description. Keywords are the fallback for
 * feeds that expose no course-identifying field at all.
 */
export function matchAssignmentToClass(
  assignment: Pick<SchoologyAssignment, 'categories' | 'title' | 'description'>,
  classes: SchoolClass[],
  mappings: Record<string, string>,
  classKeywords: Record<string, string[]>,
): string | null {
  for (const cat of assignment.categories) {
    const match = matchCategoryToClass(cat, classes, mappings);
    if (match) return match;
  }
  const haystack = `${assignment.title} ${assignment.description ?? ''}`.toLowerCase();
  for (const cls of classes) {
    const keywords = classKeywords[cls.id] || [];
    if (keywords.some((kw) => kw.trim() && haystack.includes(kw.trim().toLowerCase()))) return cls.id;
  }
  return null;
}

export function mergeHomeworkForClass(
  classId: string,
  manual: Homework[],
  assignments: SchoologyAssignment[],
  classes: SchoolClass[],
  mappings: Record<string, string>,
  classKeywords: Record<string, string[]>,
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

  const matched = assignments.filter((a) => matchAssignmentToClass(a, classes, mappings, classKeywords) === classId);
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
