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
  done: boolean;
  time: string | null;
  listTag: string;
  dueDate: string | null;
  link: TaskLink | null;
}

export interface NewTaskInput {
  title: string;
  listTag?: string;
  dueDate?: string | null;
  link?: TaskLink | null;
}

type TaskState = Record<QuadKey, Task[]>;

const EMPTY_TASKS: TaskState = { q1: [], q2: [], q3: [], q4: [] };

interface MatrixContextValue {
  tasks: TaskState;
  addTask: (qkey: QuadKey, data: NewTaskInput) => void;
  removeTask: (qkey: QuadKey, id: string) => void;
  toggleDone: (qkey: QuadKey, id: string) => void;
  scheduleTask: (qkey: QuadKey, id: string, time: string) => void;
  unscheduleTask: (qkey: QuadKey, id: string) => void;
}

const MatrixContext = createContext<MatrixContextValue | null>(null);

export function MatrixProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const [tasks, setTasks] = useRemoteState<TaskState>('matrix', EMPTY_TASKS, handleSessionExpired, 'fourfold.matrix.v1');

  const addTask: MatrixContextValue['addTask'] = (qkey, data) => {
    const task: Task = {
      id: `task-${Date.now()}`,
      title: data.title,
      done: false,
      time: null,
      listTag: data.listTag || 'Inbox',
      dueDate: data.dueDate ?? null,
      link: data.link ?? null,
    };
    setTasks((s) => ({ ...s, [qkey]: [...s[qkey], task] }));
  };
  const removeTask: MatrixContextValue['removeTask'] = (qkey, id) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].filter((t) => t.id !== id) }));
  };
  const toggleDone: MatrixContextValue['toggleDone'] = (qkey, id) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
  };
  const scheduleTask: MatrixContextValue['scheduleTask'] = (qkey, id, time) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id ? { ...t, time } : t)) }));
  };
  const unscheduleTask: MatrixContextValue['unscheduleTask'] = (qkey, id) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id ? { ...t, time: null } : t)) }));
  };

  return (
    <MatrixContext.Provider value={{ tasks, addTask, removeTask, toggleDone, scheduleTask, unscheduleTask }}>
      {children}
    </MatrixContext.Provider>
  );
}

export function useMatrix() {
  const ctx = useContext(MatrixContext);
  if (!ctx) throw new Error('useMatrix must be used within a MatrixProvider');
  return ctx;
}
