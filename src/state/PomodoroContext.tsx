import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type PomodoroMode = 'focus' | 'short' | 'long';

export const POMODORO_MODES: Record<PomodoroMode, number> = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
export const POMODORO_MODE_LABELS: Record<PomodoroMode, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };

interface PomodoroContextValue {
  mode: PomodoroMode;
  secondsLeft: number;
  isRunning: boolean;
  sessionsDone: number;
  /** Focus sessions completed today (persisted on this device). */
  todaySessions: number;
  /** Completed focus sessions per local day ("YYYY-MM-DD"), last 60 days. */
  sessionHistory: Record<string, number>;
  start: () => void;
  toggleRun: () => void;
  reset: () => void;
  selectMode: (m: PomodoroMode) => void;
}

const HISTORY_KEY = 'fourfold.focusHistory.v1';

function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadHistory(): Record<string, number> {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

const PomodoroContext = createContext<PomodoroContextValue | null>(null);

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PomodoroMode>('focus');
  const [secondsLeft, setSecondsLeft] = useState(POMODORO_MODES.focus);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionsDone, setSessionsDone] = useState(0);
  const [sessionHistory, setSessionHistory] = useState<Record<string, number>>(loadHistory);

  const recordSession = () => {
    setSessionHistory((h) => {
      const day = localDay();
      const cutoff = localDay(new Date(Date.now() - 60 * 86400000));
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(h)) if (k >= cutoff) next[k] = v;
      next[day] = (next[day] ?? 0) + 1;
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const tick = () => {
    setSecondsLeft((s) => {
      if (s <= 1) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setIsRunning(false);
        setMode((m) => {
          if (m === 'focus') {
            setSessionsDone((n) => n + 1);
            recordSession();
          }
          return m;
        });
        return 0;
      }
      return s - 1;
    });
  };

  const run = () => {
    if (timerRef.current) return;
    timerRef.current = window.setInterval(tick, 1000);
    setIsRunning(true);
  };

  const stop = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRunning(false);
  };

  const toggleRun = () => {
    if (isRunning) stop();
    else run();
  };

  const reset = () => {
    stop();
    setSecondsLeft(POMODORO_MODES[mode]);
  };

  const selectMode = (m: PomodoroMode) => {
    stop();
    setMode(m);
    setSecondsLeft(POMODORO_MODES[m]);
  };

  const start = () => {
    stop();
    setMode('focus');
    setSecondsLeft(POMODORO_MODES.focus);
    run();
  };

  return (
    <PomodoroContext.Provider value={{ mode, secondsLeft, isRunning, sessionsDone, todaySessions: sessionHistory[localDay()] ?? 0, sessionHistory, start, toggleRun, reset, selectMode }}>
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro() {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error('usePomodoro must be used within a PomodoroProvider');
  return ctx;
}
