import { useRef, useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useMatrix, type QuadKey } from '../state/MatrixContext';
import './Matrix.css';

const QUAD_CONFIG: { key: QuadKey; numeral: string; label: string; sub: string; badgeStyle: React.CSSProperties }[] = [
  { key: 'q1', numeral: 'I', label: 'Urgent & Important', sub: 'Do first', badgeStyle: { background: 'var(--color-accent-800)', color: 'var(--color-bg)' } },
  { key: 'q2', numeral: 'II', label: 'Not Urgent & Important', sub: 'Schedule', badgeStyle: { background: 'var(--color-accent-500)', color: 'var(--color-bg)' } },
  { key: 'q3', numeral: 'III', label: 'Urgent & Not Important', sub: 'Delegate', badgeStyle: { background: 'var(--color-accent-300)', color: 'var(--color-accent-800)' } },
  { key: 'q4', numeral: 'IV', label: 'Not Urgent & Not Important', sub: 'Eliminate', badgeStyle: { background: 'var(--color-neutral-300)', color: 'var(--color-neutral-800)' } },
];

export function MatrixPage() {
  const { tasks, addTask, removeTask, toggleDone, scheduleTask, unscheduleTask } = useMatrix();
  const [open, setOpen] = useState<Record<QuadKey, boolean>>({ q1: true, q2: true, q3: true, q4: true });
  const [dialogQuad, setDialogQuad] = useState<QuadKey | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const tagRef = useRef<HTMLInputElement>(null);
  const quadRef = useRef<HTMLSelectElement>(null);

  const toggleOpen = (qkey: QuadKey) => setOpen((s) => ({ ...s, [qkey]: !s[qkey] }));

  const openDialog = (qkey: QuadKey) => setDialogQuad(qkey);

  const saveTask = () => {
    const title = titleRef.current?.value.trim();
    const qkey = (quadRef.current?.value as QuadKey) || dialogQuad;
    if (title && qkey) addTask(qkey, { title, listTag: tagRef.current?.value.trim() || 'Inbox' });
    if (titleRef.current) titleRef.current.value = '';
    if (tagRef.current) tagRef.current.value = '';
    setDialogQuad(null);
  };

  return (
    <div className="page">
      <PageHeader
        kicker="Prioritize"
        title="Eisenhower Matrix"
        actions={
          <button className="btn btn-primary" type="button" onClick={() => openDialog('q1')}>
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
                    {t.dueDate && <span className="tag tag-outline">Due {t.dueDate}</span>}
                    {t.time && (
                      <span className="tag tag-accent" style={{ cursor: 'pointer' }} onClick={() => unscheduleTask(q.key, t.id)}>{t.time}</span>
                    )}
                    {!t.time && (
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => scheduleTask(q.key, t.id, 'Thu 10:00 AM')} type="button">+ Schedule</button>
                    )}
                    <span className="tag tag-neutral">{t.listTag}</span>
                    <button className="btn btn-icon" type="button" onClick={() => removeTask(q.key, t.id)} aria-label={`Remove ${t.title}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
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
                        <span className="tmeta">
                          <span className="tag tag-neutral">{t.listTag}</span>
                          <button className="btn btn-icon" type="button" onClick={() => removeTask(q.key, t.id)} aria-label={`Remove ${t.title}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <button className="btn btn-ghost qaddbtn" onClick={() => openDialog(q.key)} type="button">+ Add task</button>
            </Widget>
          );
        })}
      </div>

      {dialogQuad && (
        <div className="dialog-backdrop" onClick={() => setDialogQuad(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Add task</div>
            <div className="field"><label>Title</label><input className="input" type="text" ref={titleRef} placeholder="Task title" autoFocus /></div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Quadrant</label>
                <select className="input" ref={quadRef} defaultValue={dialogQuad}>
                  {QUAD_CONFIG.map((q) => <option key={q.key} value={q.key}>{q.numeral} · {q.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}><label>List tag</label><input className="input" type="text" ref={tagRef} placeholder="Inbox" /></div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setDialogQuad(null)}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={saveTask}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
