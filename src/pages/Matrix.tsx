import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Widget, PageHeader } from '../components/Widget';
import { TaskDialog } from '../components/TaskDialog';
import { TaskRow } from '../components/TaskRow';
import { Icon } from '../components/Icon';
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { useAutoSchedule } from '../lib/useAutoSchedule';
import { parseQuickAdd } from '../lib/quickAdd';
import { daysUntil } from '../lib/due';
import { useMatrix, type QuadKey, type Task } from '../state/MatrixContext';
import { useSchool } from '../state/SchoolContext';
import { useUI } from '../state/UIContext';
import { useQuadrantHomework, type HomeworkTaskRow } from '../lib/useQuadrantHomework';
import './Matrix.css';

const QUAD_CONFIG: { key: QuadKey; numeral: string; label: string; sub: string; hint: string }[] = [
  { key: 'q1', numeral: 'I', label: 'Do first', sub: 'Urgent & important', hint: 'Deadlines and crises — handle these today.' },
  { key: 'q2', numeral: 'II', label: 'Schedule', sub: 'Important, not urgent', hint: 'Goals and deep work — block time for these.' },
  { key: 'q3', numeral: 'III', label: 'Delegate', sub: 'Urgent, not important', hint: 'Interruptions — hand off or batch them.' },
  { key: 'q4', numeral: 'IV', label: 'Eliminate', sub: 'Neither', hint: 'Distractions — drop these when you can.' },
];

type Row = (Task & { source: 'matrix' }) | HomeworkTaskRow;
type SortMode = 'manual' | 'due';

function sortRows(rows: Row[], mode: SortMode): Row[] {
  if (mode === 'manual') return rows;
  return [...rows].sort((a, b) => {
    const da = a.dueDate ? (daysUntil(a.dueDate) ?? 9999) : 9999;
    const db = b.dueDate ? (daysUntil(b.dueDate) ?? 9999) : 9999;
    return da - db;
  });
}

export function MatrixPage() {
  const { tasks, removeTask, toggleDone, scheduleTask, unscheduleTask, toggleTaskLocked, moveTask, restoreTask, addTask, updateTask } = useMatrix();
  const navigate = useNavigate();
  const { toggleHomework, toggleSchoologyHomeworkDone } = useSchool();
  const { toast } = useUI();
  const homeworkRows = useQuadrantHomework();
  const autoSchedule = useAutoSchedule();
  const [showDone, setShowDone] = useState<Record<QuadKey, boolean>>({ q1: false, q2: false, q3: false, q4: false });
  const [dialogQuad, setDialogQuad] = useState<QuadKey | null>(null);
  const [drafts, setDrafts] = useState<Record<QuadKey, string>>({ q1: '', q2: '', q3: '', q4: '' });
  const [editing, setEditing] = useState<{ quad: QuadKey; task: Task } | null>(null);
  const [hwMenu, setHwMenu] = useState<{ x: number; y: number; row: HomeworkTaskRow } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; quad: QuadKey; task: Task } | null>(null);
  const [dragOver, setDragOver] = useState<QuadKey | null>(null);
  const [hideHomework, setHideHomework] = useState(() => localStorage.getItem('matrix.hideHomework') === '1');
  const [sortMode, setSortMode] = useState<SortMode>(() => (localStorage.getItem('matrix.sort') === 'due' ? 'due' : 'manual'));

  const persist = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // ignore
    }
  };

  const scheduleNow = async (qkey: QuadKey, t: Task) => {
    const scheduled = await autoSchedule({ title: t.title, dueDate: t.dueDate, durationMin: t.durationMin ?? 30, link: null });
    if (scheduled.time) {
      scheduleTask(qkey, t.id, scheduled.time);
      toast({ message: `Booked “${t.title}” at ${scheduled.time}`, tone: 'success' });
    } else {
      toast({ message: 'No free slot found before the due date', tone: 'error' });
    }
  };

  const toggleRow = (quad: QuadKey, t: Row) => {
    if (t.source !== 'homework') {
      toggleDone(quad, t.id);
      if (!t.done) toast({ message: `Completed “${t.title}”`, tone: 'success', action: { label: 'Undo', onClick: () => toggleDone(quad, t.id) } });
      return;
    }
    if (t.hwId !== undefined && t.classId) toggleHomework(t.classId, t.hwId);
    else toggleSchoologyHomeworkDone(t.uid!);
    if (!t.done) toast({ message: `Homework done: “${t.title}”`, tone: 'success', action: { label: 'Undo', onClick: () => (t.hwId !== undefined && t.classId ? toggleHomework(t.classId, t.hwId) : toggleSchoologyHomeworkDone(t.uid!)) } });
  };

  const deleteTask = (quad: QuadKey, t: Task) => {
    removeTask(quad, t.id);
    toast({ message: `Deleted “${t.title}”`, action: { label: 'Undo', onClick: () => restoreTask(quad, t) } });
  };

  const submitDraft = async (quad: QuadKey) => {
    const text = drafts[quad].trim();
    if (!text) return;
    const parsed = parseQuickAdd(text);
    if (!parsed.title) return;
    setDrafts((d) => ({ ...d, [quad]: '' }));
    const scheduled = parsed.durationMin ? await autoSchedule({ title: parsed.title, dueDate: parsed.dueDate, durationMin: parsed.durationMin, link: null }) : { link: null, time: null };
    addTask(quad, { title: parsed.title, dueDate: parsed.dueDate, durationMin: parsed.durationMin, time: scheduled.time ?? parsed.time, link: scheduled.link });
  };

  const menuItems: ContextMenuItem[] = menu
    ? [
        { label: 'Edit…', icon: <Icon name="edit" />, onClick: () => setEditing({ quad: menu.quad, task: menu.task }) },
        ...(!menu.task.locked
          ? QUAD_CONFIG.filter((q) => q.key !== menu.quad).map((q) => ({
              label: `Move to ${q.label}`,
              icon: <span className="qdot" style={{ background: `var(--${q.key})` }} />,
              onClick: () => moveTask(menu.quad, q.key, menu.task.id),
            }))
          : []),
        ...(!menu.task.locked && !menu.task.done
          ? [
              menu.task.time
                ? { label: `Unschedule (${menu.task.time})`, icon: <Icon name="clock" />, onClick: () => unscheduleTask(menu.quad, menu.task.id) }
                : { label: 'Find a time & schedule', icon: <Icon name="clock" />, onClick: () => void scheduleNow(menu.quad, menu.task) },
            ]
          : []),
        {
          label: menu.task.locked ? 'Unlock' : 'Lock in place',
          icon: <Icon name={menu.task.locked ? 'unlock' : 'lock'} />,
          onClick: () => toggleTaskLocked(menu.quad, menu.task.id),
        },
        ...(!menu.task.locked ? [{ label: 'Delete', danger: true, icon: <Icon name="trash" />, onClick: () => deleteTask(menu.quad, menu.task) }] : []),
      ]
    : [];

  const allRows = QUAD_CONFIG.flatMap((q) => [...tasks[q.key], ...(hideHomework ? [] : homeworkRows[q.key])]);
  const openCount = allRows.filter((t) => !t.done).length;
  const overdueCount = allRows.filter((t) => !t.done && t.dueDate && (daysUntil(t.dueDate) ?? 0) < 0).length;
  const doneCount = allRows.filter((t) => t.done).length;

  return (
    <div className="page">
      <PageHeader
        kicker="Prioritize"
        title="Eisenhower Matrix"
        subtitle={
          <>
            {openCount} open{overdueCount > 0 && <> · <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{overdueCount} overdue</span></>}
            {doneCount > 0 && <> · {doneCount} done</>}
            <span className="matrix-tip"> · Drag tasks between quadrants · click a task to edit</span>
          </>
        }
        actions={
          <>
            <label className="seg" title="Sort tasks">
              {(['manual', 'due'] as SortMode[]).map((m) => (
                <span className="seg-opt" key={m}>
                  <input type="radio" name="matrix-sort" checked={sortMode === m} onChange={() => { setSortMode(m); persist('matrix.sort', m); }} />
                  {m === 'manual' ? 'Added' : 'Due date'}
                </span>
              ))}
            </label>
            <button
              className={`btn btn-secondary${hideHomework ? '' : ' is-on'}`}
              type="button"
              onClick={() => {
                setHideHomework((v) => !v);
                persist('matrix.hideHomework', hideHomework ? '0' : '1');
              }}
              aria-pressed={!hideHomework}
              title="Show homework from the School tab"
            >
              <Icon name="book" />
              {hideHomework ? 'Show homework' : 'Hide homework'}
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setDialogQuad('q1')}>
              <Icon name="plus" />
              Add task
            </button>
          </>
        }
      />

      <div className="matrix-grid">
        {QUAD_CONFIG.map((q) => {
          const combined: Row[] = [...tasks[q.key].map((t) => ({ ...t, source: 'matrix' as const })), ...(hideHomework ? [] : homeworkRows[q.key])];
          const active = sortRows(combined.filter((t) => !t.done), sortMode);
          const completed = combined.filter((t) => t.done);

          return (
            <Widget
              key={q.key}
              className={`quad-card quad-${q.key}${dragOver === q.key ? ' drag-over' : ''}`}
            >
              <div
                className="quad-drop"
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-fourfold-task')) {
                    e.preventDefault();
                    setDragOver(q.key);
                  }
                }}
                onDragLeave={(e) => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOver(null);
                }}
                onDrop={(e) => {
                  setDragOver(null);
                  const raw = e.dataTransfer.getData('application/x-fourfold-task');
                  if (!raw) return;
                  const { from, id } = JSON.parse(raw) as { from: QuadKey; id: string };
                  moveTask(from, q.key, id);
                }}
              >
                <div className="qhead">
                  <span className="qbadge">{q.numeral}</span>
                  <div className="qtitles">
                    <span className="qlabel">{q.label}</span>
                    <span className="qsub">{q.sub}</span>
                  </div>
                  <span className="qcount">{active.length}</span>
                </div>

                <div className="qlist">
                  {active.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      color={`var(--${q.key})`}
                      onToggle={() => toggleRow(q.key, t)}
                      draggable={t.source !== 'homework' && !t.locked}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-fourfold-task', JSON.stringify({ from: q.key, id: t.id }));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onMenu={t.source !== 'homework' ? (x, y) => setMenu({ x, y, quad: q.key, task: t }) : (x, y) => setHwMenu({ x, y, row: t })}
                      onOpen={t.source !== 'homework' ? () => setEditing({ quad: q.key, task: t }) : undefined}
                      extraMeta={t.source === 'homework' ? <span className="treason" title="Why it's in this quadrant">{t.reason}</span> : undefined}
                      actions={
                        t.source !== 'homework' && !t.locked && !t.time ? (
                          <button className="btn btn-icon" type="button" title="Find a time & schedule" aria-label={`Schedule “${t.title}”`} onClick={() => void scheduleNow(q.key, t)}>
                            <Icon name="clock" />
                          </button>
                        ) : undefined
                      }
                    />
                  ))}
                  {active.length === 0 && (
                    <div className="qempty">
                      <span>{completed.length > 0 ? 'All clear here.' : q.hint}</span>
                    </div>
                  )}
                </div>

                <form
                  className="qadd"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitDraft(q.key);
                  }}
                >
                  <Icon name="plus" />
                  <input
                    value={drafts[q.key]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.key]: e.target.value }))}
                    placeholder="Add a task… (try “fri 30m”)"
                    aria-label={`Add a task to ${q.label}`}
                  />
                  {drafts[q.key].trim() && (
                    <span className="qadd-chips">
                      {parseQuickAdd(drafts[q.key]).chips.filter((c) => c.kind !== 'quad').map((c) => (
                        <span className="tag tag-accent" key={c.label}>{c.label}</span>
                      ))}
                    </span>
                  )}
                  <button type="button" className="btn btn-icon" title="More options" aria-label={`Add a detailed task to ${q.label}`} onClick={() => setDialogQuad(q.key)}>
                    <Icon name="more" strokeWidth={2.5} />
                  </button>
                </form>

                {completed.length > 0 && (
                  <div className="qdone">
                    <button type="button" className="completed-head" onClick={() => setShowDone((s) => ({ ...s, [q.key]: !s[q.key] }))} aria-expanded={showDone[q.key]}>
                      <Icon name="chevron-down" strokeWidth={2.2} className={showDone[q.key] ? '' : 'rot'} />
                      Completed · {completed.length}
                    </button>
                    {showDone[q.key] &&
                      completed.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          compact
                          color={`var(--${q.key})`}
                          onToggle={() => toggleRow(q.key, t)}
                          onMenu={t.source !== 'homework' ? (x, y) => setMenu({ x, y, quad: q.key, task: t }) : undefined}
                        />
                      ))}
                  </div>
                )}
              </div>
            </Widget>
          );
        })}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      {hwMenu && (
        <ContextMenu
          x={hwMenu.x}
          y={hwMenu.y}
          onClose={() => setHwMenu(null)}
          items={[
            { label: hwMenu.row.classId ? `Open in School (${hwMenu.row.listTag})` : 'Open homework list', icon: <Icon name="book" />, onClick: () => navigate(hwMenu.row.classId ? `/school?class=${hwMenu.row.classId}` : '/school') },
          ]}
        />
      )}

      {editing && (
        <TaskDialog
          initialQuad={editing.quad}
          initial={editing.task}
          onClose={() => setEditing(null)}
          onSave={({ title, description, quad, dueDate, link, durationMin, locked }) => {
            updateTask(editing.quad, editing.task.id, { title, description, dueDate, link, durationMin, locked });
            if (quad !== editing.quad) {
              // moveTask refuses locked tasks; the user explicitly picked a quadrant here, so unlock for the move.
              if (locked) updateTask(editing.quad, editing.task.id, { locked: false });
              moveTask(editing.quad, quad, editing.task.id);
              if (locked) updateTask(quad, editing.task.id, { locked: true });
            }
          }}
        />
      )}

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
