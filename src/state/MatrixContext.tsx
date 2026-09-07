import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type QuadKey = 'q1' | 'q2' | 'q3' | 'q4';

export interface Task {
  id: string;
  title: string;
  done: boolean;
  time: string | null;
  listTag: string;
}

const STORAGE_KEY = 'fourfold.matrix.v1';

type TaskState = Record<QuadKey, Task[]>;

const EMPTY_TASKS: TaskState = { q1: [], q2: [], q3: [], q4: [] };

interface MatrixContextValue {
  tasks: TaskState;
  addTask: (qkey: QuadKey, title: string, listTag: string) => void;
  removeTask: (qkey: QuadKey, id: string) => void;
  toggleDone: (qkey: QuadKey, id: string) => void;
  scheduleTask: (qkey: QuadKey, id: string, time: string) => void;
  unscheduleTask: (qkey: QuadKey, id: string) => void;
}

const MatrixContext = createContext<MatrixContextValue | null>(null);

function loadInitial(): TaskState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...EMPTY_TASKS, ...JSON.parse(raw) };
  } catch {
    // ignore malformed storage
  }
  return EMPTY_TASKS;
}

export function MatrixProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<TaskState>(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // storage unavailable — state still works for this session
    }
  }, [tasks]);

  const addTask: MatrixContextValue['addTask'] = (qkey, title, listTag) => {
    setTasks((s) => ({ ...s, [qkey]: [...s[qkey], { id: `task-${Date.now()}`, title, done: false, time: null, listTag }] }));
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
