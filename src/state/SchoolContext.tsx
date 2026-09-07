import { createContext, useContext, type ReactNode } from 'react';
import { useRemoteState } from '../lib/remoteStore';
import { useAuth } from './AuthContext';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface Meeting {
  day: Weekday;
  start: number;
  end: number;
}

export interface SchoolClass {
  id: string;
  name: string;
  room: string;
  meetings: Meeting[];
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

const DEFAULT_CLASSES: SchoolClass[] = [
  { id: 'calc', name: 'Calculus II', room: 'Rm 214', meetings: [
    { day: 'Mon', start: 9, end: 10 }, { day: 'Wed', start: 9, end: 10 }, { day: 'Fri', start: 9, end: 10 },
  ] },
  { id: 'chem', name: 'Chemistry', room: 'Lab B', meetings: [
    { day: 'Mon', start: 10.5, end: 12 }, { day: 'Wed', start: 10.5, end: 12 },
  ] },
  { id: 'hist', name: 'World History', room: 'Rm 108', meetings: [
    { day: 'Tue', start: 13, end: 14 }, { day: 'Thu', start: 13, end: 14 },
  ] },
  { id: 'cs', name: 'Intro to CS', room: 'Rm 301', meetings: [
    { day: 'Mon', start: 14.5, end: 16 }, { day: 'Wed', start: 14.5, end: 16 }, { day: 'Fri', start: 14.5, end: 16 },
  ] },
  { id: 'eng', name: 'English Lit', room: 'Rm 220', meetings: [
    { day: 'Tue', start: 11, end: 12 }, { day: 'Thu', start: 11, end: 12 },
  ] },
];

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
}

interface SchoolContextValue extends StoredState {
  addClass: (c: Omit<SchoolClass, 'id'>) => void;
  updateClass: (id: string, c: Omit<SchoolClass, 'id'>) => void;
  removeClass: (id: string) => void;
  addPreset: (p: Omit<Preset, 'id'>) => void;
  updatePreset: (id: string, p: Omit<Preset, 'id'>) => void;
  removePreset: (id: string) => void;
  setOverride: (dates: string[], override: DayOverride | null) => void;
}

const SchoolContext = createContext<SchoolContextValue | null>(null);

const DEFAULT_STATE: StoredState = { classes: DEFAULT_CLASSES, presets: DEFAULT_PRESETS, overrides: {} };

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

  return (
    <SchoolContext.Provider value={{ ...state, addClass, updateClass, removeClass, addPreset, updatePreset, removePreset, setOverride }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error('useSchool must be used within a SchoolProvider');
  return ctx;
}
