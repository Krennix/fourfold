import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useGoogleAuth } from './GoogleAuthContext';
import { deleteEvent, insertEvent, listEvents, type GoogleCalendarEvent } from '../lib/googleCalendar';

const STORAGE_KEY = 'fourfold.calendar.v1';

export interface CalEvent {
  id: string;
  date: string; // "YYYY-M-D" with 0-based month
  time: string;
  title: string;
  cls: '' | 'google';
  /** Length of the event in minutes, when known (absent for legacy/local events). */
  durationMin?: number;
}

interface CalendarContextValue {
  events: CalEvent[];
  loading: boolean;
  error: string | null;
  refresh: (monthStart: Date, monthEnd: Date) => void;
  addEvent: (date: string, title: string, time: string, durationMin?: number) => Promise<CalEvent | null>;
  removeEvent: (id: string) => void;
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

function googleEventToCalEvent(ev: GoogleCalendarEvent): CalEvent | null {
  const startISO = ev.start.dateTime ?? ev.start.date;
  if (!startISO) return null;
  const start = new Date(startISO);
  const date = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
  const time = ev.start.dateTime
    ? start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'All day';
  const endISO = ev.end.dateTime ?? ev.end.date;
  const durationMin = ev.start.dateTime && endISO ? (new Date(endISO).getTime() - start.getTime()) / 60000 : undefined;
  return { id: ev.id, date, time, title: ev.summary || '(no title)', cls: 'google', durationMin };
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { status, accessToken } = useGoogleAuth();
  const [localEvents, setLocalEvents] = useState<CalEvent[]>(loadLocalEvents);
  const [googleEvents, setGoogleEvents] = useState<CalEvent[]>([]);
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

  // `date` is "Y-M-D" with a 0-based month, matching the key used for eventsByDate/day-cell lookups.
  const addEvent: CalendarContextValue['addEvent'] = async (date, title, time, durationMin = 60) => {
    if (status === 'signed-in' && accessToken) {
      const [y, m, d] = date.split('-').map(Number);
      const [h, min] = (time || '09:00').split(':').map(Number);
      const start = new Date(y, m, d, h || 9, min || 0);
      const end = new Date(start.getTime() + durationMin * 60000);
      setLoading(true);
      setError(null);
      try {
        const ev = await insertEvent(accessToken, { summary: title, startISO: start.toISOString(), endISO: end.toISOString() });
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
    const created: CalEvent = { id: `event-${Date.now()}`, date, title, time, cls: '', durationMin };
    setLocalEvents((prev) => [...prev, created]);
    return created;
  };

  const removeEvent = (id: string) => {
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

  const events = [...googleEvents, ...localEvents];
  const eventsByDate = (date: string) => events.filter((e) => e.date === date).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <CalendarContext.Provider value={{ events, loading, error, refresh, addEvent, removeEvent, eventsByDate }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendarEvents() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error('useCalendarEvents must be used within a CalendarProvider');
  return ctx;
}
