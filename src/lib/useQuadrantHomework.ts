import { useMemo } from 'react';
import { useSchool, type Homework } from '../state/SchoolContext';
import { useSchoology } from '../state/SchoologyContext';
import { mergeHomeworkForClass, type MergedHomeworkItem } from './homeworkMerge';
import type { QuadKey } from '../state/MatrixContext';
import type { Urgency } from './urgency';

/** Maps a homework item's priority onto an Eisenhower quadrant so it surfaces on the matrix too. */
const PRIORITY_QUAD: Record<Homework['priority'], QuadKey> = { high: 'q1', med: 'q2', low: 'q4' };
/** Schoology items have no manual priority — fall back to due-date/ICS-priority urgency. */
const URGENCY_QUAD: Record<Urgency, QuadKey> = { red: 'q1', yellow: 'q2', blue: 'q4' };

export interface HomeworkTaskRow {
  source: 'homework';
  classId: string;
  hwId?: number;
  uid?: string;
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  listTag: string;
  durationMin: null;
  time: null;
}

/** Places each class's merged homework/assignment items into the Eisenhower quadrant implied by its priority or urgency. */
export function useQuadrantHomework(): Record<QuadKey, HomeworkTaskRow[]> {
  const { classes, homework, schoologyDone, classMappings, classKeywords } = useSchool();
  const { assignments } = useSchoology();

  const classById = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c])), [classes]);

  const mergedByClass = useMemo(() => {
    const out: Record<string, MergedHomeworkItem[]> = {};
    for (const c of classes) {
      out[c.id] = mergeHomeworkForClass(c.id, homework[c.id] || [], assignments, classes, classMappings, classKeywords, schoologyDone);
    }
    return out;
  }, [classes, homework, assignments, classMappings, classKeywords, schoologyDone]);

  return useMemo(() => {
    const homeworkRows: Record<QuadKey, HomeworkTaskRow[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const [classId, items] of Object.entries(mergedByClass)) {
      for (const hw of items) {
        const quad = hw.source === 'manual' ? PRIORITY_QUAD[hw.priorityLabel!] : URGENCY_QUAD[hw.urgency];
        homeworkRows[quad].push({
          source: 'homework',
          classId,
          hwId: hw.homeworkId,
          uid: hw.uid,
          id: `hw-${hw.key}`,
          title: hw.title,
          done: hw.done,
          dueDate: hw.due,
          listTag: classById[classId]?.name ?? 'School',
          durationMin: null,
          time: null,
        });
      }
    }
    return homeworkRows;
  }, [mergedByClass, classById]);
}
