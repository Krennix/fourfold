import type { CalendarContextValue } from '../state/CalendarContext';
import type { MatrixContextValue, QuadKey } from '../state/MatrixContext';

export interface AgentToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AgentToolDeps {
  calendar: CalendarContextValue;
  matrix: MatrixContextValue;
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
  const { calendar, matrix } = deps;

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
    default:
      return { error: `Unknown write tool: ${call.name}` };
  }
}
