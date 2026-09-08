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
  addTask: (qkey: QuadKey, data: NewTaskInput) => void;
  removeTask: (qkey: QuadKey, id: string) => void;
  toggleDone: (qkey: QuadKey, id: string) => void;
  scheduleTask: (qkey: QuadKey, id: string, time: string) => void;
  unscheduleTask: (qkey: QuadKey, id: string) => void;
  toggleTaskLocked: (qkey: QuadKey, id: string) => void;
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
      id: `task-${Date.now()}`,
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

  const normalizedTasks: TaskState = {
    q1: tasks.q1.map(normalizeTask),
    q2: tasks.q2.map(normalizeTask),
    q3: tasks.q3.map(normalizeTask),
    q4: tasks.q4.map(normalizeTask),
  };

  return (
    <MatrixContext.Provider value={{ tasks: normalizedTasks, addTask, removeTask, toggleDone, scheduleTask, unscheduleTask, toggleTaskLocked }}>
      {children}
    </MatrixContext.Provider>
  );
}

export function useMatrix() {
  const ctx = useContext(MatrixContext);
  if (!ctx) throw new Error('useMatrix must be used within a MatrixProvider');
  return ctx;
}
