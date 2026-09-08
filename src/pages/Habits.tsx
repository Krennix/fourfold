import { useEffect, useRef, useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { StreakFire } from '../components/StreakFire';
import { StreakCelebration } from '../components/StreakCelebration';
import { CountdownIcon, COUNTDOWN_TYPE_LABELS } from '../components/CountdownIcon';
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { CountdownDialog } from '../components/CountdownDialog';
import { useHabits } from '../state/HabitsContext';
import { useCountdowns, type Countdown } from '../state/CountdownsContext';
import './Habits.css';
import './Countdowns.css';

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const now = new Date();
const todayLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const DOW_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const weekDays: { label: string; key: string }[] = [];
for (let i = 6; i >= 0; i--) {
  const d = new Date(now);
  d.setDate(now.getDate() - i);
  weekDays.push({ label: DOW_LETTERS[d.getDay()], key: dateKey(d) });
}

function daysUntilNext(month: number, day: number) {
  const now = new Date();
  let target = new Date(now.getFullYear(), month - 1, day);
  target.setHours(0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (target < today) target = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function daysLabel(days: number) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function overallStreak(habits: { history: string[] }[]) {
  if (habits.length === 0) return 0;
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = dateKey(d);
    const doneThatDay = habits.filter((h) => (h.history || []).includes(key)).length;
    if (doneThatDay / habits.length >= 0.8) streak++;
    else break;
  }
  return streak;
}

export function HabitsPage() {
  const { habits, addHabit, removeHabit, toggleHabit, updateHabit } = useHabits();
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [habitsTab, setHabitsTab] = useState<'habits' | 'stats'>('habits');

  const nameRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const quoteRef = useRef<HTMLInputElement>(null);

  const { countdowns, addCountdown, updateCountdown, removeCountdown } = useCountdowns();
  const [cdDialogState, setCdDialogState] = useState<'add' | Countdown | null>(null);
  const [cdMenu, setCdMenu] = useState<{ x: number; y: number; countdown: Countdown } | null>(null);

  const sortedCountdowns = [...countdowns].sort((a, b) => daysUntilNext(a.month, a.day) - daysUntilNext(b.month, b.day));

  const cdMenuItems: ContextMenuItem[] = cdMenu
    ? [
        {
          label: 'Edit countdown',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          ),
          onClick: () => setCdDialogState(cdMenu.countdown),
        },
        {
          label: 'Delete countdown',
          danger: true,
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          ),
          onClick: () => removeCountdown(cdMenu.countdown.id),
        },
      ]
    : [];

  const openAddDialog = () => {
    setEditingHabitId(null);
    setDialogOpen(true);
  };

  const openEditDialog = (id: string) => {
    const h = habits.find((x) => x.id === id);
    if (!h) return;
    setEditingHabitId(id);
    setDialogOpen(true);
    requestAnimationFrame(() => {
      if (nameRef.current) nameRef.current.value = h.name;
      if (timeRef.current) timeRef.current.value = h.time || '';
      if (quoteRef.current) quoteRef.current.value = h.quote || '';
    });
  };

  const saveHabit = () => {
    const name = nameRef.current?.value.trim();
    const time = timeRef.current?.value || null;
    const quote = quoteRef.current?.value.trim() || null;
    if (name) {
      if (editingHabitId) updateHabit(editingHabitId, name, time, quote);
      else addHabit(name, time, quote);
    }
    if (nameRef.current) nameRef.current.value = '';
    if (timeRef.current) timeRef.current.value = '';
    if (quoteRef.current) quoteRef.current.value = '';
    setDialogOpen(false);
    setEditingHabitId(null);
  };

  const habitsWithWeek = habits.map((h) => {
    const history = h.history || [];
    const week = weekDays.map((d) => ({ on: history.includes(d.key) }));
    return { ...h, week };
  });

  const doneCount = habits.filter((h) => h.done).length;

  const lastStreakRef = useRef<number | null>(null);
  const [celebrationStreak, setCelebrationStreak] = useState<number | null>(null);
  useEffect(() => {
    const current = overallStreak(habits);
    if (lastStreakRef.current !== null && current > lastStreakRef.current) {
      setCelebrationStreak(current);
    }
    lastStreakRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits]);

  const selected = habits.find((h) => h.id === selectedHabitId) || habits[0];
  const totalDays = 364;
  const heatmapWeeks: { cls: string }[][] = [];
  if (selected) {
    const history = new Set(selected.history || []);
    for (let w = 0; w < 52; w++) {
      const days: { cls: string }[] = [];
      for (let d = 0; d < 7; d++) {
        const dayIndex = w * 7 + d;
        const daysAgo = totalDays - 1 - dayIndex;
        const dayDate = new Date(now);
        dayDate.setDate(now.getDate() - daysAgo);
        let cls = '';
        if (daysAgo < 0) cls = 'future';
        else if (history.has(dateKey(dayDate))) cls = 'on';
        days.push({ cls });
      }
      heatmapWeeks.push(days);
    }
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Consistency"
        title="Habits & Countdowns"
        actions={
          <>
            <button className="btn btn-primary" type="button" onClick={openAddDialog}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add habit
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setCdDialogState('add')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add countdown
            </button>
          </>
        }
      />

      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        <label className="seg-opt">
          <input type="radio" name="habits-tab" checked={habitsTab === 'habits'} onChange={() => setHabitsTab('habits')} />
          Habits
        </label>
        <label className="seg-opt">
          <input type="radio" name="habits-tab" checked={habitsTab === 'stats'} onChange={() => setHabitsTab('stats')} />
          Stats
        </label>
      </div>

      {habitsTab === 'habits' && (
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
              <div
                style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, cursor: 'pointer' }}
                onClick={() => openEditDialog(h.id)}
              >
                <span style={{ fontSize: 14 }}>{h.name}</span>
                {h.quote && <span className="habit-quote">"{h.quote}"</span>}
                {h.time && <span style={{ fontSize: 11 }} className="text-muted">Linked to {h.time}</span>}
              </div>
              <StreakFire streak={h.streak} done={h.done} />
              <button className="btn btn-icon" type="button" onClick={() => removeHabit(h.id)} aria-label={`Remove ${h.name}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          {habits.length > 0 && (
            <div style={{ fontSize: 11 }} className="text-muted">{doneCount}/{habits.length} done today · need 80% to keep every streak alive.</div>
          )}
        </Widget>
      )}

      {habitsTab === 'stats' && habits.length > 0 && (
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

      {habitsTab === 'stats' && selected && (
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

      <Widget>
        <div className="widget-head">
          <h4>Countdowns</h4>
        </div>
        {sortedCountdowns.length === 0 && (
          <div className="cd-empty">
            <CountdownIcon type="birthday" className="cd-empty-icon" />
            <div>No countdowns yet — add one to start tracking.</div>
          </div>
        )}
        {sortedCountdowns.length > 0 && (
          <div className="cd-grid">
            {sortedCountdowns.map((c) => {
              const days = daysUntilNext(c.month, c.day);
              return (
                <div
                  className="cd-card"
                  key={c.id}
                  onClick={() => setCdDialogState(c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCdMenu({ x: e.clientX, y: e.clientY, countdown: c });
                  }}
                >
                  <div className="cd-card-top">
                    <div className={`cd-card-icon cd-icon-${c.type}`}>
                      <CountdownIcon type={c.type} />
                    </div>
                    <span className="tag tag-neutral">{COUNTDOWN_TYPE_LABELS[c.type]}</span>
                  </div>
                  <div className="cd-card-name">{c.name}</div>
                  <div className="cd-card-date text-muted">{MONTH_NAMES[c.month - 1]} {c.day}</div>
                  <div className="cd-card-count">
                    <div className="cd-card-days">{days === 0 || days === 1 ? '' : days}</div>
                    <div className="cd-card-days-label">{daysLabel(days)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Widget>

      {celebrationStreak !== null && (
        <StreakCelebration streak={celebrationStreak} onClose={() => setCelebrationStreak(null)} />
      )}

      {cdMenu && <ContextMenu x={cdMenu.x} y={cdMenu.y} items={cdMenuItems} onClose={() => setCdMenu(null)} />}

      {cdDialogState && (
        <CountdownDialog
          countdown={cdDialogState === 'add' ? null : cdDialogState}
          onClose={() => setCdDialogState(null)}
          onSave={(name, month, day, type) => {
            if (cdDialogState === 'add') addCountdown(name, month, day, type);
            else updateCountdown(cdDialogState.id, name, month, day, type);
          }}
        />
      )}

      {dialogOpen && (
        <div className="dialog-backdrop" onClick={() => { setDialogOpen(false); setEditingHabitId(null); }}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{editingHabitId ? 'Edit habit' : 'Add habit'}</div>
            <div className="field"><label>Name</label><input className="input" type="text" ref={nameRef} placeholder="Habit name" /></div>
            <div className="field"><label>Motivational quote (optional)</label><input className="input" type="text" ref={quoteRef} placeholder="e.g. Small steps every day" /></div>
            <div className="field"><label>Linked time (optional)</label><input className="input" type="time" ref={timeRef} /></div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => { setDialogOpen(false); setEditingHabitId(null); }}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={saveHabit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
