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
      const updated = await calendar.updateEvent(
        String(input.id),
        String(input.date),
        existing.title,
        String(input.time),
        existing.durationMin,
      );
      return updated ?? { error: 'Could not move the event.' };
    }
    case 'remove_event': {
      calendar.removeEvent(String(input.id));
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
      matrix.scheduleTask(input.quadrant, String(input.taskId), String(input.time));
      return { ok: true };
    }
    case 'unschedule_task': {
      if (!isQuadKey(input.quadrant)) return { error: 'Invalid quadrant.' };
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
