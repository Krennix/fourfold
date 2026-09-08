import { useMemo, useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { TaskDialog } from '../components/TaskDialog';
import { useAutoSchedule } from '../lib/useAutoSchedule';
import { useMatrix, type QuadKey } from '../state/MatrixContext';
import { useSchool, type Homework } from '../state/SchoolContext';
import { useSchoology } from '../state/SchoologyContext';
import { mergeHomeworkForClass, type MergedHomeworkItem } from '../lib/homeworkMerge';
import type { Urgency } from '../lib/urgency';
import './Matrix.css';

const QUAD_CONFIG: { key: QuadKey; numeral: string; label: string; sub: string; badgeStyle: React.CSSProperties }[] = [
  { key: 'q1', numeral: 'I', label: 'Urgent & Important', sub: 'Do first', badgeStyle: { background: 'var(--color-accent-800)', color: 'var(--color-bg)' } },
  { key: 'q2', numeral: 'II', label: 'Not Urgent & Important', sub: 'Schedule', badgeStyle: { background: 'var(--color-accent-500)', color: 'var(--color-bg)' } },
  { key: 'q3', numeral: 'III', label: 'Urgent & Not Important', sub: 'Delegate', badgeStyle: { background: 'var(--color-accent-300)', color: 'var(--color-accent-800)' } },
  { key: 'q4', numeral: 'IV', label: 'Not Urgent & Not Important', sub: 'Eliminate', badgeStyle: { background: 'var(--color-neutral-300)', color: 'var(--color-neutral-800)' } },
];

/** Maps a homework item's priority onto an Eisenhower quadrant so it surfaces on the matrix too. */
const PRIORITY_QUAD: Record<Homework['priority'], QuadKey> = { high: 'q1', med: 'q2', low: 'q4' };
/** Schoology items have no manual priority — fall back to due-date/ICS-priority urgency. */
const URGENCY_QUAD: Record<Urgency, QuadKey> = { red: 'q1', yellow: 'q2', blue: 'q4' };

interface HomeworkTaskRow {
  source: 'homework';
  classId: string;
  hwId?: number;
  uid?: string;
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  listTag: string;
  durationMin: null;
  time: null;
}

export function MatrixPage() {
  const { tasks, addTask, removeTask, toggleDone, scheduleTask, unscheduleTask, toggleTaskLocked } = useMatrix();
  const { classes, homework, toggleHomework, schoologyDone, toggleSchoologyHomeworkDone, classMappings, classKeywords } = useSchool();
  const { assignments } = useSchoology();
  const autoSchedule = useAutoSchedule();
  const [open, setOpen] = useState<Record<QuadKey, boolean>>({ q1: true, q2: true, q3: true, q4: true });
  const [dialogQuad, setDialogQuad] = useState<QuadKey | null>(null);

  const toggleOpen = (qkey: QuadKey) => setOpen((s) => ({ ...s, [qkey]: !s[qkey] }));

  const openDialog = (qkey: QuadKey) => setDialogQuad(qkey);

  const scheduleNow = async (qkey: QuadKey, id: string, title: string, durationMin: number | null) => {
    const scheduled = await autoSchedule({ title, dueDate: null, durationMin: durationMin ?? 30, link: null });
    if (scheduled.time) scheduleTask(qkey, id, scheduled.time);
  };

  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const mergedByClass = useMemo(() => {
    const out: Record<string, MergedHomeworkItem[]> = {};
    for (const c of classes) {
      out[c.id] = mergeHomeworkForClass(c.id, homework[c.id] || [], assignments, classes, classMappings, classKeywords, schoologyDone);
    }
    return out;
  }, [classes, homework, assignments, classMappings, classKeywords, schoologyDone]);

  const homeworkRows: Record<QuadKey, HomeworkTaskRow[]> = { q1: [], q2: [], q3: [], q4: [] };
  for (const [classId, items] of Object.entries(mergedByClass)) {
    for (const hw of items) {
      const quad = hw.source === 'manual' ? PRIORITY_QUAD[hw.priorityLabel!] : URGENCY_QUAD[hw.urgency];
      homeworkRows[quad].push({
        source: 'homework',
        classId,
        hwId: hw.homeworkId,
        uid: hw.uid,
        id: `hw-${hw.key}`,
        title: hw.title,
        done: hw.done,
        dueDate: hw.due,
        listTag: classById[classId]?.name ?? 'School',
        durationMin: null,
        time: null,
      });
    }
  }

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
          const combined = [...tasks[q.key].map((t) => ({ ...t, source: 'matrix' as const })), ...homeworkRows[q.key]];
          const activeTasks = combined.filter((t) => !t.done);
          const completedTasks = combined.filter((t) => t.done);
          const isOpen = open[q.key];

          const toggle = (t: (typeof combined)[number]) => {
            if (t.source !== 'homework') return toggleDone(q.key, t.id);
            return t.hwId !== undefined ? toggleHomework(t.classId, t.hwId) : toggleSchoologyHomeworkDone(t.uid!);
          };

          return (
            <Widget key={q.key}>
              <div className="qhead">
                <span className="qbadge" style={q.badgeStyle}>{q.numeral}</span>
                <span className="qlabel">{q.label}</span>
                <span className="qsub">{q.sub}</span>
              </div>

              {activeTasks.map((t) => (
                <div className="task-row" key={t.id}>
                  <div className={`tcheck${t.done ? ' done' : ''}`} onClick={() => toggle(t)}>
                    {t.done && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                  </div>
                  <span className={`ttitle${t.done ? ' done' : ''}`} title={'description' in t ? t.description || undefined : undefined}>{t.title}</span>
                  <span className="tmeta">
                    {t.durationMin && <span className="tag tag-neutral">{t.durationMin < 60 ? `${t.durationMin}m` : `${Math.floor(t.durationMin / 60)}h${t.durationMin % 60 ? ` ${t.durationMin % 60}m` : ''}`}</span>}
                    {t.dueDate && <span className="tag tag-outline">Due {t.dueDate}</span>}
                    {t.source !== 'homework' && t.time && (
                      <span
                        className="tag tag-accent"
                        style={{ cursor: t.locked ? 'default' : 'pointer' }}
                        title={t.locked ? 'Locked — unlock to change' : 'Click to unschedule'}
                        onClick={() => !t.locked && unscheduleTask(q.key, t.id)}
                      >
                        {t.time}
                      </span>
                    )}
                    {t.source !== 'homework' && !t.time && !t.locked && (
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => scheduleNow(q.key, t.id, t.title, t.durationMin)} type="button">+ Schedule</button>
                    )}
                    <span className="tag tag-neutral">{t.listTag}</span>
                    {t.source === 'homework' ? (
                      <span className="tag tag-outline" title="Managed on the School tab">Homework</span>
                    ) : (
                      <>
                        <button
                          className="btn btn-icon"
                          type="button"
                          onClick={() => toggleTaskLocked(q.key, t.id)}
                          aria-label={t.locked ? `Unlock ${t.title}` : `Lock ${t.title} in place`}
                          title={t.locked ? 'Locked — set in stone. Click to unlock.' : 'Lock in place'}
                        >
                          {t.locked ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>
                          )}
                        </button>
                        {!t.locked && (
                          <button className="btn btn-icon" type="button" onClick={() => removeTask(q.key, t.id)} aria-label={`Remove ${t.title}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        )}
                      </>
                    )}
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
                        <div className="tcheck done" onClick={() => toggle(t)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        </div>
                        <span className="ttitle done">{t.title}</span>
                        <span className="tmeta">
                          <span className="tag tag-neutral">{t.listTag}</span>
                          {t.source === 'homework' ? (
                            <span className="tag tag-outline" title="Managed on the School tab">Homework</span>
                          ) : (
                            <>
                              <button
                                className="btn btn-icon"
                                type="button"
                                onClick={() => toggleTaskLocked(q.key, t.id)}
                                aria-label={t.locked ? `Unlock ${t.title}` : `Lock ${t.title} in place`}
                                title={t.locked ? 'Locked — set in stone. Click to unlock.' : 'Lock in place'}
                              >
                                {t.locked ? (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>
                                )}
                              </button>
                              {!t.locked && (
                                <button className="btn btn-icon" type="button" onClick={() => removeTask(q.key, t.id)} aria-label={`Remove ${t.title}`}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                                </button>
                              )}
                            </>
                          )}
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
        <TaskDialog
          initialQuad={dialogQuad}
          onClose={() => setDialogQuad(null)}
          onSave={async ({ title, description, quad, dueDate, link, durationMin, locked }) => {
            const scheduled = await autoSchedule({ title, dueDate, durationMin, link });
            addTask(quad, { title, description, dueDate, link: scheduled.link, durationMin, time: scheduled.time, locked });
          }}
        />
      )}
    </div>
  );
}
