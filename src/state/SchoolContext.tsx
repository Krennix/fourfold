import { createContext, useContext, type ReactNode } from 'react';
import { useRemoteState } from '../lib/remoteStore';
import { useAuth } from './AuthContext';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface SchoolClass {
  id: string;
  name: string;
  room: string;
  /** Bell-schedule period numbers this class meets during (e.g. [1, 3] for "Class 1" and "Class 3"). */
  periods: number[];
}

export interface PresetMeeting {
  classId: string;
  start: number;
  end: number;
}

export interface Preset {
  id: string;
  name: string;
  meetings: PresetMeeting[];
}

/** A single date's schedule override. presetId null = no classes that date (e.g. holiday). */
export interface DayOverride {
  presetId: string | null;
}

export interface Homework {
  id: number;
  title: string;
  /** YYYY-MM-DD (or any Date-parseable string); empty/unparseable = no due date. */
  due: string;
  priority: 'high' | 'med' | 'low';
  done: boolean;
  source?: 'manual';
}

/** Old records may carry a formatted display string (e.g. "Sep 10", no year) instead of a real date. */
function normalizeDue(raw: string): string {
  if (!raw) return raw;
  // Legacy "Mon D" display strings (no year) parse in JS with a bogus default year — detect and fix explicitly.
  if (/^[A-Za-z]{3}\s+\d{1,2}$/.test(raw.trim())) {
    const withYear = `${raw} ${new Date().getFullYear()}`;
    if (!Number.isNaN(new Date(withYear).getTime())) return withYear;
    return '';
  }
  if (!Number.isNaN(new Date(raw).getTime())) return raw;
  return '';
}

const DEFAULT_CLASSES: SchoolClass[] = [
  { id: 'calc', name: 'Calculus II', room: 'Rm 214', periods: [1] },
  { id: 'chem', name: 'Chemistry', room: 'Lab B', periods: [2] },
  { id: 'hist', name: 'World History', room: 'Rm 108', periods: [5] },
  { id: 'cs', name: 'Intro to CS', room: 'Rm 301', periods: [3] },
  { id: 'eng', name: 'English Lit', room: 'Rm 220', periods: [6] },
];

/** Migrates legacy classes (day/time `meetings`) to the period-based shape. */
function normalizeClass(c: SchoolClass | (Omit<SchoolClass, 'periods'> & { periods?: number[] })): SchoolClass {
  return { id: c.id, name: c.name, room: c.room, periods: Array.isArray(c.periods) ? c.periods : [] };
}

const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'half-day',
    name: 'Half Day',
    meetings: [
      { classId: 'calc', start: 9, end: 9.5 },
      { classId: 'chem', start: 9.5, end: 10 },
      { classId: 'cs', start: 10, end: 10.5 },
    ],
  },
];

interface StoredState {
  classes: SchoolClass[];
  presets: Preset[];
  overrides: Record<string, DayOverride>;
  /** Whether to show non-class bell periods (breaks, lunch, advisory, office hours, ...) on the School tab. */
  showBreaks: boolean;
  /** Homework/assignments, keyed by class id. */
  homework: Record<string, Homework[]>;
  /** Completion state for Schoology-sourced homework, keyed by ICS uid. */
  schoologyDone: Record<string, boolean>;
  /** Manual overrides mapping a lowercased Schoology category/course name to a class id. */
  classMappings: Record<string, string>;
}

interface SchoolContextValue extends StoredState {
  addClass: (c: Omit<SchoolClass, 'id'>) => void;
  updateClass: (id: string, c: Omit<SchoolClass, 'id'>) => void;
  removeClass: (id: string) => void;
  addPreset: (p: Omit<Preset, 'id'>) => void;
  updatePreset: (id: string, p: Omit<Preset, 'id'>) => void;
  removePreset: (id: string) => void;
  setOverride: (dates: string[], override: DayOverride | null) => void;
  setShowBreaks: (show: boolean) => void;
  addHomework: (classId: string, hw: Omit<Homework, 'id' | 'done'>) => void;
  toggleHomework: (classId: string, id: number) => void;
  removeHomework: (classId: string, id: number) => void;
  toggleSchoologyHomeworkDone: (uid: string) => void;
  setClassMapping: (category: string, classId: string | null) => void;
}

const SchoolContext = createContext<SchoolContextValue | null>(null);

const DEFAULT_HOMEWORK: Record<string, Homework[]> = {
  calc: [{ id: 1, title: 'Problem set 6', due: 'Sep 10', priority: 'high', done: false }],
  cs: [
    { id: 2, title: 'Read chapter 3', due: 'Sep 9', priority: 'low', done: true },
    { id: 3, title: 'Lab 2 writeup', due: 'Sep 12', priority: 'med', done: false },
  ],
};

const DEFAULT_STATE: StoredState = {
  classes: DEFAULT_CLASSES,
  presets: DEFAULT_PRESETS,
  overrides: {},
  showBreaks: true,
  homework: DEFAULT_HOMEWORK,
  schoologyDone: {},
  classMappings: {},
};

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { handleSessionExpired } = useAuth();
  const [state, setState] = useRemoteState<StoredState>('school', DEFAULT_STATE, handleSessionExpired, 'fourfold.school.v2');

  const addClass: SchoolContextValue['addClass'] = (c) => {
    setState((s) => ({ ...s, classes: [...s.classes, { ...c, id: `class-${Date.now()}` }] }));
  };
  const updateClass: SchoolContextValue['updateClass'] = (id, c) => {
    setState((s) => ({ ...s, classes: s.classes.map((cls) => (cls.id === id ? { ...c, id } : cls)) }));
  };
  const removeClass = (id: string) => {
    setState((s) => ({ ...s, classes: s.classes.filter((cls) => cls.id !== id) }));
  };

  const addPreset: SchoolContextValue['addPreset'] = (p) => {
    setState((s) => ({ ...s, presets: [...s.presets, { ...p, id: `preset-${Date.now()}` }] }));
  };
  const updatePreset: SchoolContextValue['updatePreset'] = (id, p) => {
    setState((s) => ({ ...s, presets: s.presets.map((pr) => (pr.id === id ? { ...p, id } : pr)) }));
  };
  const removePreset = (id: string) => {
    setState((s) => ({
      ...s,
      presets: s.presets.filter((pr) => pr.id !== id),
      overrides: Object.fromEntries(Object.entries(s.overrides).filter(([, o]) => o.presetId !== id)),
    }));
  };

  const setOverride: SchoolContextValue['setOverride'] = (dates, override) => {
    setState((s) => {
      const overrides = { ...s.overrides };
      for (const date of dates) {
        if (override === null) delete overrides[date];
        else overrides[date] = override;
      }
      return { ...s, overrides };
    });
  };

  const setShowBreaks: SchoolContextValue['setShowBreaks'] = (show) => {
    setState((s) => ({ ...s, showBreaks: show }));
  };

  const addHomework: SchoolContextValue['addHomework'] = (classId, hw) => {
    setState((s) => {
      const homework = s.homework ?? {};
      return { ...s, homework: { ...homework, [classId]: [...(homework[classId] || []), { ...hw, id: Date.now(), done: false }] } };
    });
  };
  const toggleHomework: SchoolContextValue['toggleHomework'] = (classId, id) => {
    setState((s) => {
      const homework = s.homework ?? {};
      return { ...s, homework: { ...homework, [classId]: (homework[classId] || []).map((h) => (h.id === id ? { ...h, done: !h.done } : h)) } };
    });
  };
  const removeHomework: SchoolContextValue['removeHomework'] = (classId, id) => {
    setState((s) => {
      const homework = s.homework ?? {};
      return { ...s, homework: { ...homework, [classId]: (homework[classId] || []).filter((h) => h.id !== id) } };
    });
  };

  const toggleSchoologyHomeworkDone: SchoolContextValue['toggleSchoologyHomeworkDone'] = (uid) => {
    setState((s) => {
      const schoologyDone = s.schoologyDone ?? {};
      return { ...s, schoologyDone: { ...schoologyDone, [uid]: !schoologyDone[uid] } };
    });
  };

  const setClassMapping: SchoolContextValue['setClassMapping'] = (category, classId) => {
    setState((s) => {
      const classMappings = { ...(s.classMappings ?? {}) };
      const key = category.trim().toLowerCase();
      if (classId) classMappings[key] = classId;
      else delete classMappings[key];
      return { ...s, classMappings };
    });
  };

  const normalizedHomework = (() => {
    const homework = state.homework ?? {};
    const out: Record<string, Homework[]> = {};
    for (const [classId, list] of Object.entries(homework)) {
      out[classId] = list.map((h) => ({ ...h, due: normalizeDue(h.due) }));
    }
    return out;
  })();

  return (
    <SchoolContext.Provider
      value={{
        ...state,
        classes: state.classes.map(normalizeClass),
        showBreaks: state.showBreaks ?? true,
        homework: normalizedHomework,
        schoologyDone: state.schoologyDone ?? {},
        classMappings: state.classMappings ?? {},
        addClass, updateClass, removeClass, addPreset, updatePreset, removePreset, setOverride, setShowBreaks,
        addHomework, toggleHomework, removeHomework, toggleSchoologyHomeworkDone, setClassMapping,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error('useSchool must be used within a SchoolProvider');
  return ctx;
}
