import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface SchoolClass {
  id: string;
  name: string;
  room: string;
  start: number;
  end: number;
  days: string[];
}

const STORAGE_KEY = 'fourfold.schoolClasses';

const DEFAULT_CLASSES: SchoolClass[] = [
  { id: 'calc', name: 'Calculus II', room: 'Rm 214', start: 9, end: 10, days: ['Mon', 'Wed', 'Fri'] },
  { id: 'chem', name: 'Chemistry', room: 'Lab B', start: 10.5, end: 12, days: ['Mon', 'Wed'] },
  { id: 'hist', name: 'World History', room: 'Rm 108', start: 13, end: 14, days: ['Tue', 'Thu'] },
  { id: 'cs', name: 'Intro to CS', room: 'Rm 301', start: 14.5, end: 16, days: ['Mon', 'Wed', 'Fri'] },
  { id: 'eng', name: 'English Lit', room: 'Rm 220', start: 11, end: 12, days: ['Tue', 'Thu'] },
];

interface SchoolContextValue {
  classes: SchoolClass[];
  addClass: (c: Omit<SchoolClass, 'id'>) => void;
  updateClass: (id: string, c: Omit<SchoolClass, 'id'>) => void;
  removeClass: (id: string) => void;
}

const SchoolContext = createContext<SchoolContextValue | null>(null);

function loadInitial(): SchoolClass[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed storage
  }
  return DEFAULT_CLASSES;
}

export function SchoolProvider({ children }: { children: ReactNode }) {
  const [classes, setClasses] = useState<SchoolClass[]>(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(classes));
    } catch {
      // storage unavailable — state still works for this session
    }
  }, [classes]);

  const addClass: SchoolContextValue['addClass'] = (c) => {
    setClasses((prev) => [...prev, { ...c, id: `class-${Date.now()}` }]);
  };
  const updateClass: SchoolContextValue['updateClass'] = (id, c) => {
    setClasses((prev) => prev.map((cls) => (cls.id === id ? { ...c, id } : cls)));
  };
  const removeClass = (id: string) => {
    setClasses((prev) => prev.filter((cls) => cls.id !== id));
  };

  return (
    <SchoolContext.Provider value={{ classes, addClass, updateClass, removeClass }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error('useSchool must be used within a SchoolProvider');
  return ctx;
}
