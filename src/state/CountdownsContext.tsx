import { createContext, useContext, type ReactNode } from 'react';
import { useRemoteState } from '../lib/remoteStore';
import { useAuth } from './AuthContext';

export type CountdownType = 'birthday' | 'holiday' | 'anniversary' | 'deadline' | 'event';

export interface Countdown {
  id: string;
  name: string;
  month: number; // 1-12
  day: number;
  type: CountdownType;
}

interface CountdownsContextValue {
  countdowns: Countdown[];
  addCountdown: (name: string, month: number, day: number, type: CountdownType) => void;
  updateCountdown: (id: string, name: string, month: number, day: number, type: CountdownType) => void;
  removeCountdown: (id: string) => void;
}

const CountdownsContext = createContext<CountdownsContextValue | null>(null);

export function CountdownsProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const [countdowns, setCountdowns] = useRemoteState<Countdown[]>('countdowns', [], handleSessionExpired, 'fourfold.countdowns.v1');

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
