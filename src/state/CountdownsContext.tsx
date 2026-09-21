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
  friendId?: string; // present = this countdown is birthday-synced from a Friend
}

interface CountdownsContextValue {
  countdowns: Countdown[];
  addCountdown: (name: string, month: number, day: number, type: CountdownType, friendId?: string) => Countdown;
  updateCountdown: (id: string, name: string, month: number, day: number, type: CountdownType, friendId?: string) => void;
  removeCountdown: (id: string) => void;
}

const CountdownsContext = createContext<CountdownsContextValue | null>(null);

export function CountdownsProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const [countdowns, setCountdowns] = useRemoteState<Countdown[]>('countdowns', [], handleSessionExpired, 'fourfold.countdowns.v1');

  const addCountdown: CountdownsContextValue['addCountdown'] = (name, month, day, type, friendId) => {
    const countdown: Countdown = { id: `countdown-${Date.now()}`, name, month, day, type, friendId };
    setCountdowns((prev) => [...prev, countdown]);
    return countdown;
  };
  const updateCountdown: CountdownsContextValue['updateCountdown'] = (id, name, month, day, type, friendId) => {
    // Preserve an existing friend link when a plain UI edit doesn't pass friendId explicitly.
    setCountdowns((prev) => prev.map((c) => (c.id === id ? { ...c, name, month, day, type, friendId: friendId ?? c.friendId } : c)));
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
