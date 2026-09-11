import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Widget, PageHeader } from '../components/Widget';
import { StreakFire } from '../components/StreakFire';
import { CountdownIcon } from '../components/CountdownIcon';
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { CountdownDialog } from '../components/CountdownDialog';
import { TaskDialog } from '../components/TaskDialog';
import { useAutoSchedule } from '../lib/useAutoSchedule';
import { useHabits } from '../state/HabitsContext';
import { useMatrix, type QuadKey } from '../state/MatrixContext';
import { useCalendarEvents } from '../state/CalendarContext';
import { useCountdowns, type Countdown } from '../state/CountdownsContext';
import { usePomodoro, POMODORO_MODES, POMODORO_MODE_LABELS } from '../state/PomodoroContext';
import { useAgent } from '../state/AgentContext';
import { useQuadrantHomework } from '../lib/useQuadrantHomework';
import './Home.css';
import './Countdowns.css';

const QUAD_LABELS: Record<QuadKey, string> = {
  q1: 'Do now · urgent + important',
  q2: 'Schedule · important',
  q3: 'Delegate · urgent',
  q4: 'Eliminate',
};

function daysUntilNext(month: number, day: number) {
  const now = new Date();
  let target = new Date(now.getFullYear(), month - 1, day);
  target.setHours(0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (target < today) target = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

const now = new Date();
const hour = now.getHours();
const dayPart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
const todayLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

export function HomePage() {
  const { habits, toggleHabit } = useHabits();
  const { tasks, addTask } = useMatrix();
  const homeworkRows = useQuadrantHomework();
  const { eventsByDate } = useCalendarEvents();
  const autoSchedule = useAutoSchedule();
  const { countdowns, addCountdown, updateCountdown, removeCountdown } = useCountdowns();
  const { mode: pomoMode, secondsLeft: pomoSecondsLeft, isRunning: pomoRunning, start: startPomodoro, toggleRun: togglePomodoro } = usePomodoro();
  const [cdDialogState, setCdDialogState] = useState<'add' | Countdown | null>(null);
  const [cdMenu, setCdMenu] = useState<{ x: number; y: number; countdown: Countdown } | null>(null);
  const [taskDialogQuad, setTaskDialogQuad] = useState<QuadKey | null>(null);
  const [assistantInput, setAssistantInput] = useState('');
  const { watchdogFlags, checkWatchdog, dismissFlag, dailyPlan, isPlanning, generateDailyPlan, isThinking, sendChatMessage } = useAgent();

  useEffect(() => {
    void checkWatchdog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doneCount = habits.filter((h) => h.done).length;
  const pct = habits.length ? Math.round((doneCount / habits.length) * 100) : 0;
  const todaysEvents = eventsByDate(todayKey);

  const pomoMm = Math.floor(pomoSecondsLeft / 60);
  const pomoSs = pomoSecondsLeft % 60;
  const pomoTimeLabel = `${pomoMm}:${pomoSs < 10 ? '0' : ''}${pomoSs}`;
  const pomoFrac = pomoSecondsLeft / POMODORO_MODES[pomoMode];
  const pomoCircumference = 2 * Math.PI * 36;

  const upcomingCountdowns = [...countdowns]
    .sort((a, b) => daysUntilNext(a.month, a.day) - daysUntilNext(b.month, b.day))
    .slice(0, 4);

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

  return (
    <div className="page">
      <PageHeader
        kicker={todayLabel}
        title={`Good ${dayPart}`}
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-secondary" type="button" onClick={() => setTaskDialogQuad('q2')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              New Task
            </button>
            <button className="btn btn-primary" type="button" onClick={startPomodoro}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2h4" /><path d="M12 14v-4" /><circle cx="12" cy="14" r="8" /></svg>
              Start Pomodoro
            </button>
          </div>
        }
      />

      <div className="home-grid">
        <div className="home-col">
          <Widget>
            <div className="widget-head">
              <h4>Pomodoro</h4>
              <Link className="btn btn-ghost" style={{ fontSize: 12 }} to="/pomodoro">
                Open timer
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ position: 'relative', width: 88, height: 88, flex: 'none' }}>
                <svg viewBox="0 0 88 88" width="88" height="88">
                  <circle cx="44" cy="44" r="36" fill="none" stroke="var(--color-neutral-200)" strokeWidth="8" />
                  <circle
                    cx="44" cy="44" r="36" fill="none" stroke="var(--color-accent)" strokeWidth="8"
                    strokeLinecap="round" transform="rotate(-90 44 44)"
                    strokeDasharray={`${pomoCircumference} ${pomoCircumference}`}
                    strokeDashoffset={pomoCircumference * (1 - pomoFrac)}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 600 }}>
                  {pomoTimeLabel}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                <span className="text-muted" style={{ fontSize: 12 }}>{POMODORO_MODE_LABELS[pomoMode]}</span>
                <button className="btn btn-secondary" type="button" onClick={pomoRunning || pomoSecondsLeft !== POMODORO_MODES[pomoMode] ? togglePomodoro : startPomodoro} style={{ alignSelf: 'flex-start' }}>
                  {pomoRunning ? (
                    <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>Pause</>
                  ) : (
                    <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7 4 13 8-13 8z" /></svg>{pomoSecondsLeft !== POMODORO_MODES[pomoMode] ? 'Resume' : 'Start'}</>
                  )}
                </button>
              </div>
            </div>
          </Widget>

          <Widget>
            <div className="widget-head">
              <h4>Priority Matrix</h4>
              <Link className="btn btn-ghost" style={{ fontSize: 12 }} to="/matrix">
                View full matrix
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
              </Link>
            </div>
            <div className="quad-grid">
              {(Object.keys(QUAD_LABELS) as QuadKey[]).map((qkey) => {
                const combined = [...tasks[qkey], ...homeworkRows[qkey]];
                const active = combined.filter((t) => !t.done);
                return (
                  <div
                    className="quad quad-clickable"
                    key={qkey}
                    role="button"
                    tabIndex={0}
                    title="Add a task to this quadrant"
                    onClick={() => setTaskDialogQuad(qkey)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTaskDialogQuad(qkey); } }}
                  >
                    <div className="quad-label">{QUAD_LABELS[qkey]}</div>
                    {active.length === 0 && <div className="text-muted" style={{ fontSize: 12 }}>No tasks</div>}
                    {active.map((t) => (
                      <div className="task-chip" key={t.id} title={'description' in t ? t.description || undefined : undefined}>
                        {t.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Widget>

          <Widget>
            <div className="widget-head">
              <h4>Today's Calendar</h4>
              <Link className="btn btn-ghost" style={{ fontSize: 12 }} to="/calendar?tab=weekly">
                Weekly review
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
              </Link>
            </div>
            <div>
              {todaysEvents.length === 0 && <div className="text-muted" style={{ fontSize: 12 }}>No events today.</div>}
              {todaysEvents.map((ev) => (
                <div className="event-row" key={ev.id}>
                  <span className="event-time">{ev.time}</span>
                  <span style={{ fontSize: 14 }}>{ev.title}</span>
                </div>
              ))}
            </div>
          </Widget>
        </div>

        <div className="home-col">
          <Widget>
            <div className="widget-head">
              <h4>Assistant</h4>
              <Link className="btn btn-ghost" style={{ fontSize: 12 }} to="/agent">
                Open assistant
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
              </Link>
            </div>
            {watchdogFlags.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {watchdogFlags.map((f) => (
                  <div key={`${f.title}-${f.detail}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
                    <span style={{ flex: 1, minWidth: 0 }}><strong>{f.title}</strong> — <span className="text-muted">{f.detail}</span></span>
                    <button className="btn btn-icon" type="button" aria-label="Dismiss" onClick={() => dismissFlag(f)} style={{ flex: 'none' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!dailyPlan && (
              <button className="btn btn-secondary" type="button" onClick={() => void generateDailyPlan()} disabled={isPlanning} style={{ alignSelf: 'flex-start' }}>
                {isPlanning ? 'Planning…' : 'Plan my day'}
              </button>
            )}
            {dailyPlan && (
              <Link className="btn btn-secondary" to="/agent" style={{ alignSelf: 'flex-start' }}>
                Review today's plan ({dailyPlan.length})
              </Link>
            )}
            <form
              style={{ display: 'flex', gap: 6 }}
              onSubmit={(e) => {
                e.preventDefault();
                const text = assistantInput.trim();
                if (!text || isThinking) return;
                setAssistantInput('');
                void sendChatMessage(text);
              }}
            >
              <input
                style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', font: 'inherit', fontSize: 13 }}
                placeholder="Ask the assistant…"
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={isThinking || !assistantInput.trim()}>
                Send
              </button>
            </form>
          </Widget>

          <Widget>
            <div className="widget-head">
              <h4>Today's Habits</h4>
              <span style={{ fontSize: 12 }} className="text-muted">{doneCount}/{habits.length} done · {pct}%</span>
            </div>
            <div>
              {habits.length === 0 && <div className="text-muted" style={{ fontSize: 12 }}>No habits yet.</div>}
              {habits.map((h) => (
                <div className="habit-row" key={h.id}>
                  <button
                    type="button"
                    className={`habit-done-btn${h.done ? ' done' : ''}`}
                    onClick={() => toggleHabit(h.id)}
                  >
                    {h.done && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                    {h.done ? 'Done' : 'Mark done'}
                  </button>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 14 }}>{h.name}</span>
                    {h.quote && <span className="habit-quote">"{h.quote}"</span>}
                    {h.time && <span style={{ fontSize: 11 }} className="text-muted">Linked to {h.time}</span>}
                  </div>
                  <StreakFire streak={h.streak} done={h.done} />
                </div>
              ))}
            </div>
            {habits.length > 0 && <div style={{ fontSize: 11 }} className="text-muted">Need 80% of habits done to keep a streak day.</div>}
          </Widget>

          <Widget>
            <div className="widget-head">
              <h4>Upcoming Countdowns</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Link className="btn btn-ghost" style={{ fontSize: 12 }} to="/habits">
                  View all
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                </Link>
                <button className="btn btn-icon" type="button" onClick={() => setCdDialogState('add')} aria-label="Add countdown">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
            </div>
            <div>
              {upcomingCountdowns.length === 0 && <div className="text-muted" style={{ fontSize: 12 }}>No countdowns yet.</div>}
              {upcomingCountdowns.map((c) => (
                <div
                  className="cd-item"
                  key={c.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setCdDialogState(c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCdMenu({ x: e.clientX, y: e.clientY, countdown: c });
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <div className={`cd-item-icon cd-icon-${c.type}`}>
                      <CountdownIcon type={c.type} />
                    </div>
                    <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--color-accent-700)' }}>{daysUntilNext(c.month, c.day)}</div>
                    <div style={{ fontSize: 11 }} className="text-muted">days</div>
                  </div>
                </div>
              ))}
            </div>
          </Widget>
        </div>
      </div>

      {cdMenu && <ContextMenu x={cdMenu.x} y={cdMenu.y} items={cdMenuItems} onClose={() => setCdMenu(null)} />}

      {taskDialogQuad && (
        <TaskDialog
          initialQuad={taskDialogQuad}
          onClose={() => setTaskDialogQuad(null)}
          onSave={async ({ title, description, quad, dueDate, link, durationMin, locked }) => {
            const scheduled = await autoSchedule({ title, dueDate, durationMin, link });
            addTask(quad, { title, description, dueDate, link: scheduled.link, durationMin, time: scheduled.time, locked });
          }}
        />
      )}

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
    </div>
  );
}
