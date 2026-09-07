import { useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import './Habits.css';

interface Habit {
  id: number;
  name: string;
  streak: number;
  time: string | null;
  done: boolean;
}

const INITIAL_HABITS: Habit[] = [
  { id: 1, name: 'Workout', streak: 12, time: '8:00 AM', done: true },
  { id: 2, name: 'Read 20 min', streak: 5, time: '7:00 PM', done: false },
  { id: 3, name: 'Drink water', streak: 30, time: null, done: true },
  { id: 4, name: 'Meditate', streak: 0, time: null, done: false },
  { id: 5, name: 'No sugar', streak: 3, time: null, done: true },
];

function hash(a: number, b: number) {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const now = new Date();
const todayLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const DOW_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const weekDays: { label: string }[] = [];
for (let i = 6; i >= 0; i--) {
  const d = new Date(now);
  d.setDate(now.getDate() - i);
  weekDays.push({ label: DOW_LETTERS[d.getDay()] });
}

export function HabitsPage() {
  const [habits, setHabits] = useState(INITIAL_HABITS);
  const [selectedHabitId, setSelectedHabitId] = useState(1);

  const toggleHabit = (id: number) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, done: !h.done } : h)));
  };

  const habitsWithWeek = habits.map((h) => {
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const isToday = i === 0;
      const on = isToday ? h.done : hash(h.id, i * 7 + 3) > 0.3;
      week.push({ on });
    }
    return { ...h, week };
  });

  const doneCount = habits.filter((h) => h.done).length;

  const selected = habits.find((h) => h.id === selectedHabitId) || habits[0];
  const totalDays = 364;
  const heatmapWeeks: { cls: string }[][] = [];
  for (let w = 0; w < 52; w++) {
    const days: { cls: string }[] = [];
    for (let d = 0; d < 7; d++) {
      const dayIndex = w * 7 + d;
      const daysAgo = totalDays - 1 - dayIndex;
      let cls = '';
      if (daysAgo < 0) cls = 'future';
      else if (daysAgo < selected.streak) cls = 'on';
      else cls = hash(selected.id, dayIndex) > 0.42 ? 'on' : '';
      days.push({ cls });
    }
    heatmapWeeks.push(days);
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Consistency"
        title="Habit Tracker"
        actions={
          <button className="btn btn-primary" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Add habit
          </button>
        }
      />

      <Widget>
        <div className="widget-head">
          <h4>Today</h4>
          <span style={{ fontSize: 12 }} className="text-muted">{todayLabel}</span>
        </div>
        {habits.map((h) => (
          <div className="habit-row" key={h.id}>
            <div className={`habit-check${h.done ? ' done' : ''}`} onClick={() => toggleHabit(h.id)}>
              {h.done && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 14 }}>{h.name}</span>
              {h.time && <span style={{ fontSize: 11 }} className="text-muted">Linked to {h.time}</span>}
            </div>
            <span className="streak">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-2-1-3-1-3s2 1 2 4a5 5 0 0 1-10 0c0-5 4-6 4-10z" /></svg>
              {h.streak} day streak
            </span>
          </div>
        ))}
        <div style={{ fontSize: 11 }} className="text-muted">{doneCount}/{habits.length} done today · need 80% to keep every streak alive.</div>
      </Widget>

      <Widget>
        <div className="widget-head"><h4>This week</h4></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="wk-table">
            <thead>
              <tr>
                <th />
                {weekDays.map((d, i) => <th key={i}>{d.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {habitsWithWeek.map((h) => (
                <tr key={h.id}>
                  <td style={{ fontSize: 13 }}>{h.name}</td>
                  {h.week.map((w, i) => (
                    <td key={i}>
                      <span className={`wk-cell${w.on ? ' done' : ''}`}>
                        {w.on && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Widget>

      <Widget>
        <div className="widget-head">
          <h4>Past year</h4>
          <div className="seg">
            {habits.map((h) => (
              <label className="seg-opt" key={h.id}>
                <input type="radio" name="heatmap-habit" checked={h.id === selectedHabitId} onChange={() => setSelectedHabitId(h.id)} />
                {h.name}
              </label>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div className="heat-row">
            {heatmapWeeks.map((wk, wi) => (
              <div className="heat-col" key={wi}>
                {wk.map((d, di) => (
                  <div className={`heat-cell${d.cls ? ` ${d.cls}` : ''}`} key={di} />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }} className="text-muted">
          Less
          <span className="legend-cell" style={{ background: 'var(--color-neutral-200)' }} />
          <span className="legend-cell" style={{ background: 'var(--color-accent-700)' }} />
          More · current streak {selected.streak} days
        </div>
      </Widget>
    </div>
  );
}
