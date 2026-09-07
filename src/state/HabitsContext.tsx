import { createContext, useContext, type ReactNode } from 'react';
import { useRemoteState } from '../lib/remoteStore';
import { useAuth } from './AuthContext';

export interface Habit {
  id: string;
  name: string;
  time: string | null;
  quote: string | null;
  streak: number;
  done: boolean;
}

interface HabitsContextValue {
  habits: Habit[];
  addHabit: (name: string, time: string | null, quote: string | null) => void;
  removeHabit: (id: string) => void;
  toggleHabit: (id: string) => void;
  updateHabit: (id: string, name: string, time: string | null, quote: string | null) => void;
}

const HabitsContext = createContext<HabitsContextValue | null>(null);

export function HabitsProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const [habits, setHabits] = useRemoteState<Habit[]>('habits', [], handleSessionExpired, 'fourfold.habits.v1');

  const addHabit: HabitsContextValue['addHabit'] = (name, time, quote) => {
    setHabits((prev) => [...prev, { id: `habit-${Date.now()}`, name, time, quote, streak: 0, done: false }]);
  };
  const removeHabit = (id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  };
  const updateHabit: HabitsContextValue['updateHabit'] = (id, name, time, quote) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, name, time, quote } : h)));
  };
  const toggleHabit = (id: string) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, done: !h.done, streak: !h.done ? h.streak + 1 : Math.max(0, h.streak - 1) } : h)));
  };

  return (
    <HabitsContext.Provider value={{ habits, addHabit, removeHabit, toggleHabit, updateHabit }}>
      {children}
    </HabitsContext.Provider>
  );
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within a HabitsProvider');
  return ctx;
}
