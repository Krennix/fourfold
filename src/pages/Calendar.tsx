import { useRef, useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import './Calendar.css';

interface CalEvent {
  time: string;
  title: string;
  linked: boolean;
  cls: '' | 'google';
}

interface ExtraEvent {
  date: string;
  title: string;
  time: string;
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarPage() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [extraEvents, setExtraEvents] = useState<ExtraEvent[]>([]);

  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLSelectElement>(null);

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
    const title = titleRef.current?.value || 'New event';
    const date = dateRef.current?.value;
    const time = timeRef.current?.value || '';
    if (date) {
      setExtraEvents((prev) => [...prev, { date, title, time }]);
    }
    setDialogOpen(false);
  };

  const year = viewYear;
  const month = viewMonth;
  const realY = now.getFullYear();
  const realM = now.getMonth();
  const realD = now.getDate();
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const baseEvents: Record<string, CalEvent[]> = {
    [`${realY}-${realM}-${realD}`]: [
      { time: '8:00', title: 'Workout', linked: true, cls: '' },
      { time: '9:30', title: 'Team standup', linked: false, cls: 'google' },
      { time: '12:00', title: 'Lunch w/ Sam', linked: false, cls: 'google' },
      { time: '14:00', title: 'Fix prod bug', linked: true, cls: '' },
      { time: '19:00', title: 'Read 20 min', linked: true, cls: '' },
    ],
    [`${realY}-${realM}-${realD + 2}`]: [{ time: '10:00', title: 'Plan Q4 roadmap', linked: true, cls: '' }],
    [`${realY}-${realM}-${Math.max(1, realD - 3)}`]: [{ time: '15:00', title: 'Dentist', linked: false, cls: 'google' }],
  };

  extraEvents.forEach((ev) => {
    const [y, m, d] = ev.date.split('-').map(Number);
    const key = `${y}-${m - 1}-${d}`;
    if (!baseEvents[key]) baseEvents[key] = [];
    baseEvents[key].push({ time: ev.time, title: ev.title, linked: false, cls: '' });
  });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { inMonth: boolean; cls: string; num: number | ''; events: CalEvent[] }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ inMonth: false, cls: 'blank', num: '', events: [] });
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = year === realY && month === realM && d === realD;
    const key = `${year}-${month}-${d}`;
    cells.push({ inMonth: true, cls: isToday ? 'today' : '', num: d, events: baseEvents[key] || [] });
  }
  while (cells.length % 7 !== 0) cells.push({ inMonth: false, cls: 'blank', num: '', events: [] });

  return (
    <div className="page">
      <PageHeader
        kicker="Schedule"
        title="Calendar"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span className="tag tag-outline">Synced with Google</span>
            <button className="btn btn-secondary" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 4v5h-5" /></svg>
              Sync now
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setDialogOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add event
            </button>
          </div>
        }
      />

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
                  {c.events.map((ev, ei) => (
                    <span className={`evt-chip${ev.cls ? ` ${ev.cls}` : ''}`} key={ei}>
                      {ev.linked && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="9" height="6" rx="3" /><rect x="10" y="10" width="9" height="6" rx="3" /></svg>}
                      {ev.time} {ev.title}
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
            <div className="field">
              <label>Link to</label>
              <select className="input" ref={linkRef}>
                <option value="">No link</option>
                <option value="task">Eisenhower task&hellip;</option>
                <option value="habit">Habit&hellip;</option>
              </select>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setDialogOpen(false)}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={saveEvent}>Save to Google Calendar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
