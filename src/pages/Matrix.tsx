import { useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import './Matrix.css';

interface Task {
  id: number;
  title: string;
  done: boolean;
  time: string | null;
  listTag: string;
}

type QuadKey = 'q1' | 'q2' | 'q3' | 'q4';

const QUAD_CONFIG: { key: QuadKey; numeral: string; label: string; sub: string; badgeStyle: React.CSSProperties }[] = [
  { key: 'q1', numeral: 'I', label: 'Urgent & Important', sub: 'Do first', badgeStyle: { background: 'var(--color-accent-800)', color: 'var(--color-bg)' } },
  { key: 'q2', numeral: 'II', label: 'Not Urgent & Important', sub: 'Schedule', badgeStyle: { background: 'var(--color-accent-500)', color: 'var(--color-bg)' } },
  { key: 'q3', numeral: 'III', label: 'Urgent & Not Important', sub: 'Delegate', badgeStyle: { background: 'var(--color-accent-300)', color: 'var(--color-accent-800)' } },
  { key: 'q4', numeral: 'IV', label: 'Not Urgent & Not Important', sub: 'Eliminate', badgeStyle: { background: 'var(--color-neutral-300)', color: 'var(--color-neutral-800)' } },
];

const INITIAL_TASKS: Record<QuadKey, Task[]> = {
  q1: [
    { id: 1, title: 'Fix production bug', done: false, time: null, listTag: 'Work' },
    { id: 2, title: 'Submit tax extension', done: true, time: null, listTag: 'Inbox' },
  ],
  q2: [
    { id: 3, title: 'Plan Q4 roadmap', done: false, time: 'Thu 10:00 AM', listTag: 'Work' },
    { id: 4, title: 'Renew passport', done: false, time: null, listTag: 'Personal' },
  ],
  q3: [{ id: 5, title: 'Reply to recruiter emails', done: false, time: null, listTag: 'Inbox' }],
  q4: [
    { id: 6, title: 'Reorganize bookmarks', done: true, time: null, listTag: 'Inbox' },
    { id: 7, title: 'Clean out downloads folder', done: true, time: null, listTag: 'Inbox' },
  ],
};

export function MatrixPage() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [open, setOpen] = useState<Record<QuadKey, boolean>>({ q1: true, q2: true, q3: true, q4: true });

  const toggleDone = (qkey: QuadKey, id: number) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
  };
  const toggleOpen = (qkey: QuadKey) => setOpen((s) => ({ ...s, [qkey]: !s[qkey] }));
  const scheduleTask = (qkey: QuadKey, id: number) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id ? { ...t, time: 'Thu 10:00 AM' } : t)) }));
  };
  const unscheduleTask = (qkey: QuadKey, id: number) => {
    setTasks((s) => ({ ...s, [qkey]: s[qkey].map((t) => (t.id === id ? { ...t, time: null } : t)) }));
  };
  const addTask = (qkey: QuadKey) => {
    setTasks((s) => ({ ...s, [qkey]: [...s[qkey], { id: Date.now(), title: 'New task', done: false, time: null, listTag: 'Inbox' }] }));
  };

  return (
    <div className="page">
      <PageHeader
        kicker="Prioritize"
        title="Eisenhower Matrix"
        actions={
          <button className="btn btn-primary" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Add task
          </button>
        }
      />

      <div className="matrix-grid">
        {QUAD_CONFIG.map((q) => {
          const all = tasks[q.key];
          const activeTasks = all.filter((t) => !t.done);
          const completedTasks = all.filter((t) => t.done);
          const isOpen = open[q.key];

          return (
            <Widget key={q.key}>
              <div className="qhead">
                <span className="qbadge" style={q.badgeStyle}>{q.numeral}</span>
                <span className="qlabel">{q.label}</span>
                <span className="qsub">{q.sub}</span>
              </div>

              {activeTasks.map((t) => (
                <div className="task-row" key={t.id}>
                  <div className={`tcheck${t.done ? ' done' : ''}`} onClick={() => toggleDone(q.key, t.id)}>
                    {t.done && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                  </div>
                  <span className={`ttitle${t.done ? ' done' : ''}`}>{t.title}</span>
                  <span className="tmeta">
                    {t.time && (
                      <span className="tag tag-accent" style={{ cursor: 'pointer' }} onClick={() => unscheduleTask(q.key, t.id)}>{t.time}</span>
                    )}
                    {!t.time && (
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => scheduleTask(q.key, t.id)} type="button">+ Schedule</button>
                    )}
                    <span className="tag tag-neutral">{t.listTag}</span>
                  </span>
                </div>
              ))}

              {activeTasks.length === 0 && completedTasks.length === 0 && (
                <div className="empty-msg">No tasks</div>
              )}

              {completedTasks.length > 0 && (
                <>
                  <div className="completed-head" onClick={() => toggleOpen(q.key)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}><path d="m6 9 6 6 6-6" /></svg>
                    Completed {completedTasks.length}
                  </div>
                  <div style={{ display: isOpen ? 'flex' : 'none', flexDirection: 'column' }}>
                    {completedTasks.map((t) => (
                      <div className="task-row" key={t.id}>
                        <div className="tcheck done" onClick={() => toggleDone(q.key, t.id)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        </div>
                        <span className="ttitle done">{t.title}</span>
                        <span className="tmeta"><span className="tag tag-neutral">{t.listTag}</span></span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <button className="btn btn-ghost qaddbtn" onClick={() => addTask(q.key)} type="button">+ Add task</button>
            </Widget>
          );
        })}
      </div>
    </div>
  );
}
