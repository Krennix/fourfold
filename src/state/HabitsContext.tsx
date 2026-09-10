import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRemoteState } from '../lib/remoteStore';
import { useAuth } from './AuthContext';
import { StreakCelebration } from '../components/StreakCelebration';

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

function overallStreak(habits: { history: string[] }[]): number {
  if (habits.length === 0) return 0;
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dateKey(d);
    const doneThatDay = habits.filter((h) => (h.history || []).includes(key)).length;
    if (doneThatDay / habits.length >= 0.8) streak++;
    else break;
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
  const [rawHabits, setHabits, habitsLoaded] = useRemoteState<Habit[]>(
    'habits',
    [],
    handleSessionExpired,
    'fourfold.habits.v1',
  );

  // `done` and `streak` are derived from `history` on every read instead of being
  // trusted from storage, since a persisted `done` flag would never reset when a
  // new day starts and would silently desync the streak count.
  const habits = rawHabits.map((h) => {
    const history = h.history || [];
    return { ...h, done: history.includes(todayKey()), streak: computeStreak(history) };
  });

  // Tracked here (rather than on the Habits page) so the reward fires no matter
  // which page the habit was marked done from, and survives page navigation.
  const lastStreakRef = useRef<number | null>(null);
  const [celebrationStreak, setCelebrationStreak] = useState<number | null>(null);
  useEffect(() => {
    if (!habitsLoaded) return;
    const current = overallStreak(habits);
    // Skip the comparison on the render right after the remote data finishes
    // loading — otherwise jumping from the empty placeholder state to an
    // already-established streak would look like a fresh increase and fire
    // the celebration on every page load instead of only on real progress.
    if (lastStreakRef.current !== null && current > lastStreakRef.current) {
      setCelebrationStreak(current);
    }
    lastStreakRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitsLoaded, rawHabits]);

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
      {celebrationStreak !== null && (
        <StreakCelebration streak={celebrationStreak} onClose={() => setCelebrationStreak(null)} />
      )}
    </HabitsContext.Provider>
  );
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within a HabitsProvider');
  return ctx;
}
