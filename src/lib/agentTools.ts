import type { CalendarContextValue } from '../state/CalendarContext';
import type { MatrixContextValue, QuadKey } from '../state/MatrixContext';
import type { SchoolContextValue } from '../state/SchoolContext';
import type { HabitsContextValue } from '../state/HabitsContext';
import type { CountdownsContextValue } from '../state/CountdownsContext';
import { homeworkRef, type HomeworkEntry } from './useQuadrantHomework';

export interface AgentToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AgentToolDeps {
  calendar: CalendarContextValue;
  matrix: MatrixContextValue;
  school: SchoolContextValue;
  homework: HomeworkEntry[];
  habits: HabitsContextValue;
  countdowns: CountdownsContextValue;
}

function isQuadKey(v: unknown): v is QuadKey {
  return v === 'q1' || v === 'q2' || v === 'q3' || v === 'q4';
}

function findTask(matrix: MatrixContextValue, quadrant: QuadKey, taskId: string) {
  return matrix.tasks[quadrant].find((t) => t.id === taskId);
}

/** Executes a write tool Claude requested against the real app state. Read tools are executed server-side. */
export async function executeWriteTool(call: AgentToolCall, deps: AgentToolDeps): Promise<unknown> {
  const { input } = call;
  const { calendar, matrix, school, homework, habits, countdowns } = deps;

  switch (call.name) {
    case 'create_event': {
      const created = await calendar.addEvent(
        String(input.date),
        String(input.title),
        String(input.time),
        typeof input.durationMin === 'number' ? input.durationMin : undefined,
      );
      return created ?? { error: 'Could not create the event.' };
    }
    case 'move_event': {
      const existing = calendar.events.find((e) => e.id === input.id);
      if (!existing) return { error: 'No such event.' };
      if (existing.locked) return { error: 'This event is locked ("set in stone") and cannot be moved. Ask the user to unlock it first.' };
      const source = { accountEmail: existing.accountEmail, calendarId: existing.calendarId };
      const updated = await calendar.updateEvent(
        String(input.id),
        String(input.date),
        existing.title,
        String(input.time),
        existing.durationMin,
        undefined,
        source,
      );
      return updated ?? { error: 'Could not move the event.' };
    }
    case 'remove_event': {
      const existing = calendar.events.find((e) => e.id === input.id);
      if (existing?.locked) return { error: 'This event is locked ("set in stone") and cannot be deleted. Ask the user to unlock it first.' };
      calendar.removeEvent(String(input.id), existing ? { accountEmail: existing.accountEmail, calendarId: existing.calendarId } : undefined);
      return { ok: true };
    }
    case 'create_task': {
      if (!isQuadKey(input.quadrant)) return { error: 'Invalid quadrant.' };
      matrix.addTask(input.quadrant, {
        title: String(input.title),
        dueDate: typeof input.dueDate === 'string' ? input.dueDate : null,
        durationMin: typeof input.durationMin === 'number' ? input.durationMin : null,
      });
      return { ok: true };
    }
    case 'schedule_task': {
      if (!isQuadKey(input.quadrant)) return { error: 'Invalid quadrant.' };
      if (findTask(matrix, input.quadrant, String(input.taskId))?.locked) {
        return { error: 'This task is locked ("set in stone") and cannot be rescheduled. Ask the user to unlock it first.' };
      }
      matrix.scheduleTask(input.quadrant, String(input.taskId), String(input.time));
      return { ok: true };
    }
    case 'unschedule_task': {
      if (!isQuadKey(input.quadrant)) return { error: 'Invalid quadrant.' };
      if (findTask(matrix, input.quadrant, String(input.taskId))?.locked) {
        return { error: 'This task is locked ("set in stone") and cannot be unscheduled. Ask the user to unlock it first.' };
      }
      matrix.unscheduleTask(input.quadrant, String(input.taskId));
      return { ok: true };
    }
    case 'mark_task_done': {
      if (!isQuadKey(input.quadrant)) return { error: 'Invalid quadrant.' };
      matrix.toggleDone(input.quadrant, String(input.taskId));
      return { ok: true };
    }
    case 'add_homework': {
      const ref = String(input.class ?? '').trim().toLowerCase();
      const cls = school.classes.find((c) => c.id.toLowerCase() === ref || c.name.trim().toLowerCase() === ref);
      if (!cls) return { error: `Unknown class "${input.class}". Known classes: ${school.classes.map((c) => c.name).join(', ') || 'none set up yet'}.` };
      const title = String(input.title ?? '').trim();
      if (!title) return { error: 'A title is required.' };
      const due = typeof input.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.due) ? input.due : '';
      const priority = input.priority === 'high' || input.priority === 'low' ? input.priority : 'med';
      school.addHomework(cls.id, { title, due, priority });
      return { ok: true, class: cls.name };
    }
    case 'set_homework_done': {
      const item = homework.find((h) => homeworkRef(h) === String(input.id));
      if (!item) return { error: 'No such homework. Use an id from get_homework.' };
      const done = input.done !== false;
      if (item.done === done) return { ok: true, note: 'Already in that state.' };
      if (item.source === 'manual' && item.classId && item.homeworkId !== undefined) school.toggleHomework(item.classId, item.homeworkId);
      else if (item.uid) school.toggleSchoologyHomeworkDone(item.uid);
      return { ok: true };
    }
    case 'set_habit_done': {
      const habit = habits.habits.find((h) => h.id === String(input.id));
      if (!habit) return { error: 'No such habit. Use an id from get_habits.' };
      const done = input.done !== false;
      if (habit.done !== done) habits.toggleHabit(habit.id);
      return { ok: true };
    }
    case 'create_countdown': {
      const month = Number(input.month);
      const day = Number(input.day);
      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return { error: 'Invalid month/day.' };
      const types = ['birthday', 'holiday', 'anniversary', 'deadline', 'event'] as const;
      const type = types.find((t) => t === input.type) ?? 'event';
      countdowns.addCountdown(String(input.name ?? '').trim() || 'Countdown', month, day, type);
      return { ok: true };
    }
    default:
      return { error: `Unknown write tool: ${call.name}` };
  }
}
