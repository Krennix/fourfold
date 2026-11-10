import { createContext, useContext, type ReactNode } from 'react';
import { useRemoteState } from '../lib/remoteStore';
import { useAuth } from './AuthContext';

export type QuadKey = 'q1' | 'q2' | 'q3' | 'q4';

export interface TaskLink {
  type: 'class' | 'event';
  id: string;
  label: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  done: boolean;
  time: string | null;
  listTag: string;
  dueDate: string | null;
  link: TaskLink | null;
  /** Estimated time needed to complete the task, in minutes. */
  durationMin: number | null;
  /** Fixed/"set in stone" — shouldn't be rescheduled or removed by drag/AI actions. */
  locked: boolean;
}

export interface NewTaskInput {
  title: string;
  description?: string;
  listTag?: string;
  dueDate?: string | null;
  link?: TaskLink | null;
  durationMin?: number | null;
  time?: string | null;
  locked?: boolean;
}

type TaskState = Record<QuadKey, Task[]>;

const EMPTY_TASKS: TaskState = { q1: [], q2: [], q3: [], q4: [] };

export interface MatrixContextValue {
  tasks: TaskState;
  /** Returns the new task's id. */
  addTask: (qkey: QuadKey, data: NewTaskInput) => string;
  removeTask: (qkey: QuadKey, id: string) => void;
  toggleDone: (qkey: QuadKey, id: string) => void;
  scheduleTask: (qkey: QuadKey, id: string, time: string) => void;
  unscheduleTask: (qkey: QuadKey, id: string) => void;
  toggleTaskLocked: (qkey: QuadKey, id: string) => void;
  /** Edits a task's details in place. */
  updateTask: (qkey: QuadKey, id: string, patch: Partial<Pick<Task, 'title' | 'description' | 'dueDate' | 'durationMin' | 'link' | 'locked' | 'time'>>) => void;
  /** Moves a task to another quadrant (keeps it in place if locked). */
  moveTask: (from: QuadKey, to: QuadKey, id: string) => void;
  /** Puts a previously removed task back (used by Undo). */
  restoreTask: (qkey: QuadKey, task: Task) => void;
}

const MatrixContext = createContext<MatrixContextValue | null>(null);

/** Fills in `locked: false` for tasks persisted before the field existed. */
function normalizeTask(t: Task | (Omit<Task, 'locked'> & { locked?: boolean })): Task {
  return { ...t, locked: t.locked ?? false };
}

export function MatrixProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const [tasks, setTasks] = useRemoteState<TaskState>('matrix', EMPTY_TASKS, handleSessionExpired, 'fourfold.matrix.v1');

  const addTask: MatrixContextValue['addTask'] = (qkey, data) => {
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: data.title,
      description: data.description ?? '',
      done: false,
      time: data.time ?? null,
      listTag: data.listTag || 'Inbox',
      dueDate: data.dueDate ?? null,
      link: data.link ?? null,
      durationMin: data.durationMin ?? null,
      locked: data.locked ?? false,
    };
    setTasks((s) => ({ ...s, [qkey]: [...s[qkey], task] }));
    return task.id;
  };
  const removeTask: MatrixContextValue['removeTask'] = (qkey, id) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].filter((t) => t.id !== id || t.locked) }));
  };
  const toggleDone: MatrixContextValue['toggleDone'] = (qkey, id) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
  };
  const scheduleTask: MatrixContextValue['scheduleTask'] = (qkey, id, time) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id && !t.locked ? { ...t, time } : t)) }));
  };
  const unscheduleTask: MatrixContextValue['unscheduleTask'] = (qkey, id) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id && !t.locked ? { ...t, time: null } : t)) }));
  };
  const toggleTaskLocked: MatrixContextValue['toggleTaskLocked'] = (qkey, id) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id ? { ...t, locked: !t.locked } : t)) }));
  };

  const updateTask: MatrixContextValue['updateTask'] = (qkey, id, patch) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  };
  const moveTask: MatrixContextValue['moveTask'] = (from, to, id) => {
    if (from === to) return;
    setTasks((s) => {
      const task = s[from].find((t) => t.id === id);
      if (!task || task.locked) return s;
      return { ...s, [from]: s[from].filter((t) => t.id !== id), [to]: [...s[to], task] };
    });
  };
  const restoreTask: MatrixContextValue['restoreTask'] = (qkey, task) => {
    setTasks((s) => (s[qkey].some((t) => t.id === task.id) ? s : { ...s, [qkey]: [...s[qkey], task] }));
  };

  const normalizedTasks: TaskState = {
    q1: tasks.q1.map(normalizeTask),
    q2: tasks.q2.map(normalizeTask),
    q3: tasks.q3.map(normalizeTask),
    q4: tasks.q4.map(normalizeTask),
  };

  return (
    <MatrixContext.Provider value={{ tasks: normalizedTasks, addTask, removeTask, toggleDone, scheduleTask, unscheduleTask, toggleTaskLocked, updateTask, moveTask, restoreTask }}>
      {children}
    </MatrixContext.Provider>
  );
}

export function useMatrix() {
  const ctx = useContext(MatrixContext);
  if (!ctx) throw new Error('useMatrix must be used within a MatrixProvider');
  return ctx;
}
