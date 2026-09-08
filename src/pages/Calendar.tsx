import { useEffect, useRef, useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useCalendarEvents } from '../state/CalendarContext';
import { useGoogleAuth } from '../state/GoogleAuthContext';
import './Calendar.css';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarPage() {
  const { events, loading, error, refresh, addEvent, removeEvent, toggleEventLocked } = useCalendarEvents();
  const { status, email, connect, disconnect } = useGoogleAuth();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [dialogOpen, setDialogOpen] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status !== 'signed-in') return;
    refresh(new Date(viewYear, viewMonth, 1), new Date(viewYear, viewMonth + 1, 1));
  }, [status, viewYear, viewMonth, refresh]);

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

  const saveEvent = () => {
    const title = titleRef.current?.value.trim() || 'New event';
    const date = dateRef.current?.value;
    const time = timeRef.current?.value || '';
    if (date) {
      const [y, m, d] = date.split('-').map(Number);
      addEvent(`${y}-${m - 1}-${d}`, title, time);
    }
    if (titleRef.current) titleRef.current.value = '';
    if (dateRef.current) dateRef.current.value = '';
    if (timeRef.current) timeRef.current.value = '';
    setDialogOpen(false);
  };

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
            {status === 'error' && <span className="tag tag-outline">Google sync error</span>}
            {(status === 'signed-out' || status === 'connecting') && (
              <button className="btn btn-secondary" type="button" onClick={connect} disabled={status === 'connecting'}>
                {status === 'connecting' ? 'Connecting…' : 'Connect Google Calendar'}
              </button>
            )}
            {status === 'signed-in' && (
              <>
                <span className="tag tag-outline">{email ? `Synced with ${email}` : 'Synced with Google'}</span>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={loading}
                  onClick={() => refresh(new Date(viewYear, viewMonth, 1), new Date(viewYear, viewMonth + 1, 1))}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 4v5h-5" /></svg>
                  {loading ? 'Syncing…' : 'Sync now'}
                </button>
                <button className="btn btn-ghost" type="button" onClick={disconnect}>Disconnect</button>
              </>
            )}
            <button className="btn btn-primary" type="button" onClick={() => setDialogOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add event
            </button>
          </div>
        }
      />

      {error && <div className="empty-msg" style={{ color: 'var(--danger, #c0392b)' }}>{error}</div>}

      <Widget>
        <div className="widget-head" style={{ justifyContent: 'flex-start', gap: 'var(--space-3)' }}>
          <button className="btn btn-icon" type="button" onClick={prevMonth}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg></button>
          <h3 style={{ minWidth: 200 }}>{monthLabel}</h3>
          <button className="btn btn-icon" type="button" onClick={nextMonth}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg></button>
          <button className="btn btn-secondary" type="button" onClick={goToday} style={{ marginLeft: 'var(--space-2)' }}>Today</button>
        </div>
        <div className="month-grid">
          {DOW_LABELS.map((d) => <div className="dow" key={d}>{d}</div>)}
          {cells.map((c, i) => (
            <div className={`day-cell${c.cls ? ` ${c.cls}` : ''}`} key={i}>
              {c.inMonth && (
                <>
                  <span className="day-num">{c.num}</span>
                  {c.events.map((ev) => (
                    <span
                      className={`evt-chip${ev.cls ? ` ${ev.cls}` : ''}${ev.locked ? ' locked' : ''}`}
                      key={ev.id}
                      title={ev.locked ? 'Locked — set in stone. Click the lock to unlock.' : 'Click to remove'}
                      onClick={() => !ev.locked && removeEvent(ev.id)}
                      style={{ cursor: ev.locked ? 'default' : 'pointer' }}
                    >
                      {ev.cls === 'google' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="9" height="6" rx="3" /><rect x="10" y="10" width="9" height="6" rx="3" /></svg>}
                      {ev.time} {ev.title}
                      <span
                        className="evt-lock"
                        role="button"
                        tabIndex={0}
                        title={ev.locked ? 'Unlock' : 'Lock in place — set in stone'}
                        onClick={(e) => { e.stopPropagation(); toggleEventLocked(ev.id); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleEventLocked(ev.id); } }}
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
          ))}
        </div>
      </Widget>

      {dialogOpen && (
        <div className="dialog-backdrop" onClick={() => setDialogOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Add event</div>
            <div className="field"><label>Title</label><input className="input" type="text" ref={titleRef} placeholder="Event title" /></div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="field" style={{ flex: 1 }}><label>Date</label><input className="input" type="date" ref={dateRef} /></div>
              <div className="field" style={{ flex: 1 }}><label>Time</label><input className="input" type="time" ref={timeRef} /></div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setDialogOpen(false)}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={saveEvent}>
                {status === 'signed-in' ? 'Save to Google Calendar' : 'Save event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
