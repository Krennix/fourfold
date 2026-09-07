import { useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import './Home.css';

interface Habit {
  name: string;
  streak: number;
  time: string | null;
  done: boolean;
}

const INITIAL_HABITS: Habit[] = [
  { name: 'Workout', streak: 12, time: '8:00 AM', done: true },
  { name: 'Read 20 min', streak: 5, time: '7:00 PM', done: false },
  { name: 'Drink water', streak: 30, time: null, done: true },
  { name: 'Meditate', streak: 0, time: null, done: false },
];

const EVENTS = [
  { time: '8:00 AM', title: 'Workout', linked: true, google: false },
  { time: '9:30 AM', title: 'Team standup', linked: false, google: true },
  { time: '12:00 PM', title: 'Lunch with Sam', linked: false, google: true },
  { time: '2:00 PM', title: 'Fix production bug', linked: true, google: false },
  { time: '7:00 PM', title: 'Read 20 min', linked: true, google: false },
];

function daysUntilNext(month: number, day: number) {
  const now = new Date();
  let target = new Date(now.getFullYear(), month - 1, day);
  target.setHours(0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (target < today) target = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function daysSince(year: number, month: number, day: number) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const born = new Date(year, month - 1, day);
  return Math.floor((today.getTime() - born.getTime()) / 86400000);
}

const COUNTDOWNS = [
  { name: 'My Birthday', days: daysUntilNext(9, 9), ageLabel: `${daysSince(2012, 9, 9).toLocaleString()} days old` },
  { name: "Elsa's Birthday", days: daysUntilNext(6, 10), ageLabel: `${daysSince(2012, 6, 10).toLocaleString()} days old` },
];

const now = new Date();
const hour = now.getHours();
const dayPart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
const todayLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

export function HomePage() {
  const [habits, setHabits] = useState(INITIAL_HABITS);

  const toggleHabit = (i: number) => {
    setHabits((prev) => prev.map((h, idx) => (idx === i ? { ...h, done: !h.done } : h)));
  };

  const doneCount = habits.filter((h) => h.done).length;
  const pct = Math.round((doneCount / habits.length) * 100);

  return (
    <div className="page">
      <PageHeader
        kicker={todayLabel}
        title={`Good ${dayPart}`}
        actions={
          <button className="btn btn-primary" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2h4" /><path d="M12 14v-4" /><circle cx="12" cy="14" r="8" /></svg>
            Start Pomodoro
          </button>
        }
      />

      <div className="home-grid">
        <div className="home-col">
          <Widget>
            <div className="widget-head">
              <h4>Priority Matrix</h4>
              <a className="btn btn-ghost" style={{ fontSize: 12 }}>
                View full matrix
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
              </a>
            </div>
            <div className="quad-grid">
              <div className="quad">
                <div className="quad-label">Do now · urgent + important</div>
                <div className="task-chip">Submit tax extension</div>
                <div className="task-chip">Fix production bug</div>
              </div>
              <div className="quad">
                <div className="quad-label">Schedule · important</div>
                <div className="task-chip">Plan Q4 roadmap</div>
                <div className="task-chip">Renew passport</div>
              </div>
              <div className="quad">
                <div className="quad-label">Delegate · urgent</div>
                <div className="task-chip">Reply to recruiter emails</div>
              </div>
              <div className="quad">
                <div className="quad-label">Eliminate</div>
                <div className="task-chip">Reorganize bookmarks</div>
              </div>
            </div>
          </Widget>

          <Widget>
            <div className="widget-head">
              <h4>Today's Calendar</h4>
              <span className="tag tag-outline">Synced with Google</span>
            </div>
            <div>
              {EVENTS.map((ev) => (
                <div className="event-row" key={ev.title}>
                  <span className="event-time">{ev.time}</span>
                  <span style={{ fontSize: 14 }}>{ev.title}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {ev.linked && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--color-accent-700)' }}><rect x="3" y="8" width="9" height="6" rx="3" /><rect x="10" y="10" width="9" height="6" rx="3" /></svg>
                    )}
                    {ev.google && <span className="tag tag-neutral">Google</span>}
                  </span>
                </div>
              ))}
            </div>
          </Widget>
        </div>

        <div className="home-col">
          <Widget>
            <div className="widget-head">
              <h4>Today's Habits</h4>
              <span style={{ fontSize: 12 }} className="text-muted">{doneCount}/{habits.length} done · {pct}%</span>
            </div>
            <div>
              {habits.map((h, i) => (
                <div className="habit-row" key={h.name}>
                  <div className={`habit-check${h.done ? ' done' : ''}`} onClick={() => toggleHabit(i)}>
                    {h.done && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 14 }}>{h.name}</span>
                    {h.time && <span style={{ fontSize: 11 }} className="text-muted">Linked to {h.time}</span>}
                  </div>
                  <span className="streak">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-2-1-3-1-3s2 1 2 4a5 5 0 0 1-10 0c0-5 4-6 4-10z" /></svg>
                    {h.streak}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11 }} className="text-muted">Need 80% of habits done to keep a streak day.</div>
          </Widget>

          <Widget>
            <h4>Upcoming Countdowns</h4>
            <div>
              {COUNTDOWNS.map((c) => (
                <div className="cd-item" key={c.name}>
                  <div>
                    <div style={{ fontSize: 14 }}>{c.name}</div>
                    <div style={{ fontSize: 11 }} className="text-muted">{c.ageLabel}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--color-accent-700)' }}>{c.days}</div>
                    <div style={{ fontSize: 11 }} className="text-muted">days</div>
                  </div>
                </div>
              ))}
            </div>
          </Widget>
        </div>
      </div>
    </div>
  );
}
