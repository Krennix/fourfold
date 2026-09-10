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
  history: string[];
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return dateKey(new Date());
}

function computeStreak(history: string[]): number {
  const set = new Set(history);
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (!set.has(dateKey(d))) break;
    streak++;
  }
  return streak;
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
  const [rawHabits, setHabits] = useRemoteState<Habit[]>('habits', [], handleSessionExpired, 'fourfold.habits.v1');

  // `done` and `streak` are derived from `history` on every read instead of being
  // trusted from storage, since a persisted `done` flag would never reset when a
  // new day starts and would silently desync the streak count.
  const habits = rawHabits.map((h) => {
    const history = h.history || [];
    return { ...h, done: history.includes(todayKey()), streak: computeStreak(history) };
  });

  const addHabit: HabitsContextValue['addHabit'] = (name, time, quote) => {
    setHabits((prev) => [...prev, { id: `habit-${Date.now()}`, name, time, quote, streak: 0, done: false, history: [] }]);
  };
  const removeHabit = (id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  };
  const updateHabit: HabitsContextValue['updateHabit'] = (id, name, time, quote) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, name, time, quote } : h)));
  };
  const toggleHabit = (id: string) => {
    const key = todayKey();
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const prevHistory = h.history || [];
        const doneToday = prevHistory.includes(key);
        const history = doneToday ? prevHistory.filter((d) => d !== key) : [...prevHistory, key];
        return { ...h, history };
      }),
    );
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
