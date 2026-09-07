import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface Habit {
  id: string;
  name: string;
  time: string | null;
  streak: number;
  done: boolean;
}

const STORAGE_KEY = 'fourfold.habits.v1';

interface HabitsContextValue {
  habits: Habit[];
  addHabit: (name: string, time: string | null) => void;
  removeHabit: (id: string) => void;
  toggleHabit: (id: string) => void;
}

const HabitsContext = createContext<HabitsContextValue | null>(null);

function loadInitial(): Habit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed storage
  }
  return [];
}

export function HabitsProvider({ children }: { children: ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
    } catch {
      // storage unavailable — state still works for this session
    }
  }, [habits]);

  const addHabit: HabitsContextValue['addHabit'] = (name, time) => {
    setHabits((prev) => [...prev, { id: `habit-${Date.now()}`, name, time, streak: 0, done: false }]);
  };
  const removeHabit = (id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  };
  const toggleHabit = (id: string) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, done: !h.done, streak: !h.done ? h.streak + 1 : Math.max(0, h.streak - 1) } : h)));
  };

  return (
    <HabitsContext.Provider value={{ habits, addHabit, removeHabit, toggleHabit }}>
      {children}
    </HabitsContext.Provider>
  );
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within a HabitsProvider');
  return ctx;
}
