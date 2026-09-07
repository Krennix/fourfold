import { useRef, useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useHabits } from '../state/HabitsContext';
import './Habits.css';

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
  const { habits, addHabit, removeHabit, toggleHabit } = useHabits();
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  const saveHabit = () => {
    const name = nameRef.current?.value.trim();
    if (name) addHabit(name, timeRef.current?.value || null);
    if (nameRef.current) nameRef.current.value = '';
    if (timeRef.current) timeRef.current.value = '';
    setDialogOpen(false);
  };

  const idHash = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return Math.abs(h);
  };

  const habitsWithWeek = habits.map((h) => {
    const week = [];
    const n = idHash(h.id);
    for (let i = 6; i >= 0; i--) {
      const isToday = i === 0;
      const on = isToday ? h.done : hash(n, i * 7 + 3) > 0.3;
      week.push({ on });
    }
    return { ...h, week };
  });

  const doneCount = habits.filter((h) => h.done).length;

  const selected = habits.find((h) => h.id === selectedHabitId) || habits[0];
  const totalDays = 364;
  const heatmapWeeks: { cls: string }[][] = [];
  if (selected) {
    const n = idHash(selected.id);
    for (let w = 0; w < 52; w++) {
      const days: { cls: string }[] = [];
      for (let d = 0; d < 7; d++) {
        const dayIndex = w * 7 + d;
        const daysAgo = totalDays - 1 - dayIndex;
        let cls = '';
        if (daysAgo < 0) cls = 'future';
        else if (daysAgo < selected.streak) cls = 'on';
        else cls = hash(n, dayIndex) > 0.42 ? 'on' : '';
        days.push({ cls });
      }
      heatmapWeeks.push(days);
    }
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Consistency"
        title="Habit Tracker"
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setDialogOpen(true)}>
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
        {habits.length === 0 && <div className="empty-msg">No habits yet — add one to start tracking.</div>}
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
            <button className="btn btn-icon" type="button" onClick={() => removeHabit(h.id)} aria-label={`Remove ${h.name}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        {habits.length > 0 && (
          <div style={{ fontSize: 11 }} className="text-muted">{doneCount}/{habits.length} done today · need 80% to keep every streak alive.</div>
        )}
      </Widget>

      {habits.length > 0 && (
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
      )}

      {selected && (
        <Widget>
          <div className="widget-head">
            <h4>Past year</h4>
            <div className="seg">
              {habits.map((h) => (
                <label className="seg-opt" key={h.id}>
                  <input type="radio" name="heatmap-habit" checked={h.id === selected.id} onChange={() => setSelectedHabitId(h.id)} />
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
      )}

      {dialogOpen && (
        <div className="dialog-backdrop" onClick={() => setDialogOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Add habit</div>
            <div className="field"><label>Name</label><input className="input" type="text" ref={nameRef} placeholder="Habit name" /></div>
            <div className="field"><label>Linked time (optional)</label><input className="input" type="time" ref={timeRef} /></div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setDialogOpen(false)}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={saveHabit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
