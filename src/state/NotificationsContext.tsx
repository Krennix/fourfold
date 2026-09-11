import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useHabits } from './HabitsContext';
import { useMatrix } from './MatrixContext';
import { usePomodoro } from './PomodoroContext';
import { useQuadrantHomework } from '../lib/useQuadrantHomework';
import { isWithinDays } from '../lib/dateRange';
import { notify } from '../lib/notify';

const ENABLED_KEY = 'fourfold.notifications.enabled';

export type NotifPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface NotificationsContextValue {
  permission: NotifPermission;
  requestPermission: () => Promise<void>;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function alreadySent(id: string) {
  try {
    return localStorage.getItem(`fourfold.notif.sent.${id}.${todayKey()}`) === '1';
  } catch {
    return false;
  }
}
function markSent(id: string) {
  try {
    localStorage.setItem(`fourfold.notif.sent.${id}.${todayKey()}`, '1');
  } catch {
    // ignore storage errors (private browsing, etc.)
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [permission, setPermission] = useState<NotifPermission>(
    typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as NotifPermission),
  );
  const [enabled, setEnabledState] = useState(() => {
    try {
      return localStorage.getItem(ENABLED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(ENABLED_KEY, v ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  };

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result as NotifPermission);
    if (result === 'granted') setEnabled(true);
  };

  const { habits } = useHabits();
  const { tasks } = useMatrix();
  const homeworkRows = useQuadrantHomework();
  const pomodoro = usePomodoro();

  // Pomodoro session end: no completion callback exists on PomodoroContext, so this watches
  // the same public state a page component would (secondsLeft hits 0 while isRunning flips off).
  useEffect(() => {
    if (!enabled || permission !== 'granted') return;
    if (pomodoro.secondsLeft === 0 && !pomodoro.isRunning) {
      void notify('Pomodoro session complete', 'Time to switch modes.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomodoro.secondsLeft, pomodoro.isRunning, enabled, permission]);

  // Habit reminders + upcoming deadlines: polled, since there's no due-time event source to subscribe to.
  useEffect(() => {
    if (!enabled || permission !== 'granted') return;
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      for (const h of habits) {
        if (h.time && h.time === hhmm && !h.done && !alreadySent(`habit-${h.id}`)) {
          void notify(`Habit reminder: ${h.name}`, h.quote || 'Time to check this off.');
          markSent(`habit-${h.id}`);
        }
      }
      for (const t of Object.values(tasks).flat()) {
        if (!t.done && isWithinDays(t.dueDate, 1) && !alreadySent(`task-${t.id}`)) {
          void notify('Task due soon', t.title);
          markSent(`task-${t.id}`);
        }
      }
      for (const hw of Object.values(homeworkRows).flat()) {
        if (!hw.done && isWithinDays(hw.dueDate, 1) && !alreadySent(`hw-${hw.id}`)) {
          void notify('Homework due soon', hw.title);
          markSent(`hw-${hw.id}`);
        }
      }
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, permission, habits, tasks, homeworkRows]);

  return (
    <NotificationsContext.Provider value={{ permission, requestPermission, enabled, setEnabled }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}
