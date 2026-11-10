import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Widget } from '../components/Widget';
import { StreakFire } from '../components/StreakFire';
import { CountdownIcon, CountdownLinkBadge } from '../components/CountdownIcon';
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { CountdownDialog } from '../components/CountdownDialog';
import { TaskRow, Checkbox } from '../components/TaskRow';
import { Icon } from '../components/Icon';
import { useHabits } from '../state/HabitsContext';
import { useMatrix, type QuadKey, type Task } from '../state/MatrixContext';
import { useSchool } from '../state/SchoolContext';
import { useCalendarEvents, type CalEvent } from '../state/CalendarContext';
import { useCountdowns, type Countdown } from '../state/CountdownsContext';
import { useFriends } from '../state/FriendsContext';
import { linkedFriendNames } from '../lib/friendLinks';
import { usePomodoro, POMODORO_MODES, POMODORO_MODE_LABELS } from '../state/PomodoroContext';
import { useAgent } from '../state/AgentContext';
import { useUI } from '../state/UIContext';
import { useAuth } from '../state/AuthContext';
import { useQuadrantHomework, type HomeworkTaskRow } from '../lib/useQuadrantHomework';
import { parseQuickAdd } from '../lib/quickAdd';
import { daysUntil } from '../lib/due';
import './Home.css';
import './Countdowns.css';

const QUAD_NAMES: Record<QuadKey, string> = { q1: 'Do first', q2: 'Schedule', q3: 'Delegate', q4: 'Eliminate' };

function daysUntilNext(month: number, day: number) {
  const now = new Date();
  let target = new Date(now.getFullYear(), month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (target < today) target = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** "HH:MM" / "h:mm AM" → minutes since midnight, or null for all-day/unknown. */
function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (ampm) return ((Number(ampm[1]) % 12) + (ampm[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(ampm[2]);
  const h24 = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (h24) return Number(h24[1]) * 60 + Number(h24[2]);
  return null;
}

function fmtMinutes(min: number) {
  const d = new Date(2000, 0, 1, Math.floor(min / 60), min % 60);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

type FocusItem =
  | { kind: 'task'; quad: QuadKey; task: Task; rank: number }
  | { kind: 'hw'; quad: QuadKey; task: HomeworkTaskRow; rank: number };

interface AgendaItem {
  key: string;
  start: number | null;
  end: number | null;
  title: string;
  kind: 'event' | 'task';
  color?: string;
  allDay?: boolean;
}

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

function ProgressRing({ value, size = 44, stroke = 5, color = 'var(--color-accent)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-neutral-200)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: 'stroke-dashoffset 0.5s var(--ease-out)' }}
        />
      </svg>
      {children && <div className="ring-label">{children}</div>}
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const now = useNow();
  const { email } = useAuth();
  const { habits, toggleHabit } = useHabits();
  const { tasks, toggleDone } = useMatrix();
  const { toggleHomework, toggleSchoologyHomeworkDone } = useSchool();
  const homeworkRows = useQuadrantHomework();
  const { eventsByDate } = useCalendarEvents();
  const { countdowns, updateCountdown, removeCountdown } = useCountdowns();
  const { friends } = useFriends();
  const pomodoro = usePomodoro();
  const { quickAddTask, openCountdownDialog, toast, openPalette } = useUI();
  const { watchdogFlags, checkWatchdog, dismissFlag, dailyPlan, isPlanning, planError, generateDailyPlan, isThinking, sendChatMessage } = useAgent();
  const [cdDialog, setCdDialog] = useState<Countdown | null>(null);
  const [cdMenu, setCdMenu] = useState<{ x: number; y: number; countdown: Countdown } | null>(null);
  const [assistantInput, setAssistantInput] = useState('');
  const [quickText, setQuickText] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void checkWatchdog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hour = now.getHours();
  const dayPart = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = email ? email.split('@')[0].split(/[._-]/)[0] : '';
  const name = firstName ? firstName[0].toUpperCase() + firstName.slice(1) : '';
  const todayLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // ── habits ────────────────────────────────────────────────────────────
  const doneHabits = habits.filter((h) => h.done).length;
  const habitPct = habits.length ? doneHabits / habits.length : 0;

  // ── tasks ─────────────────────────────────────────────────────────────
  const quads: QuadKey[] = ['q1', 'q2', 'q3', 'q4'];
  const openTasks = quads.flatMap((q) => tasks[q].filter((t) => !t.done));
  const overdue = openTasks.filter((t) => t.dueDate && (daysUntil(t.dueDate) ?? 0) < 0).length;
  const dueToday = openTasks.filter((t) => t.dueDate && daysUntil(t.dueDate) === 0).length;

  const focusList = useMemo<FocusItem[]>(() => {
    const out: FocusItem[] = [];
    const rankFor = (quad: QuadKey, due: string | null) => {
      const d = due ? daysUntil(due) : null;
      if (d !== null && d < 0) return 0 + d / 1000;
      if (d === 0) return 1;
      if (quad === 'q1') return 2 + (d ?? 50) / 100;
      if (d === 1) return 3;
      if (d !== null && d <= 3) return 4 + d / 10;
      return 99;
    };
    for (const q of quads) {
      for (const t of tasks[q]) if (!t.done) out.push({ kind: 'task', quad: q, task: t, rank: rankFor(q, t.dueDate) });
      for (const t of homeworkRows[q]) if (!t.done) out.push({ kind: 'hw', quad: q, task: t, rank: rankFor(q, t.dueDate) });
    }
    const urgent = out.filter((i) => i.rank < 99).sort((a, b) => a.rank - b.rank);
    // Pad with Schedule-quadrant work so the list is never empty when there's anything to do.
    const filler = out.filter((i) => i.rank >= 99 && i.quad === 'q2').slice(0, Math.max(0, 3 - urgent.length));
    return [...urgent, ...filler].slice(0, 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, homeworkRows]);

  const toggleFocus = (item: FocusItem) => {
    if (item.kind === 'task') {
      toggleDone(item.quad, item.task.id);
      if (!item.task.done) toast({ message: `Completed “${item.task.title}”`, tone: 'success', action: { label: 'Undo', onClick: () => toggleDone(item.quad, item.task.id) } });
    } else if (item.task.hwId !== undefined && item.task.classId) toggleHomework(item.task.classId, item.task.hwId);
    else toggleSchoologyHomeworkDone(item.task.uid!);
  };

  // ── agenda ────────────────────────────────────────────────────────────
  const todaysEvents = eventsByDate(todayKey);
  const agenda = useMemo<AgendaItem[]>(() => {
    const items: AgendaItem[] = todaysEvents.map((ev: CalEvent) => {
      const start = ev.allDay || ev.time === 'All day' ? null : timeToMinutes(ev.time);
      return {
        key: `ev-${ev.id}-${ev.calendarId ?? ''}`,
        start,
        end: start !== null ? start + (ev.durationMin ?? 60) : null,
        title: ev.title,
        kind: 'event',
        color: ev.color || ev.calendarColor,
        allDay: start === null,
      };
    });
    const linkedEventIds = new Set(todaysEvents.map((e) => e.id));
    for (const q of quads) {
      for (const t of tasks[q]) {
        if (t.done || !t.time) continue;
        if (t.link?.type === 'event' && linkedEventIds.has(t.link.id)) continue; // already shown as its event
        if (t.dueDate && daysUntil(t.dueDate) !== 0) continue;
        const start = timeToMinutes(t.time);
        items.push({ key: `task-${t.id}`, start, end: start !== null ? start + (t.durationMin ?? 30) : null, title: t.title, kind: 'task', color: `var(--${q})` });
      }
    }
    return items.sort((a, b) => (a.start ?? -1) - (b.start ?? -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaysEvents, tasks]);
  const nextUp = agenda.find((a) => a.start !== null && (a.end ?? a.start) > nowMin);
  const timed = agenda.filter((a) => !a.allDay);
  const nowIndex = timed.findIndex((a) => (a.start ?? 0) > nowMin);

  // ── pomodoro ──────────────────────────────────────────────────────────
  const pomoMm = Math.floor(pomodoro.secondsLeft / 60);
  const pomoSs = String(pomodoro.secondsLeft % 60).padStart(2, '0');
  const pomoFrac = 1 - pomodoro.secondsLeft / POMODORO_MODES[pomodoro.mode];
  const pomoFresh = !pomodoro.isRunning && pomodoro.secondsLeft === POMODORO_MODES[pomodoro.mode];

  // ── countdowns ────────────────────────────────────────────────────────
  const upcomingCountdowns = [...countdowns].sort((a, b) => daysUntilNext(a.month, a.day) - daysUntilNext(b.month, b.day)).slice(0, 4);
  const cdMenuItems: ContextMenuItem[] = cdMenu
    ? [
        { label: 'Edit countdown', icon: <Icon name="edit" />, onClick: () => setCdDialog(cdMenu.countdown) },
        { label: 'Delete countdown', danger: true, icon: <Icon name="trash" />, onClick: () => removeCountdown(cdMenu.countdown.id) },
      ]
    : [];

  // ── summary sentence ─────────────────────────────────────────────────
  const remainingEvents = agenda.filter((a) => a.kind === 'event' && (a.allDay || (a.end ?? 0) > nowMin)).length;
  const summaryBits: string[] = [];
  if (overdue) summaryBits.push(`${overdue} overdue`);
  if (dueToday) summaryBits.push(`${dueToday} due today`);
  if (remainingEvents) summaryBits.push(`${remainingEvents} event${remainingEvents === 1 ? '' : 's'} left`);
  if (habits.length && doneHabits < habits.length) summaryBits.push(`${habits.length - doneHabits} habit${habits.length - doneHabits === 1 ? '' : 's'} to go`);
  const summary = summaryBits.length ? `You have ${summaryBits.join(', ')}.` : openTasks.length ? 'Nothing urgent — a good day to get ahead.' : 'All clear. Add something to get started.';

  const parsedQuick = quickText.trim() ? parseQuickAdd(quickText) : null;

  return (
    <div className="page home">
      <section className="home-hero">
        <div className="home-hero-text">
          <h6>{todayLabel}</h6>
          <h1>{dayPart}{name ? `, ${name}` : ''}</h1>
          <p className="home-summary">{summary}</p>
        </div>
        <form
          className="home-quickadd"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!quickText.trim() || adding) return;
            setAdding(true);
            try {
              await quickAddTask(quickText);
              setQuickText('');
            } finally {
              setAdding(false);
            }
          }}
        >
          <Icon name="plus" />
          <input
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder="Add a task — “Essay tomorrow 3pm 45m !1”"
            aria-label="Quick-add a task"
          />
          {parsedQuick && (
            <span className="home-quickadd-chips">
              {parsedQuick.chips.map((c) => (
                <span className="tag tag-accent" key={c.kind}>{c.label}</span>
              ))}
            </span>
          )}
          <button className="btn btn-primary btn-sm" type="submit" disabled={!parsedQuick?.title || adding}>
            Add
          </button>
        </form>
      </section>

      <section className="stat-row" aria-label="Today at a glance">
        <Link to="/matrix" className="stat">
          <span className="stat-icon" style={{ '--sc': 'var(--q2)' } as React.CSSProperties}><Icon name="check-circle" /></span>
          <span className="stat-body">
            <span className="stat-value">{openTasks.length}</span>
            <span className="stat-label">open tasks</span>
          </span>
          {overdue > 0 ? <span className="stat-badge danger">{overdue} overdue</span> : dueToday > 0 ? <span className="stat-badge warn">{dueToday} today</span> : null}
        </Link>
        <Link to="/habits" className="stat">
          <ProgressRing value={habitPct} size={40} stroke={4.5} color="var(--color-success)">
            <Icon name="fire" />
          </ProgressRing>
          <span className="stat-body">
            <span className="stat-value">{doneHabits}<span className="stat-of">/{habits.length}</span></span>
            <span className="stat-label">habits today</span>
          </span>
        </Link>
        <Link to="/pomodoro" className="stat">
          <span className="stat-icon" style={{ '--sc': 'var(--color-accent-2)' } as React.CSSProperties}><Icon name="timer" /></span>
          <span className="stat-body">
            <span className="stat-value">{pomodoro.todaySessions}</span>
            <span className="stat-label">focus sessions · {pomodoro.todaySessions * 25}m</span>
          </span>
        </Link>
        <Link to="/calendar" className="stat">
          <span className="stat-icon" style={{ '--sc': 'var(--q3)' } as React.CSSProperties}><Icon name="calendar" /></span>
          <span className="stat-body" style={{ minWidth: 0 }}>
            <span className="stat-value stat-value-text">{nextUp ? nextUp.title : 'Free'}</span>
            <span className="stat-label">{nextUp ? (nextUp.start! <= nowMin ? 'happening now' : `next at ${fmtMinutes(nextUp.start!)}`) : 'nothing else scheduled today'}</span>
          </span>
        </Link>
      </section>

      <div className="home-grid">
        <div className="home-col">
          <Widget>
            <div className="widget-head">
              <h4>Focus list {focusList.length > 0 && <span className="widget-count">{focusList.length}</span>}</h4>
              <Link className="widget-link" to="/matrix">Matrix <Icon name="chevron-right" /></Link>
            </div>
            {focusList.length === 0 ? (
              <div className="empty-state">
                <Icon name="check-circle" />
                <strong>Nothing urgent</strong>
                <span>Overdue, due-soon and “Do first” tasks will show up here.</span>
              </div>
            ) : (
              <div className="focus-list">
                {focusList.map((item) => (
                  <TaskRow
                    key={`${item.kind}-${item.task.id}`}
                    task={{ ...item.task, source: item.kind === 'hw' ? 'homework' : 'matrix' }}
                    color={`var(--${item.quad})`}
                    onToggle={() => toggleFocus(item)}
                    extraMeta={<span className="tquad" style={{ color: `var(--${item.quad})` }}>{QUAD_NAMES[item.quad]}</span>}
                  />
                ))}
              </div>
            )}
          </Widget>

          <Widget>
            <div className="widget-head">
              <h4>Today’s schedule</h4>
              <Link className="widget-link" to="/calendar">Calendar <Icon name="chevron-right" /></Link>
            </div>
            {agenda.length === 0 ? (
              <div className="empty-state">
                <Icon name="calendar" />
                <strong>Open day</strong>
                <span>No events today. Tasks with a time estimate get booked into free slots automatically.</span>
              </div>
            ) : (
              <div className="agenda">
                {agenda.filter((a) => a.allDay).map((a) => (
                  <div className="agenda-allday" key={a.key} style={{ '--ac': a.color || 'var(--color-allday)' } as React.CSSProperties}>
                    All day · {a.title}
                  </div>
                ))}
                {timed.map((a, i) => {
                  const past = (a.end ?? a.start ?? 0) <= nowMin;
                  const current = (a.start ?? 0) <= nowMin && !past;
                  return (
                    <div key={a.key}>
                      {i === nowIndex && <div className="agenda-now"><span>{fmtMinutes(nowMin)}</span></div>}
                      <div className={`agenda-item${past ? ' past' : ''}${current ? ' current' : ''}`} style={{ '--ac': a.color || 'var(--color-accent)' } as React.CSSProperties}>
                        <span className="agenda-time">{a.start !== null ? fmtMinutes(a.start) : ''}</span>
                        <span className="agenda-bar" />
                        <span className="agenda-body">
                          <span className="agenda-title">{a.title}</span>
                          <span className="agenda-meta">
                            {a.kind === 'task' ? 'Task' : 'Event'}
                            {a.start !== null && a.end !== null && ` · ${fmtMinutes(a.start)} – ${fmtMinutes(a.end)}`}
                            {current && <span className="agenda-live">Now</span>}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
                {nowIndex === -1 && timed.length > 0 && <div className="agenda-now"><span>{fmtMinutes(nowMin)}</span></div>}
              </div>
            )}
          </Widget>
        </div>

        <div className="home-col">
          <Widget className="pomo-card">
            <div className="widget-head">
              <h4>Focus timer</h4>
              <Link className="widget-link" to="/pomodoro">Open <Icon name="chevron-right" /></Link>
            </div>
            <div className="pomo-row">
              <ProgressRing value={pomoFrac} size={92} stroke={7} color={pomodoro.mode === 'focus' ? 'var(--color-accent)' : 'var(--color-success)'}>
                <span className="pomo-time">{pomoMm}:{pomoSs}</span>
              </ProgressRing>
              <div className="pomo-side">
                <span className="pomo-mode">{POMODORO_MODE_LABELS[pomodoro.mode]}{pomodoro.isRunning && <span className="agenda-live">Running</span>}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    className={`btn ${pomodoro.isRunning ? 'btn-secondary' : 'btn-primary'}`}
                    type="button"
                    onClick={pomoFresh ? pomodoro.start : pomodoro.toggleRun}
                  >
                    <Icon name={pomodoro.isRunning ? 'pause' : 'play'} />
                    {pomodoro.isRunning ? 'Pause' : pomoFresh ? 'Start focus' : 'Resume'}
                  </button>
                  {!pomoFresh && (
                    <button className="btn btn-icon" type="button" onClick={pomodoro.reset} aria-label="Reset timer" title="Reset">
                      <Icon name="refresh" />
                    </button>
                  )}
                </div>
                <span className="text-muted" style={{ fontSize: 12 }}>Press <kbd>F</kbd> anywhere to start or pause.</span>
              </div>
            </div>
          </Widget>

          <Widget>
            <div className="widget-head">
              <h4>Habits</h4>
              <Link className="widget-link" to="/habits">All habits <Icon name="chevron-right" /></Link>
            </div>
            {habits.length === 0 ? (
              <div className="empty-state">
                <Icon name="fire" />
                <strong>No habits yet</strong>
                <span><Link to="/habits">Add a habit</Link> to start a streak.</span>
              </div>
            ) : (
              <>
                <div className="habit-progress" aria-label={`${doneHabits} of ${habits.length} habits done`}>
                  <div className="habit-progress-bar" style={{ width: `${habitPct * 100}%` }} />
                </div>
                <div className="habit-list">
                  {habits.map((h) => (
                    <div className={`habit-item${h.done ? ' done' : ''}`} key={h.id} onClick={() => toggleHabit(h.id)}>
                      <Checkbox checked={h.done} onToggle={() => toggleHabit(h.id)} label={h.done ? `Undo ${h.name}` : `Check off ${h.name}`} color="var(--color-success)" />
                      <div className="habit-item-main">
                        <span className="habit-name">{h.name}</span>
                        {(h.quote || h.time) && <span className="habit-sub">{h.time ? `at ${h.time}` : ''}{h.time && h.quote ? ' · ' : ''}{h.quote ? `“${h.quote}”` : ''}</span>}
                      </div>
                      <StreakFire streak={h.streak} done={h.done} />
                    </div>
                  ))}
                </div>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {habitPct >= 0.8 ? 'Streak day secured — nice work.' : `Check off ${Math.max(0, Math.ceil(habits.length * 0.8) - doneHabits)} more to keep your streak (80%).`}
                </span>
              </>
            )}
          </Widget>

          <Widget className="assistant-card">
            <div className="widget-head">
              <h4><span className="ai-badge"><Icon name="sparkles" /></span>Assistant</h4>
              <Link className="widget-link" to="/agent">Open <Icon name="chevron-right" /></Link>
            </div>
            {watchdogFlags.length > 0 && (
              <div className="flag-list">
                {watchdogFlags.map((f) => (
                  <div key={`${f.title}-${f.detail}`} className={`flag flag-${f.severity}`}>
                    <Icon name="alert" />
                    <span className="flag-text"><strong>{f.title}</strong> <span>{f.detail}</span></span>
                    <button className="btn btn-icon" type="button" aria-label="Dismiss" onClick={() => dismissFlag(f)}>
                      <Icon name="x" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {dailyPlan ? (
                <Link className="btn btn-secondary" to="/agent">
                  <Icon name="calendar" />
                  Review today’s plan ({dailyPlan.length})
                </Link>
              ) : (
                <button className="btn btn-secondary" type="button" onClick={() => void generateDailyPlan()} disabled={isPlanning}>
                  <Icon name="sparkles" />
                  {isPlanning ? 'Planning…' : 'Plan my day'}
                </button>
              )}
            </div>
            {planError && <div className="text-muted" style={{ fontSize: 12.5, color: 'var(--color-danger)' }}>{planError}</div>}
            <form
              className="assistant-ask"
              onSubmit={(e) => {
                e.preventDefault();
                const text = assistantInput.trim();
                if (!text || isThinking) return;
                setAssistantInput('');
                void sendChatMessage(text);
                navigate('/agent');
              }}
            >
              <input className="input" placeholder="Ask anything — “When can I study for chem?”" value={assistantInput} onChange={(e) => setAssistantInput(e.target.value)} />
              <button className="btn btn-primary btn-icon" type="submit" disabled={isThinking || !assistantInput.trim()} aria-label="Send">
                <Icon name="arrow-right" />
              </button>
            </form>
          </Widget>

          <Widget>
            <div className="widget-head">
              <h4>Countdowns</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Link className="widget-link" to="/habits">All <Icon name="chevron-right" /></Link>
                <button className="btn btn-icon" type="button" onClick={openCountdownDialog} aria-label="Add countdown" title="Add countdown">
                  <Icon name="plus" />
                </button>
              </div>
            </div>
            {upcomingCountdowns.length === 0 ? (
              <div className="empty-state">
                <Icon name="flag" />
                <strong>Nothing to count down to</strong>
                <span>Track birthdays, deadlines and holidays.</span>
              </div>
            ) : (
              <div>
                {upcomingCountdowns.map((c) => {
                  const linkedTo = linkedFriendNames(c, friends);
                  const days = daysUntilNext(c.month, c.day);
                  return (
                    <div
                      className="cd-item"
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setCdDialog(c)}
                      onKeyDown={(e) => e.key === 'Enter' && setCdDialog(c)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setCdMenu({ x: e.clientX, y: e.clientY, countdown: c });
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div className={`cd-item-icon cd-icon-${c.type}`}>
                          <CountdownIcon type={c.type} />
                          {linkedTo.length > 0 && (
                            <span className="cd-link-badge" title={`Linked to ${linkedTo.join(', ')}`}>
                              <CountdownLinkBadge />
                            </span>
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="cd-item-name">{c.name}</div>
                          <div className="cd-item-date">{new Date(2000, c.month - 1, c.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                        </div>
                      </div>
                      <div className={`cd-days${days <= 7 ? ' soon' : ''}`}>
                        {days === 0 ? 'Today' : <>{days}<span>d</span></>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Widget>
        </div>
      </div>

      <button type="button" className="home-shortcut-hint" onClick={() => openPalette()}>
        <Icon name="keyboard" /> Press <kbd>Ctrl/⌘</kbd><kbd>K</kbd> to search anything, or <kbd>?</kbd> for shortcuts
      </button>

      {cdMenu && <ContextMenu x={cdMenu.x} y={cdMenu.y} items={cdMenuItems} onClose={() => setCdMenu(null)} />}

      {cdDialog && (
        <CountdownDialog
          countdown={cdDialog}
          onClose={() => setCdDialog(null)}
          onSave={(name, month, day, type) => updateCountdown(cdDialog.id, name, month, day, type)}
          onDelete={() => removeCountdown(cdDialog.id)}
        />
      )}
    </div>
  );
}
