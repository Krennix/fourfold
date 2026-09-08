import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useGoogleAuth } from './GoogleAuthContext';
import { deleteEvent, insertEvent, listEvents, updateEvent as patchGoogleEvent, type GoogleCalendarEvent } from '../lib/googleCalendar';

const STORAGE_KEY = 'fourfold.calendar.v1';
/** Google-sourced events are refetched fresh on every refresh, so "locked" can't live on the
 * event object itself — it's tracked here as a standalone set of event ids and overlaid onto
 * whichever events (local or Google) currently have a matching id. */
const LOCKED_STORAGE_KEY = 'fourfold.calendar.locked.v1';

export interface CalEvent {
  id: string;
  date: string; // "YYYY-M-D" with 0-based month
  time: string;
  title: string;
  cls: '' | 'google';
  /** Length of the event in minutes, when known (absent for legacy/local events). */
  durationMin?: number;
  /** Fixed/"set in stone" — shouldn't be moved, rescheduled, or deleted by drag/AI actions. */
  locked?: boolean;
  description?: string;
  location?: string;
  allDay?: boolean;
}

export interface EventExtras {
  description?: string;
  location?: string;
  allDay?: boolean;
}

export interface CalendarContextValue {
  events: CalEvent[];
  loading: boolean;
  error: string | null;
  refresh: (monthStart: Date, monthEnd: Date) => void;
  addEvent: (date: string, title: string, time: string, durationMin?: number, extras?: EventExtras) => Promise<CalEvent | null>;
  updateEvent: (id: string, date: string, title: string, time: string, durationMin?: number, extras?: EventExtras) => Promise<CalEvent | null>;
  removeEvent: (id: string) => void;
  toggleEventLocked: (id: string) => void;
  eventsByDate: (date: string) => CalEvent[];
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

function loadLocalEvents(): CalEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed storage
  }
  return [];
}

function loadLockedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCKED_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    // ignore malformed storage
  }
  return new Set();
}

function googleEventToCalEvent(ev: GoogleCalendarEvent): CalEvent | null {
  const startISO = ev.start.dateTime ?? ev.start.date;
  if (!startISO) return null;
  const start = new Date(startISO);
  const date = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
  const allDay = !ev.start.dateTime;
  const time = ev.start.dateTime
    ? start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'All day';
  const endISO = ev.end.dateTime ?? ev.end.date;
  const durationMin = ev.start.dateTime && endISO ? (new Date(endISO).getTime() - start.getTime()) / 60000 : undefined;
  return {
    id: ev.id,
    date,
    time,
    title: ev.summary || '(no title)',
    cls: 'google',
    durationMin,
    description: ev.description,
    location: ev.location,
    allDay,
  };
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { status, accessToken } = useGoogleAuth();
  const [localEvents, setLocalEvents] = useState<CalEvent[]>(loadLocalEvents);
  const [googleEvents, setGoogleEvents] = useState<CalEvent[]>([]);
  const [lockedIds, setLockedIds] = useState<Set<string>>(loadLockedIds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localEvents));
    } catch {
      // storage unavailable — state still works for this session
    }
  }, [localEvents]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCKED_STORAGE_KEY, JSON.stringify([...lockedIds]));
    } catch {
      // storage unavailable — state still works for this session
    }
  }, [lockedIds]);

  const toggleEventLocked = useCallback((id: string) => {
    setLockedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (status !== 'signed-in') setGoogleEvents([]);
  }, [status]);

  const refresh = useCallback(
    (monthStart: Date, monthEnd: Date) => {
      if (status !== 'signed-in' || !accessToken) return;
      setLoading(true);
      setError(null);
      listEvents(accessToken, monthStart, monthEnd)
        .then((items) => setGoogleEvents(items.map(googleEventToCalEvent).filter((e): e is CalEvent => e !== null)))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    },
    [status, accessToken],
  );

  // Google's all-day events use exclusive date-only ranges: the end date is the day *after* the last day shown.
  function allDayRange(y: number, m: number, d: number): { startISO: string; endISO: string } {
    const pad = (n: number) => String(n).padStart(2, '0');
    const start = new Date(y, m, d);
    const end = new Date(y, m, d + 1);
    return {
      startISO: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      endISO: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    };
  }

  // `date` is "Y-M-D" with a 0-based month, matching the key used for eventsByDate/day-cell lookups.
  const addEvent: CalendarContextValue['addEvent'] = async (date, title, time, durationMin = 60, extras = {}) => {
    const { description, location, allDay } = extras;
    if (status === 'signed-in' && accessToken) {
      const [y, m, d] = date.split('-').map(Number);
      let timing: { allDay?: boolean; startISO: string; endISO: string };
      if (allDay) {
        timing = { allDay: true, ...allDayRange(y, m, d) };
      } else {
        const [h, min] = (time || '09:00').split(':').map(Number);
        const start = new Date(y, m, d, h || 9, min || 0);
        const end = new Date(start.getTime() + durationMin * 60000);
        timing = { startISO: start.toISOString(), endISO: end.toISOString() };
      }
      setLoading(true);
      setError(null);
      try {
        const ev = await insertEvent(accessToken, { summary: title, description, location, ...timing });
        const mapped = googleEventToCalEvent(ev);
        if (mapped) setGoogleEvents((prev) => [...prev, mapped]);
        return mapped;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setLoading(false);
      }
    }
    const created: CalEvent = {
      id: `event-${Date.now()}`,
      date,
      title,
      time: allDay ? 'All day' : time,
      cls: '',
      durationMin,
      description,
      location,
      allDay,
    };
    setLocalEvents((prev) => [...prev, created]);
    return created;
  };

  // `date` is "Y-M-D" with a 0-based month, matching `addEvent`.
  const updateEvent: CalendarContextValue['updateEvent'] = async (id, date, title, time, durationMin = 60, extras = {}) => {
    if (lockedIds.has(id)) {
      setError('That event is locked — unlock it before moving it.');
      return null;
    }
    const { description, location, allDay } = extras;
    const googleEvent = googleEvents.find((e) => e.id === id);
    if (googleEvent && accessToken) {
      const [y, m, d] = date.split('-').map(Number);
      let timing: { allDay?: boolean; startISO: string; endISO: string };
      if (allDay) {
        timing = { allDay: true, ...allDayRange(y, m, d) };
      } else {
        const [h, min] = (time || '09:00').split(':').map(Number);
        const start = new Date(y, m, d, h || 9, min || 0);
        const end = new Date(start.getTime() + durationMin * 60000);
        timing = { startISO: start.toISOString(), endISO: end.toISOString() };
      }
      setLoading(true);
      setError(null);
      try {
        const ev = await patchGoogleEvent(accessToken, id, { summary: title, description, location, ...timing });
        const mapped = googleEventToCalEvent(ev);
        if (mapped) setGoogleEvents((prev) => prev.map((e) => (e.id === id ? mapped : e)));
        return mapped;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setLoading(false);
      }
    }
    const updated: CalEvent = {
      id,
      date,
      title,
      time: allDay ? 'All day' : time,
      cls: '',
      durationMin,
      description,
      location,
      allDay,
    };
    setLocalEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
    return updated;
  };

  const removeEvent = (id: string) => {
    if (lockedIds.has(id)) {
      setError('That event is locked — unlock it before deleting it.');
      return;
    }
    const googleEvent = googleEvents.find((e) => e.id === id);
    if (googleEvent && accessToken) {
      setError(null);
      deleteEvent(accessToken, id)
        .then(() => setGoogleEvents((prev) => prev.filter((e) => e.id !== id)))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
      return;
    }
    setLocalEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const events = [...googleEvents, ...localEvents].map((e) => (lockedIds.has(e.id) ? { ...e, locked: true } : e));
  const eventsByDate = (date: string) => events.filter((e) => e.date === date).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <CalendarContext.Provider value={{ events, loading, error, refresh, addEvent, updateEvent, removeEvent, toggleEventLocked, eventsByDate }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendarEvents() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error('useCalendarEvents must be used within a CalendarProvider');
  return ctx;
}
