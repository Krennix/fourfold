import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './ThemeContext';
import { usePomodoro } from './PomodoroContext';
import { useMatrix, type QuadKey } from './MatrixContext';
import { useCountdowns } from './CountdownsContext';
import { useCalendarEvents } from './CalendarContext';
import { useAutoSchedule } from '../lib/useAutoSchedule';
import { parseQuickAdd } from '../lib/quickAdd';
import { TaskDialog } from '../components/TaskDialog';
import { CountdownDialog } from '../components/CountdownDialog';
import { CommandPalette } from '../components/CommandPalette';
import { ShortcutsDialog } from '../components/ShortcutsDialog';
import { Toaster, type ToastItem } from '../components/Toaster';

export type PaletteMode = 'all' | 'task';

interface ToastInput {
  message: string;
  tone?: 'default' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface UIContextValue {
  openPalette: (mode?: PaletteMode, initialQuery?: string) => void;
  closePalette: () => void;
  openTaskDialog: (quad?: QuadKey) => void;
  openCountdownDialog: () => void;
  openShortcuts: () => void;
  toast: (t: ToastInput) => void;
  /** Creates a task from natural-language text ("Essay tomorrow 3pm 45m !1"), booking calendar
   * time when a time or duration is given. Returns the created title, or null if it was empty. */
  quickAddTask: (text: string) => Promise<string | null>;
  toggleTheme: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

const GO_KEYS: Record<string, string> = {
  h: '/',
  m: '/matrix',
  c: '/calendar',
  b: '/habits',
  f: '/friends',
  p: '/pomodoro',
  s: '/school',
  a: '/agent',
  ',': '/settings',
};

export function UIProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const pomodoro = usePomodoro();
  const { addTask, removeTask } = useMatrix();
  const { addCountdown } = useCountdowns();
  const { addEvent, removeEvent } = useCalendarEvents();
  const autoSchedule = useAutoSchedule();

  const [palette, setPalette] = useState<{ mode: PaletteMode; query: string } | null>(null);
  const [taskDialogQuad, setTaskDialogQuad] = useState<QuadKey | null>(null);
  const [countdownOpen, setCountdownOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const goPending = useRef<number | null>(null);

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback((t: ToastInput) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-3), { id, ...t }]);
  }, []);

  const toggleTheme = useCallback(() => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setTheme(isDark ? 'light' : 'dark');
  }, [theme, setTheme]);

  const quickAddTask = useCallback(
    async (text: string) => {
      const parsed = parseQuickAdd(text);
      if (!parsed.title) return null;
      let link = null;
      let time: string | null = null;
      let bookedEventId: string | null = null;
      if (parsed.time && parsed.dueDate) {
        const [y, m, d] = parsed.dueDate.split('-').map(Number);
        const created = await addEvent(`${y}-${m - 1}-${d}`, parsed.title, parsed.time, parsed.durationMin ?? 30);
        if (created) {
          bookedEventId = created.id;
          link = { type: 'event' as const, id: created.id, label: created.title };
          time = created.time;
        }
      } else if (parsed.durationMin) {
        const scheduled = await autoSchedule({ title: parsed.title, dueDate: parsed.dueDate, durationMin: parsed.durationMin, link: null });
        link = scheduled.link;
        time = scheduled.time;
        if (scheduled.link?.type === 'event') bookedEventId = scheduled.link.id;
      }
      const id = addTask(parsed.quad, { title: parsed.title, dueDate: parsed.dueDate, durationMin: parsed.durationMin, time, link });
      toast({
        message: time ? `Added “${parsed.title}” and booked ${time}` : `Added “${parsed.title}”`,
        tone: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            removeTask(parsed.quad, id);
            if (bookedEventId) removeEvent(bookedEventId);
          },
        },
      });
      return parsed.title;
    },
    [addEvent, addTask, autoSchedule, removeEvent, removeTask, toast],
  );

  const anyOverlayOpen = palette !== null || taskDialogQuad !== null || countdownOpen || shortcutsOpen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => (p ? null : { mode: 'all', query: '' }));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || anyOverlayOpen) return;
      if (document.querySelector('.dialog-backdrop')) return;

      if (goPending.current !== null) {
        window.clearTimeout(goPending.current);
        goPending.current = null;
        const dest = GO_KEYS[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          navigate(dest);
        }
        return;
      }
      switch (e.key) {
        case '/':
          e.preventDefault();
          setPalette({ mode: 'all', query: '' });
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          setPalette({ mode: 'task', query: '' });
          break;
        case 'g':
          goPending.current = window.setTimeout(() => (goPending.current = null), 1200);
          break;
        case 't':
          toggleTheme();
          break;
        case 'f':
          if (pomodoro.isRunning || pomodoro.secondsLeft !== 25 * 60 || pomodoro.mode !== 'focus') pomodoro.toggleRun();
          else pomodoro.start();
          break;
        case '?':
          setShortcutsOpen(true);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyOverlayOpen, navigate, pomodoro, toggleTheme]);

  const value = useMemo<UIContextValue>(
    () => ({
      openPalette: (mode = 'all', initialQuery = '') => setPalette({ mode, query: initialQuery }),
      closePalette: () => setPalette(null),
      openTaskDialog: (quad = 'q2') => setTaskDialogQuad(quad),
      openCountdownDialog: () => setCountdownOpen(true),
      openShortcuts: () => setShortcutsOpen(true),
      toast,
      quickAddTask,
      toggleTheme,
    }),
    [toast, quickAddTask, toggleTheme],
  );

  return (
    <UIContext.Provider value={value}>
      {children}
      {palette && <CommandPalette mode={palette.mode} initialQuery={palette.query} onClose={() => setPalette(null)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {taskDialogQuad && (
        <TaskDialog
          initialQuad={taskDialogQuad}
          onClose={() => setTaskDialogQuad(null)}
          onSave={async ({ title, description, quad, dueDate, link, durationMin, locked }) => {
            const scheduled = await autoSchedule({ title, dueDate, durationMin, link });
            const id = addTask(quad, { title, description, dueDate, link: scheduled.link, durationMin, time: scheduled.time, locked });
            toast({
              message: scheduled.time ? `Added “${title}” and booked ${scheduled.time}` : `Added “${title}”`,
              tone: 'success',
              action: { label: 'Undo', onClick: () => removeTask(quad, id) },
            });
          }}
        />
      )}
      {countdownOpen && (
        <CountdownDialog
          countdown={null}
          onClose={() => setCountdownOpen(false)}
          onSave={(name, month, day, type) => {
            addCountdown(name, month, day, type);
            toast({ message: `Countdown “${name}” added`, tone: 'success' });
          }}
        />
      )}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </UIContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within a UIProvider');
  return ctx;
}
