import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Widget, PageHeader } from '../components/Widget';
import { useCalendarEvents, eventKey, type CalEvent } from '../state/CalendarContext';
import { useGoogleAuth } from '../state/GoogleAuthContext';
import { EventDialog } from '../components/EventDialog';
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import './Calendar.css';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "Y-M-D" (0-based month) -> "YYYY-MM-DD" for a date input / iso date key. */
function isoFromKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Best-effort parse of a display time ("9:00 AM", "14:30") back into 24h "HH:MM". */
function to24h(display: string): string {
  const match = display.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '09:00';
  let h = Number(match[1]);
  const m = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}

/** Left-border + tinted-background style from an event's custom color or its Google calendar color. */
function chipColorStyle(ev: CalEvent): CSSProperties {
  const c = ev.color || ev.calendarColor;
  if (!c) return {};
  return { borderLeft: `3px solid ${c}`, background: `color-mix(in srgb, ${c} 16%, var(--color-surface))` };
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m, d);
}

function shiftKey(key: string, days: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function DropTimeDialog({
  event,
  dateKey,
  onConfirm,
  onCancel,
}: {
  event: CalEvent;
  dateKey: string;
  onConfirm: (time: string) => void;
  onCancel: () => void;
}) {
  const [time, setTime] = useState(to24h(event.time));
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Move "{event.title}" to {isoFromKey(dateKey)}</div>
        <div className="field">
          <label>Time</label>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} autoFocus />
        </div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={() => onConfirm(time)}>Move</button>
        </div>
      </div>
    </div>
  );
}

function DayAgenda({
  dayKey,
  onBack,
  onPrevDay,
  onNextDay,
  onEditEvent,
  onNewEvent,
  onToggleLocked,
}: {
  dayKey: string;
  onBack: () => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onEditEvent: (ev: CalEvent) => void;
  onNewEvent: (dateKey: string) => void;
  onToggleLocked: (ev: CalEvent) => void;
}) {
  const { eventsByDate } = useCalendarEvents();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const dayEvents = eventsByDate(dayKey);
  const allDayEvents = dayEvents.filter((e) => e.allDay);
  const timedEvents = dayEvents.filter((e) => !e.allDay);
  const label = parseKey(dayKey).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const menuItems: ContextMenuItem[] = [
    {
      label: 'New event',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
      ),
      onClick: () => onNewEvent(dayKey),
    },
  ];

  return (
    <Widget>
      <div className="widget-head" style={{ justifyContent: 'flex-start', gap: 'var(--space-3)' }}>
        <button className="btn btn-icon" type="button" onClick={onBack} title="Back to month">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <button className="btn btn-icon" type="button" onClick={onPrevDay}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg></button>
        <h3 style={{ minWidth: 0 }}>{label}</h3>
        <button className="btn btn-icon" type="button" onClick={onNextDay}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg></button>
        <button className="btn btn-secondary" type="button" onClick={() => onNewEvent(dayKey)} style={{ marginLeft: 'var(--space-2)' }}>
          Add event
        </button>
      </div>

      <div
        className="day-view"
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
      >
        {allDayEvents.length > 0 && (
          <div className="day-view-allday">
            {allDayEvents.map((ev) => (
              <div
                className={`evt-chip allday${ev.locked ? ' locked' : ''}`}
                key={eventKey(ev)}
                onClick={() => onEditEvent(ev)}
                style={ev.color ? { background: `color-mix(in srgb, ${ev.color} 30%, var(--color-allday))`, borderLeft: `3px solid ${ev.color}` } : {}}
                title="Click to edit"
              >
                {ev.title}
                <span
                  className="evt-lock"
                  role="button"
                  tabIndex={0}
                  title={ev.locked ? 'Unlock' : 'Lock in place'}
                  onClick={(e) => { e.stopPropagation(); onToggleLocked(ev); }}
                >
                  {ev.locked ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {timedEvents.length === 0 && allDayEvents.length === 0 && (
          <p className="text-muted" style={{ fontSize: 13, padding: 'var(--space-3) 0' }}>
            No events. Right-click, or use "Add event", to create one.
          </p>
        )}

        <div className="day-view-list">
          {timedEvents.map((ev) => (
            <div
              className={`day-view-event${ev.locked ? ' locked' : ''}`}
              key={eventKey(ev)}
              onClick={() => onEditEvent(ev)}
              style={chipColorStyle(ev)}
            >
              {ev.cls === 'google' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="9" height="6" rx="3" /><rect x="10" y="10" width="9" height="6" rx="3" /></svg>}
              <span className="day-view-event-time">{ev.time}</span>
              <span className="day-view-event-title">{ev.title}</span>
              {ev.location && <span className="day-view-event-loc">{ev.location}</span>}
              <span
                className="evt-lock"
                role="button"
                tabIndex={0}
                title={ev.locked ? 'Unlock' : 'Lock in place'}
                onClick={(e) => { e.stopPropagation(); onToggleLocked(ev); }}
              >
                {ev.locked ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </Widget>
  );
}

export function CalendarPage() {
  const { events, loading, error, refresh, updateEvent, toggleEventLocked } = useCalendarEvents();
  const { status, accounts } = useGoogleAuth();
  const signedInCount = accounts.filter((a) => a.status === 'signed-in').length;
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [dialogDate, setDialogDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropPrompt, setDropPrompt] = useState<{ event: CalEvent; dateKey: string } | null>(null);
  const [view, setView] = useState<'month' | 'day'>('month');
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [dayMenu, setDayMenu] = useState<{ x: number; y: number; dateKey: string } | null>(null);

  useEffect(() => {
    if (signedInCount === 0) return;
    refresh(new Date(viewYear, viewMonth, 1), new Date(viewYear, viewMonth + 1, 1));
  }, [signedInCount, viewYear, viewMonth, refresh]);

  const openDay = (key: string) => {
    const d = parseKey(key);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setDayKey(key);
    setView('day');
  };
  const goToDayOffset = (days: number) => {
    setDayKey((k) => {
      if (!k) return k;
      const next = shiftKey(k, days);
      const d = parseKey(next);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      return next;
    });
  };

  const prevMonth = () => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  };
  const nextMonth = () => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  };
  const goToday = () => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); };

  const year = viewYear;
  const month = viewMonth;
  const realY = now.getFullYear();
  const realM = now.getMonth();
  const realD = now.getDate();
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const eventsByKey: Record<string, typeof events> = {};
  events.forEach((ev) => {
    if (!eventsByKey[ev.date]) eventsByKey[ev.date] = [];
    eventsByKey[ev.date].push(ev);
  });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { inMonth: boolean; cls: string; num: number | ''; events: typeof events }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ inMonth: false, cls: 'blank', num: '', events: [] });
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = year === realY && month === realM && d === realD;
    const key = `${year}-${month}-${d}`;
    cells.push({ inMonth: true, cls: isToday ? 'today' : '', num: d, events: eventsByKey[key] || [] });
  }
  while (cells.length % 7 !== 0) cells.push({ inMonth: false, cls: 'blank', num: '', events: [] });

  return (
    <div className="page">
      <PageHeader
        kicker="Schedule"
        title="Calendar"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {status === 'unconfigured' && (
              <span className="tag tag-outline" title="Set VITE_GOOGLE_CLIENT_ID to enable Google Calendar sync (see Settings)">
                Google Calendar not configured
              </span>
            )}
            {status === 'ready' && signedInCount === 0 && (
              <Link className="btn btn-secondary" to="/settings">Connect Google Calendar</Link>
            )}
            {status === 'ready' && signedInCount > 0 && (
              <>
                <span className="tag tag-outline">
                  {signedInCount === 1 ? `Synced with ${accounts.find((a) => a.status === 'signed-in')?.email}` : `Synced with ${signedInCount} accounts`}
                </span>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={loading}
                  onClick={() => refresh(new Date(viewYear, viewMonth, 1), new Date(viewYear, viewMonth + 1, 1))}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 4v5h-5" /></svg>
                  {loading ? 'Syncing…' : 'Sync now'}
                </button>
                <Link className="btn btn-ghost" to="/settings">Manage</Link>
              </>
            )}
            <button className="btn btn-primary" type="button" onClick={() => setDialogDate(toISODate(realY, realM, realD))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add event
            </button>
          </div>
        }
      />

      {error && <div className="empty-msg" style={{ color: 'var(--danger, #c0392b)' }}>{error}</div>}

      {view === 'day' && dayKey ? (
        <DayAgenda
          dayKey={dayKey}
          onBack={() => setView('month')}
          onPrevDay={() => goToDayOffset(-1)}
          onNextDay={() => goToDayOffset(1)}
          onEditEvent={setEditingEvent}
          onNewEvent={(key) => setDialogDate(isoFromKey(key))}
          onToggleLocked={(ev) => toggleEventLocked(ev.id, { accountEmail: ev.accountEmail, calendarId: ev.calendarId })}
        />
      ) : (
      <Widget>
        <div className="widget-head" style={{ justifyContent: 'flex-start', gap: 'var(--space-3)' }}>
          <button className="btn btn-icon" type="button" onClick={prevMonth}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg></button>
          <h3 style={{ minWidth: 200 }}>{monthLabel}</h3>
          <button className="btn btn-icon" type="button" onClick={nextMonth}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg></button>
          <button className="btn btn-secondary" type="button" onClick={goToday} style={{ marginLeft: 'var(--space-2)' }}>Today</button>
        </div>
        <div className="month-grid">
          {DOW_LABELS.map((d) => <div className="dow" key={d}>{d}</div>)}
          {cells.map((c, i) => {
            const dateKey = c.inMonth && typeof c.num === 'number' ? `${year}-${month}-${c.num}` : null;
            const allDayEvents = c.events.filter((ev) => ev.allDay);
            const timedEvents = c.events.filter((ev) => !ev.allDay);
            return (
            <div
              className={`day-cell${c.cls ? ` ${c.cls}` : ''}${c.inMonth ? ' clickable' : ''}`}
              key={i}
              onClick={() => dateKey && openDay(dateKey)}
              onContextMenu={(e) => {
                if (!dateKey) return;
                e.preventDefault();
                setDayMenu({ x: e.clientX, y: e.clientY, dateKey });
              }}
              onDragOver={(e) => { if (draggingKey && dateKey) e.preventDefault(); }}
              onDrop={(e) => {
                if (!draggingKey || !dateKey) return;
                e.preventDefault();
                e.stopPropagation();
                const dragged = events.find((ev) => eventKey(ev) === draggingKey);
                setDraggingKey(null);
                if (!dragged || dragged.locked || dragged.date === dateKey) return;
                const source = { accountEmail: dragged.accountEmail, calendarId: dragged.calendarId };
                if (dragged.allDay) {
                  updateEvent(dragged.id, dateKey, dragged.title, '', dragged.durationMin, {
                    description: dragged.description,
                    location: dragged.location,
                    allDay: true,
                  }, source);
                } else {
                  setDropPrompt({ event: dragged, dateKey });
                }
              }}
            >
              {c.inMonth && (
                <>
                  <span className="day-num">{c.num}</span>
                  {allDayEvents.length > 0 && (
                    <div className="allday-row">
                      {allDayEvents.map((ev) => (
                        <span
                          className={`evt-chip allday${ev.locked ? ' locked' : ''}`}
                          key={eventKey(ev)}
                          title={ev.locked ? 'Locked — set in stone.' : `${ev.title} (all day) — click to edit`}
                          onClick={(e) => { e.stopPropagation(); setEditingEvent(ev); }}
                          style={ev.color ? { background: `color-mix(in srgb, ${ev.color} 30%, var(--color-allday))`, borderLeft: `3px solid ${ev.color}` } : {}}
                        >
                          {ev.title}
                        </span>
                      ))}
                    </div>
                  )}
                  {timedEvents.map((ev) => (
                    <span
                      className={`evt-chip${ev.cls ? ` ${ev.cls}` : ''}${ev.locked ? ' locked' : ''}`}
                      key={eventKey(ev)}
                      title={ev.locked ? 'Locked — set in stone. Click the lock to unlock.' : 'Click to edit'}
                      draggable={!ev.locked}
                      onDragStart={(e) => { e.stopPropagation(); setDraggingKey(eventKey(ev)); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={(e) => { e.stopPropagation(); setDraggingKey(null); }}
                      onClick={(e) => { e.stopPropagation(); setEditingEvent(ev); }}
                      style={{
                        cursor: ev.locked ? 'default' : 'grab',
                        ...chipColorStyle(ev),
                      }}
                    >
                      {ev.cls === 'google' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="9" height="6" rx="3" /><rect x="10" y="10" width="9" height="6" rx="3" /></svg>}
                      {ev.time} {ev.title}
                      <span
                        className="evt-lock"
                        role="button"
                        tabIndex={0}
                        title={ev.locked ? 'Unlock' : 'Lock in place — set in stone'}
                        onClick={(e) => { e.stopPropagation(); toggleEventLocked(ev.id, { accountEmail: ev.accountEmail, calendarId: ev.calendarId }); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleEventLocked(ev.id, { accountEmail: ev.accountEmail, calendarId: ev.calendarId }); } }}
                      >
                        {ev.locked ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>
                        )}
                      </span>
                    </span>
                  ))}
                </>
              )}
            </div>
            );
          })}
        </div>
      </Widget>
      )}

      {dayMenu && (
        <ContextMenu
          x={dayMenu.x}
          y={dayMenu.y}
          onClose={() => setDayMenu(null)}
          items={[
            {
              label: 'New event',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              ),
              onClick: () => setDialogDate(isoFromKey(dayMenu.dateKey)),
            },
            {
              label: 'Open day',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
              ),
              onClick: () => openDay(dayMenu.dateKey),
            },
          ]}
        />
      )}

      {dialogDate && <EventDialog initialDate={dialogDate} onClose={() => setDialogDate(null)} />}
      {editingEvent && (
        <EventDialog initialDate={isoFromKey(editingEvent.date)} editing={editingEvent} onClose={() => setEditingEvent(null)} />
      )}
      {dropPrompt && (
        <DropTimeDialog
          event={dropPrompt.event}
          dateKey={dropPrompt.dateKey}
          onCancel={() => setDropPrompt(null)}
          onConfirm={(time) => {
            updateEvent(dropPrompt.event.id, dropPrompt.dateKey, dropPrompt.event.title, time, dropPrompt.event.durationMin, {
              description: dropPrompt.event.description,
              location: dropPrompt.event.location,
              allDay: false,
            }, { accountEmail: dropPrompt.event.accountEmail, calendarId: dropPrompt.event.calendarId });
            setDropPrompt(null);
          }}
        />
      )}
    </div>
  );
}
