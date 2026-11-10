import { useMemo } from 'react';
import { useSchool, type Homework } from '../state/SchoolContext';
import { useSchoology } from '../state/SchoologyContext';
import { useCanvas } from '../state/CanvasContext';
import { useClassroom } from '../state/ClassroomContext';
import { matchAssignmentToClass, mergeHomeworkForClass, type MergedHomeworkItem } from './homeworkMerge';
import { computeUrgency, isPastDue } from './urgency';
import { daysUntil } from './due';
import type { QuadKey } from '../state/MatrixContext';

/** Homework counts as urgent when it's overdue or due within this many days. */
export const HOMEWORK_URGENT_DAYS = 2;

/**
 * Where a piece of homework lands on the Eisenhower matrix:
 *
 *   importance  your priority (High/Medium = important, Low = not). Imported assignments have no
 *               priority of their own, so they count as important unless the feed marks them low.
 *   urgency     overdue or due within HOMEWORK_URGENT_DAYS days.
 *
 *   important + urgent → Do first      important, not urgent → Schedule
 *   not important + urgent → Delegate  neither → Eliminate
 *
 * "High" is always Do first — that's what marking it high means.
 */
export function homeworkQuadrant(item: Pick<MergedHomeworkItem, 'source' | 'priorityLabel' | 'due' | 'icsPriority'>, now = new Date()): QuadKey {
  const days = item.due ? daysUntil(item.due, now) : null;
  const urgent = days !== null && days <= HOMEWORK_URGENT_DAYS;
  const priority: Homework['priority'] =
    item.source === 'manual' ? (item.priorityLabel ?? 'med') : item.icsPriority && item.icsPriority >= 6 ? 'low' : item.icsPriority && item.icsPriority <= 4 ? 'high' : 'med';
  if (priority === 'high') return 'q1';
  if (priority === 'med') return urgent ? 'q1' : 'q2';
  return urgent ? 'q3' : 'q4';
}

/** One-line reason shown next to homework on the matrix, so its placement isn't a mystery. */
export function homeworkQuadrantReason(item: Pick<MergedHomeworkItem, 'source' | 'priorityLabel' | 'due' | 'icsPriority'>, now = new Date()): string {
  const days = item.due ? daysUntil(item.due, now) : null;
  const urgent = days !== null && days <= HOMEWORK_URGENT_DAYS;
  const pri = item.source === 'manual' ? { high: 'High', med: 'Medium', low: 'Low' }[item.priorityLabel ?? 'med'] : null;
  const when = days === null ? 'no due date' : days < 0 ? 'overdue' : urgent ? `due within ${HOMEWORK_URGENT_DAYS} days` : 'not due soon';
  return pri ? `${pri} priority, ${when}` : `Imported assignment, ${when}`;
}

/** Stable id shared with the public API (/api/v1/homework) and the assistant: "manual:<class>:<n>" or "<source>:<uid>". */
export function homeworkRef(h: Pick<MergedHomeworkItem, 'source' | 'homeworkId' | 'uid'> & { classId: string | null }): string {
  return h.source === 'manual' ? `manual:${h.classId}:${h.homeworkId}` : `${h.source}:${h.uid}`;
}

export interface HomeworkEntry extends MergedHomeworkItem {
  /** Class this belongs to, or null for an imported assignment that didn't match any class. */
  classId: string | null;
  className: string;
  quad: QuadKey;
  reason: string;
}

/** Every homework item — typed-in homework plus assignments imported from Schoology, Canvas and
 * Google Classroom — including imported ones that couldn't be matched to a class. */
export function useAllHomework(): HomeworkEntry[] {
  const { classes, homework, schoologyDone, classMappings, classKeywords } = useSchool();
  const { assignments: schoologyAssignments } = useSchoology();
  const { assignments: canvasAssignments } = useCanvas();
  const { assignments: classroomAssignments } = useClassroom();

  return useMemo(() => {
    const assignments = [...schoologyAssignments, ...canvasAssignments, ...classroomAssignments];
    const out: HomeworkEntry[] = [];
    const decorate = (item: MergedHomeworkItem, classId: string | null, className: string): HomeworkEntry => ({
      ...item,
      classId,
      className,
      quad: homeworkQuadrant(item),
      reason: homeworkQuadrantReason(item),
    });
    for (const c of classes) {
      for (const item of mergeHomeworkForClass(c.id, homework[c.id] || [], assignments, classes, classMappings, classKeywords, schoologyDone)) {
        out.push(decorate(item, c.id, c.name));
      }
    }
    for (const a of assignments) {
      if (matchAssignmentToClass(a, classes, classMappings, classKeywords) !== null) continue;
      const done = schoologyDone[a.uid] ?? false;
      if (done && isPastDue(a.due)) continue;
      out.push(
        decorate(
          {
            key: `${a.source}-${a.uid}`,
            source: a.source,
            title: a.title,
            due: a.due || null,
            done,
            urgency: computeUrgency(a.due || null, a.priority),
            uid: a.uid,
            description: a.description ?? undefined,
            points: a.points,
            url: a.url,
            icsPriority: a.priority,
          },
          null,
          a.categories[0]?.trim() || 'Unsorted',
        ),
      );
    }
    return out;
  }, [classes, homework, schoologyDone, classMappings, classKeywords, schoologyAssignments, canvasAssignments, classroomAssignments]);
}

export interface HomeworkTaskRow {
  source: 'homework';
  classId: string | null;
  hwId?: number;
  uid?: string;
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  listTag: string;
  durationMin: null;
  time: null;
  description?: string;
  /** Why it's in this quadrant, e.g. "Medium priority, due within 2 days". */
  reason: string;
}

/** Homework grouped into the Eisenhower quadrant implied by its priority and due date. */
export function useQuadrantHomework(): Record<QuadKey, HomeworkTaskRow[]> {
  const all = useAllHomework();
  return useMemo(() => {
    const rows: Record<QuadKey, HomeworkTaskRow[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const hw of all) {
      rows[hw.quad].push({
        source: 'homework',
        classId: hw.classId,
        hwId: hw.homeworkId,
        uid: hw.uid,
        id: `hw-${hw.key}`,
        title: hw.title,
        done: hw.done,
        dueDate: hw.due,
        listTag: hw.className,
        durationMin: null,
        time: null,
        description: hw.description,
        reason: hw.reason,
      });
    }
    return rows;
  }, [all]);
}
