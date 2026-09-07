import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CountdownType = 'birthday' | 'holiday' | 'anniversary' | 'deadline' | 'event';

export interface Countdown {
  id: string;
  name: string;
  month: number; // 1-12
  day: number;
  type: CountdownType;
}

const STORAGE_KEY = 'fourfold.countdowns.v1';

interface CountdownsContextValue {
  countdowns: Countdown[];
  addCountdown: (name: string, month: number, day: number, type: CountdownType) => void;
  updateCountdown: (id: string, name: string, month: number, day: number, type: CountdownType) => void;
  removeCountdown: (id: string) => void;
}

const CountdownsContext = createContext<CountdownsContextValue | null>(null);

function loadInitial(): Countdown[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Countdown[];
      return parsed.map((c) => ({ ...c, type: c.type ?? 'event' }));
    }
  } catch {
    // ignore malformed storage
  }
  return [];
}

export function CountdownsProvider({ children }: { children: ReactNode }) {
  const [countdowns, setCountdowns] = useState<Countdown[]>(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(countdowns));
    } catch {
      // storage unavailable — state still works for this session
    }
  }, [countdowns]);

  const addCountdown: CountdownsContextValue['addCountdown'] = (name, month, day, type) => {
    setCountdowns((prev) => [...prev, { id: `countdown-${Date.now()}`, name, month, day, type }]);
  };
  const updateCountdown: CountdownsContextValue['updateCountdown'] = (id, name, month, day, type) => {
    setCountdowns((prev) => prev.map((c) => (c.id === id ? { ...c, name, month, day, type } : c)));
  };
  const removeCountdown = (id: string) => {
    setCountdowns((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <CountdownsContext.Provider value={{ countdowns, addCountdown, updateCountdown, removeCountdown }}>
      {children}
    </CountdownsContext.Provider>
  );
}

export function useCountdowns() {
  const ctx = useContext(CountdownsContext);
  if (!ctx) throw new Error('useCountdowns must be used within a CountdownsProvider');
  return ctx;
}
