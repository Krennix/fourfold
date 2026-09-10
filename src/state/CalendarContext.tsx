import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGoogleAuth, type LinkedAccount } from './GoogleAuthContext';
import { useGoogleIcs, type GoogleIcsEvent } from './GoogleIcsContext';
import { GoogleAuthError, deleteEvent, insertEvent, listEvents, updateEvent as patchGoogleEvent, type GoogleCalendarEvent } from '../lib/googleCalendar';

const STORAGE_KEY = 'fourfold.calendar.v1';
/** Google-sourced events are refetched fresh on every refresh, so "locked" can't live on the
 * event object itself — it's tracked here as a standalone set overlaid onto whichever events
 * (local or Google) currently match. New locks are stored as composite keys (account:calendar:id,
 * see `eventKey`) so multi-calendar ids can't collide; entries from before multi-calendar support
 * are bare event ids, and the lock check/toggle below accepts either form rather than migrating
 * (and silently dropping) them. Keep this the same key name as before that support was added. */
const LOCKED_STORAGE_KEY = 'fourfold.calendar.locked.v1';
/** Local-only edits/hides for events pulled from a read-only ICS feed (see GoogleIcsContext) —
 * there's no write API for a plain ICS subscription, so tweaks live here instead, keyed by
 * `eventKey` and overlaid onto the freshly-fetched feed event on every read. */
const ICS_OVERRIDES_STORAGE_KEY = 'fourfold.calendar.icsOverrides.v1';
/** User-chosen event colors, overlaid onto events the same way `locked` is (see LOCKED_STORAGE_KEY)
 * — this works uniformly across local/Google/ICS events without needing a Google colorId round-trip. */
const COLORS_STORAGE_KEY = 'fourfold.calendar.colors.v1';

type IcsOverride = Partial<Pick<CalEvent, 'date' | 'time' | 'title' | 'durationMin' | 'description' | 'location' | 'allDay'>> & {
  hidden?: boolean;
};

export interface CalEvent {
  id: string;
  date: string; // "YYYY-M-D" with 0-based month
  time: string;
  title: string;
  cls: '' | 'google';
  /** Set for events pulled from a read-only ICS "secret address" feed (see GoogleIcsContext) —
   * these have no backing write API, so edits/removes are applied as local-only overrides
   * instead of ever reaching Google. */
  source?: 'ics';
  /** Length of the event in minutes, when known (absent for legacy/local events). */
  durationMin?: number;
  /** Fixed/"set in stone" — shouldn't be moved, rescheduled, or deleted by drag/AI actions. */
  locked?: boolean;
  description?: string;
  location?: string;
  allDay?: boolean;
  /** Which linked Google account/calendar this came from — absent for local (device-only) events. */
  accountEmail?: string;
  calendarId?: string;
  calendarColor?: string;
  /** User-chosen color override (hex), independent of source — see COLORS_STORAGE_KEY. */
  color?: string;
}

export interface EventExtras {
  description?: string;
  location?: string;
  allDay?: boolean;
  /** Pass a hex color to tag the event with it, or '' to clear a previously-set color. */
  color?: string;
}

/** Where a new/edited event should be written. Omitted or 'local' keeps it device-only. */
export type EventTarget = { accountEmail: string; calendarId: string } | 'local';

export type RepeatFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Which calendar an event lookup should be disambiguated against — pass the event's own
 * `accountEmail`/`calendarId` (undefined for a local event) whenever an `id` alone might collide. */
export type EventSource = { accountEmail?: string; calendarId?: string };

/** Event ids are only unique per Google calendar, so once multiple calendars are linked, a raw
 * `id` can collide across them — everything internal (React keys, lock tracking, lookups) uses
 * this composite key instead; `id` alone is still what's sent back to the Google API. */
export function eventKey(e: Pick<CalEvent, 'id' | 'accountEmail' | 'calendarId'>): string {
  return `${e.accountEmail ?? 'local'}:${e.calendarId ?? 'local'}:${e.id}`;
}

function matchesSource(e: CalEvent, id: string, source?: EventSource): boolean {
  if (e.id !== id) return false;
  if (!source) return true;
  return e.accountEmail === source.accountEmail && e.calendarId === source.calendarId;
}

/** Accepts a lock recorded either as `eventKey(e)` (current format) or as a bare `e.id`
 * (pre-multi-calendar format, still present in existing users' localStorage). */
function isLocked(e: CalEvent, lockedKeys: Set<string>): boolean {
  return lockedKeys.has(eventKey(e)) || lockedKeys.has(e.id);
}

/** Advance a "Y-M-D" (0-based month) date key by one repeat step. */
function advanceDateKey(date: string, freq: RepeatFreq): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(y, m, d);
  if (freq === 'daily') next.setDate(next.getDate() + 1);
  else if (freq === 'weekly') next.setDate(next.getDate() + 7);
  else if (freq === 'monthly') next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return `${next.getFullYear()}-${next.getMonth()}-${next.getDate()}`;
}

export interface GoogleDestination {
  accountEmail: string;
  calendarId: string;
  summary: string;
  color: string;
}

export interface CalendarContextValue {
  events: CalEvent[];
  loading: boolean;
  error: string | null;
  /** Every linked (account, selected calendar) pair — for the add/edit-event destination picker. */
  googleDestinations: GoogleDestination[];
  refresh: (monthStart: Date, monthEnd: Date) => void;
  addEvent: (date: string, title: string, time: string, durationMin?: number, extras?: EventExtras, target?: EventTarget) => Promise<CalEvent | null>;
  /** Creates one event per occurrence from `date` through `until` (inclusive), stepping by `freq`. */
  addRecurringEvent: (
    date: string,
    until: string,
    freq: RepeatFreq,
    title: string,
    time: string,
    durationMin?: number,
    extras?: EventExtras,
    target?: EventTarget,
  ) => Promise<void>;
  updateEvent: (id: string, date: string, title: string, time: string, durationMin?: number, extras?: EventExtras, source?: EventSource) => Promise<CalEvent | null>;
  removeEvent: (id: string, source?: EventSource) => void;
  toggleEventLocked: (id: string, source?: EventSource) => void;
  setEventColor: (id: string, color: string, source?: EventSource) => void;
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

function loadLockedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCKED_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    // ignore malformed storage
  }
  return new Set();
}

function loadEventColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(COLORS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed storage
  }
  return {};
}

function loadIcsOverrides(): Record<string, IcsOverride> {
  try {
    const raw = localStorage.getItem(ICS_OVERRIDES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed storage
  }
  return {};
}

function googleEventToCalEvent(
  ev: GoogleCalendarEvent,
  source: { accountEmail: string; calendarId: string; calendarColor: string },
): CalEvent | null {
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
    accountEmail: source.accountEmail,
    calendarId: source.calendarId,
    calendarColor: source.calendarColor,
  };
}

/** `accountEmail`/`calendarId` are repurposed here (no real Google account backs an ICS feed) so
 * `eventKey`/`matchesSource` disambiguate same-uid events across multiple feeds for free, and so
 * overrides/hides can be looked up by that same composite key. */
function icsEventToCalEvent(
  ev: GoogleIcsEvent & { feedId: string; feedLabel: string; feedColor?: string },
  overrides: Record<string, IcsOverride>,
): CalEvent | null {
  const start = new Date(ev.startISO);
  const base: CalEvent = {
    id: ev.uid,
    date: `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`,
    time: ev.allDay ? 'All day' : start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    title: ev.title,
    cls: 'google',
    source: 'ics',
    durationMin: !ev.allDay ? (new Date(ev.endISO).getTime() - start.getTime()) / 60000 : undefined,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    allDay: ev.allDay,
    accountEmail: 'ics',
    calendarId: ev.feedId,
    calendarColor: ev.feedColor,
  };
  const override = overrides[eventKey(base)];
  if (override?.hidden) return null;
  return override ? { ...base, ...override } : base;
}

function googleDestinationsFor(accounts: LinkedAccount[]): GoogleDestination[] {
  return accounts
    .filter((a) => a.status === 'signed-in')
    .flatMap((a) =>
      a.calendars
        .filter((c) => c.selected)
        .map((c) => ({ accountEmail: a.email, calendarId: c.id, summary: c.summary, color: c.colorOverride || c.color })),
    );
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { accounts, getAccessToken } = useGoogleAuth();
  const { events: icsEvents } = useGoogleIcs();
  const [localEvents, setLocalEvents] = useState<CalEvent[]>(loadLocalEvents);
  const [googleEvents, setGoogleEvents] = useState<CalEvent[]>([]);
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(loadLockedKeys);
  const [eventColors, setEventColors] = useState<Record<string, string>>(loadEventColors);
  const [icsOverrides, setIcsOverrides] = useState<Record<string, IcsOverride>>(loadIcsOverrides);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleDestinations = googleDestinationsFor(accounts);
  const mappedIcsEvents = useMemo(
    () => icsEvents.map((ev) => icsEventToCalEvent(ev, icsOverrides)).filter((e): e is CalEvent => e !== null),
    [icsEvents, icsOverrides],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localEvents));
    } catch {
      // storage unavailable — state still works for this session
    }
  }, [localEvents]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCKED_STORAGE_KEY, JSON.stringify([...lockedKeys]));
    } catch {
      // storage unavailable — state still works for this session
    }
  }, [lockedKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(ICS_OVERRIDES_STORAGE_KEY, JSON.stringify(icsOverrides));
    } catch {
      // storage unavailable — state still works for this session
    }
  }, [icsOverrides]);

  useEffect(() => {
    try {
      localStorage.setItem(COLORS_STORAGE_KEY, JSON.stringify(eventColors));
    } catch {
      // storage unavailable — state still works for this session
    }
  }, [eventColors]);

  const setEventColor = useCallback((id: string, color: string, source?: EventSource) => {
    const event = [...googleEvents, ...localEvents, ...mappedIcsEvents].find((e) => matchesSource(e, id, source));
    if (!event) return;
    const key = eventKey(event);
    setEventColors((prev) => {
      if (!color) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: color };
    });
  }, [googleEvents, localEvents, mappedIcsEvents]);

  const toggleEventLocked = useCallback((id: string, source?: EventSource) => {
    const event = [...googleEvents, ...localEvents, ...mappedIcsEvents].find((e) => matchesSource(e, id, source));
    if (!event) return;
    setLockedKeys((prev) => {
      const next = new Set(prev);
      if (isLocked(event, prev)) {
        // Clear both possible forms — a pre-multi-calendar lock may only be present as the bare id.
        next.delete(eventKey(event));
        next.delete(event.id);
      } else {
        next.add(eventKey(event));
      }
      return next;
    });
  }, [googleEvents, localEvents, mappedIcsEvents]);

  /** Runs `run` with a valid access token for `email`, minted from the server-stored refresh
   * token. If Google rejects the token mid-call (revoked/expired), forces one non-cached refresh
   * and retries once before giving up — this replaces the old client-side refresh-timer scheme. */
  const callWithToken = useCallback(
    async <T,>(email: string, run: (accessToken: string) => Promise<T>): Promise<T> => {
      const token = await getAccessToken(email);
      if (!token) throw new Error('That Google account is no longer connected.');
      try {
        return await run(token);
      } catch (err) {
        if (!(err instanceof GoogleAuthError)) throw err;
        const fresh = await getAccessToken(email, { force: true });
        if (!fresh) throw new Error('That Google account is no longer connected.');
        return run(fresh);
      }
    },
    [getAccessToken],
  );

  const refresh = useCallback(
    (monthStart: Date, monthEnd: Date) => {
      const targets = googleDestinationsFor(accounts);
      if (targets.length === 0) {
        setGoogleEvents([]);
        return;
      }
      setLoading(true);
      setError(null);
      Promise.allSettled(
        targets.map((t) =>
          callWithToken(t.accountEmail, (accessToken) => listEvents(accessToken, t.calendarId, monthStart, monthEnd)).then((items) =>
            items
              .map((item) => googleEventToCalEvent(item, { accountEmail: t.accountEmail, calendarId: t.calendarId, calendarColor: t.color }))
              .filter((e): e is CalEvent => e !== null),
          ),
        ),
      )
        .then((results) => {
          const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
          if (failed.length > 0) setError(failed[0].reason instanceof Error ? failed[0].reason.message : String(failed[0].reason));
          setGoogleEvents(results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])));
        })
        .finally(() => setLoading(false));
    },
    [accounts, callWithToken],
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

  function timingFor(date: string, time: string, durationMin: number, allDay?: boolean) {
    const [y, m, d] = date.split('-').map(Number);
    if (allDay) return { allDay: true as const, ...allDayRange(y, m, d) };
    const [h, min] = (time || '09:00').split(':').map(Number);
    const start = new Date(y, m, d, h || 9, min || 0);
    const end = new Date(start.getTime() + durationMin * 60000);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }

  const applyColorOverlay = useCallback((key: string, color?: string) => {
    setEventColors((prev) => {
      if (!color) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: color };
    });
  }, []);

  // `date` is "Y-M-D" with a 0-based month, matching the key used for eventsByDate/day-cell lookups.
  const addEvent: CalendarContextValue['addEvent'] = async (date, title, time, durationMin = 60, extras = {}, target = 'local') => {
    const { description, location, allDay, color } = extras;
    if (target !== 'local') {
      const destination = googleDestinations.find((d) => d.accountEmail === target.accountEmail && d.calendarId === target.calendarId);
      if (!destination) {
        setError('That Google calendar is no longer connected.');
        return null;
      }
      const timing = timingFor(date, time, durationMin, allDay);
      setLoading(true);
      setError(null);
      try {
        const ev = await callWithToken(target.accountEmail, (accessToken) =>
          insertEvent(accessToken, target.calendarId, { summary: title, description, location, ...timing }),
        );
        const mapped = googleEventToCalEvent(ev, { accountEmail: target.accountEmail, calendarId: target.calendarId, calendarColor: destination.color });
        if (mapped) {
          setGoogleEvents((prev) => [...prev, mapped]);
          if (color) applyColorOverlay(eventKey(mapped), color);
        }
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
    if (color) applyColorOverlay(eventKey(created), color);
    return created;
  };

  const MAX_RECURRING_OCCURRENCES = 366;

  const addRecurringEvent: CalendarContextValue['addRecurringEvent'] = async (
    date,
    until,
    freq,
    title,
    time,
    durationMin = 60,
    extras = {},
    target = 'local',
  ) => {
    const [uy, um, ud] = until.split('-').map(Number);
    const untilTime = new Date(uy, um, ud).getTime();
    let cursor = date;
    for (let i = 0; i < MAX_RECURRING_OCCURRENCES; i++) {
      const [cy, cm, cd] = cursor.split('-').map(Number);
      if (new Date(cy, cm, cd).getTime() > untilTime) break;
      await addEvent(cursor, title, time, durationMin, extras, target);
      cursor = advanceDateKey(cursor, freq);
    }
  };

  // `date` is "Y-M-D" with a 0-based month, matching `addEvent`.
  const updateEvent: CalendarContextValue['updateEvent'] = async (id, date, title, time, durationMin = 60, extras = {}, source) => {
    const icsEvent = mappedIcsEvents.find((e) => matchesSource(e, id, source));
    if (icsEvent) {
      if (isLocked(icsEvent, lockedKeys)) {
        setError('That event is locked — unlock it before moving it.');
        return null;
      }
      const { description, location, allDay, color } = extras;
      const updated: CalEvent = { ...icsEvent, date, title, time: allDay ? 'All day' : time, durationMin, description, location, allDay };
      setIcsOverrides((prev) => ({ ...prev, [eventKey(icsEvent)]: { date, title, time: updated.time, durationMin, description, location, allDay } }));
      if (color !== undefined) applyColorOverlay(eventKey(icsEvent), color);
      return updated;
    }
    const googleEvent = googleEvents.find((e) => matchesSource(e, id, source));
    const existing = googleEvent ?? localEvents.find((e) => matchesSource(e, id, source));
    if (existing && isLocked(existing, lockedKeys)) {
      setError('That event is locked — unlock it before moving it.');
      return null;
    }
    const { description, location, allDay, color } = extras;
    if (googleEvent?.accountEmail && googleEvent.calendarId) {
      const accountEmail = googleEvent.accountEmail;
      const calendarId = googleEvent.calendarId;
      const timing = timingFor(date, time, durationMin, allDay);
      setLoading(true);
      setError(null);
      try {
        const ev = await callWithToken(accountEmail, (accessToken) =>
          patchGoogleEvent(accessToken, calendarId, id, { summary: title, description, location, ...timing }),
        );
        const mapped = googleEventToCalEvent(ev, {
          accountEmail,
          calendarId,
          calendarColor: googleEvent.calendarColor ?? '#4285f4',
        });
        if (mapped) {
          setGoogleEvents((prev) =>
            prev.map((e) => (e.id === id && e.accountEmail === accountEmail && e.calendarId === calendarId ? mapped : e)),
          );
          if (color !== undefined) applyColorOverlay(eventKey(mapped), color);
        }
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
    if (color !== undefined) applyColorOverlay(eventKey(updated), color);
    return updated;
  };

  const removeEvent = (id: string, source?: EventSource) => {
    const icsEvent = mappedIcsEvents.find((e) => matchesSource(e, id, source));
    if (icsEvent) {
      if (isLocked(icsEvent, lockedKeys)) {
        setError('That event is locked — unlock it before deleting it.');
        return;
      }
      // Hidden locally rather than truly deleted — a plain ICS subscription has no delete API.
      setIcsOverrides((prev) => ({ ...prev, [eventKey(icsEvent)]: { hidden: true } }));
      return;
    }
    const googleEvent = googleEvents.find((e) => matchesSource(e, id, source));
    const existing = googleEvent ?? localEvents.find((e) => matchesSource(e, id, source));
    if (existing && isLocked(existing, lockedKeys)) {
      setError('That event is locked — unlock it before deleting it.');
      return;
    }
    if (googleEvent?.accountEmail && googleEvent.calendarId) {
      const accountEmail = googleEvent.accountEmail;
      const calendarId = googleEvent.calendarId;
      setError(null);
      callWithToken(accountEmail, (accessToken) => deleteEvent(accessToken, calendarId, id))
        .then(() => setGoogleEvents((prev) => prev.filter((e) => !(e.id === id && e.accountEmail === accountEmail && e.calendarId === calendarId))))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
      return;
    }
    setLocalEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const events = [...googleEvents, ...localEvents, ...mappedIcsEvents].map((e) => {
    const withLock = isLocked(e, lockedKeys) ? { ...e, locked: true } : e;
    const color = eventColors[eventKey(e)];
    return color ? { ...withLock, color } : withLock;
  });
  const eventsByDate = (date: string) => events.filter((e) => e.date === date).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <CalendarContext.Provider
      value={{
        events,
        loading,
        error,
        googleDestinations,
        refresh,
        addEvent,
        addRecurringEvent,
        updateEvent,
        removeEvent,
        toggleEventLocked,
        setEventColor,
        eventsByDate,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendarEvents() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error('useCalendarEvents must be used within a CalendarProvider');
  return ctx;
}
