import { useCalendarEvents } from '../state/CalendarContext';
import type { TaskLink } from '../state/MatrixContext';
import { findNextFreeSlot } from './scheduling';

function endOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59);
}

export interface AutoScheduleInput {
  title: string;
  dueDate: string | null;
  durationMin: number | null;
  link: TaskLink | null;
}

export interface AutoScheduleResult {
  link: TaskLink | null;
  time: string | null;
}

/**
 * Given a task's priority-quadrant duration estimate, finds the next open calendar
 * slot of that length (before the due date, if one is set) and books it, so setting
 * a task's time estimate is what actually puts it on the calendar.
 */
export function useAutoSchedule() {
  const { events, addEvent } = useCalendarEvents();

  return async function autoSchedule(input: AutoScheduleInput): Promise<AutoScheduleResult> {
    if (!input.durationMin) return { link: input.link, time: null };

    const before = input.dueDate ? endOfDay(input.dueDate) : undefined;
    const slot = findNextFreeSlot(events, input.durationMin, { before });
    if (!slot) return { link: input.link, time: null };

    const dateKey = `${slot.getFullYear()}-${slot.getMonth()}-${slot.getDate()}`;
    const timeStr = `${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}`;
    const created = await addEvent(dateKey, input.title, timeStr, input.durationMin);
    if (!created) return { link: input.link, time: null };

    return {
      link: input.link ?? { type: 'event', id: created.id, label: created.title },
      time: created.time,
    };
  };
}
