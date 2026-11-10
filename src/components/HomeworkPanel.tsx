import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Widget } from './Widget';
import { Checkbox } from './TaskRow';
import { Icon } from './Icon';
import { useSchool, type Homework } from '../state/SchoolContext';
import { useUI } from '../state/UIContext';
import { useAllHomework, type HomeworkEntry } from '../lib/useQuadrantHomework';
import { dueInfo, parseDue } from '../lib/due';
import { parseQuickAdd } from '../lib/quickAdd';
import './HomeworkPanel.css';

const QUAD_LABEL = { q1: 'Do first', q2: 'Schedule', q3: 'Delegate', q4: 'Eliminate' } as const;
const PRIORITY_LABEL: Record<Homework['priority'], string> = { high: 'High', med: 'Medium', low: 'Low' };
const SOURCE_LABEL = { schoology: 'Schoology', canvas: 'Canvas', classroom: 'Classroom', manual: '' } as const;

function byDue(a: HomeworkEntry, b: HomeworkEntry) {
  const ta = a.due ? (parseDue(a.due)?.getTime() ?? Infinity) : Infinity;
  const tb = b.due ? (parseDue(b.due)?.getTime() ?? Infinity) : Infinity;
  return ta - tb;
}

/** All homework across every class in one list — add, check off, and see where each lands on the matrix. */
export function HomeworkPanel({ onOpenClass }: { onOpenClass: (classId: string) => void }) {
  const { classes, addHomework, removeHomework, toggleHomework, toggleSchoologyHomeworkDone } = useSchool();
  const { toast } = useUI();
  const all = useAllHomework();
  const [filter, setFilter] = useState<string>('all');
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<Homework['priority']>('med');

  const activeFilter = filter !== 'all' && filter !== 'unsorted' && !classes.some((c) => c.id === filter) ? 'all' : filter;
  const matches = (h: HomeworkEntry) => activeFilter === 'all' || (activeFilter === 'unsorted' ? h.classId === null : h.classId === activeFilter);
  const open = useMemo(() => all.filter((h) => !h.done).sort(byDue), [all]);
  const done = useMemo(() => all.filter((h) => h.done).sort(byDue), [all]);
  const shownOpen = open.filter(matches);
  const shownDone = done.filter(matches);
  const unsortedCount = open.filter((h) => h.classId === null).length;
  const hasUnsorted = all.some((h) => h.classId === null);

  // Lets you type "Problem set 4 fri" — the date is pulled out unless one was picked explicitly.
  const parsed = title.trim() ? parseQuickAdd(title) : null;
  const effectiveDue = due || parsed?.dueDate || '';
  const effectiveTitle = (due ? title.trim() : parsed?.title) || '';
  const targetClass = classId || (activeFilter !== 'all' && activeFilter !== 'unsorted' ? activeFilter : classes[0]?.id) || '';

  const toggle = (h: HomeworkEntry) => {
    const flip = () => (h.source === 'manual' && h.classId && h.homeworkId !== undefined ? toggleHomework(h.classId, h.homeworkId) : toggleSchoologyHomeworkDone(h.uid!));
    flip();
    if (!h.done) toast({ message: `Homework done: “${h.title}”`, tone: 'success', action: { label: 'Undo', onClick: flip } });
  };

  const remove = (h: HomeworkEntry) => {
    if (h.source !== 'manual' || !h.classId || h.homeworkId === undefined) return;
    const cid = h.classId;
    removeHomework(cid, h.homeworkId);
    toast({
      message: `Deleted “${h.title}”`,
      action: { label: 'Undo', onClick: () => addHomework(cid, { title: h.title, due: h.due ?? '', priority: h.priorityLabel ?? 'med', description: h.description }) },
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!effectiveTitle || !targetClass) return;
    addHomework(targetClass, { title: effectiveTitle, due: effectiveDue, priority });
    toast({ message: `Added “${effectiveTitle}” to ${classes.find((c) => c.id === targetClass)?.name ?? 'class'}`, tone: 'success' });
    setTitle('');
    setDue('');
    setPriority('med');
  };

  const row = (h: HomeworkEntry) => {
    const info = h.done ? null : dueInfo(h.due);
    return (
      <div className={`hwp-row${h.done ? ' is-done' : ''}`} key={h.key}>
        <Checkbox checked={h.done} onToggle={() => toggle(h)} label={h.done ? `Mark “${h.title}” not done` : `Complete “${h.title}”`} color={`var(--${h.quad})`} />
        <div
          className={`hwp-main${h.classId ? ' clickable' : ''}`}
          onClick={h.classId ? () => onOpenClass(h.classId!) : undefined}
          title={h.classId ? 'Open class to edit' : h.description}
        >
          <span className="hwp-title">{h.title}</span>
          <span className="hwp-meta">
            {info ? <span className={`tdue tdue-${info.tone}`}><Icon name="calendar" />{info.label}</span> : !h.done && <span className="tdue">No due date</span>}
            <span className="tchip tchip-hw"><Icon name="book" />{h.className}</span>
            {h.priorityLabel && <span className={`tchip hwp-pri-${h.priorityLabel}`}>{PRIORITY_LABEL[h.priorityLabel]}</span>}
            {h.source !== 'manual' && <span className="tchip">{SOURCE_LABEL[h.source]}</span>}
            {h.points != null && <span className="tchip">{h.points} pts</span>}
          </span>
        </div>
        {!h.done && (
          <span className="hwp-quad" style={{ '--qc': `var(--${h.quad})` } as React.CSSProperties} title={`On the matrix under “${QUAD_LABEL[h.quad]}” — ${h.reason}`}>
            {QUAD_LABEL[h.quad]}
          </span>
        )}
        {h.url && (
          <a className="btn btn-icon" href={h.url} target="_blank" rel="noreferrer" aria-label={`Open “${h.title}” in ${SOURCE_LABEL[h.source]}`} title={`Open in ${SOURCE_LABEL[h.source]}`}>
            <Icon name="arrow-right" />
          </a>
        )}
        {h.source === 'manual' && (
          <button className="btn btn-icon hwp-del" type="button" aria-label={`Delete “${h.title}”`} title="Delete" onClick={() => remove(h)}>
            <Icon name="trash" />
          </button>
        )}
      </div>
    );
  };

  return (
    <Widget>
      <div className="widget-head">
        <h4>Homework {open.length > 0 && <span className="widget-count">{open.length} to do</span>}</h4>
        <Link className="widget-link" to="/matrix">See on the matrix <Icon name="chevron-right" /></Link>
      </div>

      {classes.length === 0 ? (
        <div className="empty-state">
          <Icon name="book" />
          <strong>Add your classes first</strong>
          <span>Homework is organised by class. <Link to="/settings">Set up classes in Settings</Link>.</span>
        </div>
      ) : (
        <>
          <form className="hwp-add" onSubmit={submit}>
            <Icon name="plus" />
            <input
              className="hwp-add-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add homework — “Problem set 4 fri”"
              aria-label="Homework title"
            />
            <select className="input hwp-add-field" value={targetClass} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="input hwp-add-field" type="date" value={effectiveDue} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
            <select className="input hwp-add-field" value={priority} onChange={(e) => setPriority(e.target.value as Homework['priority'])} aria-label="Priority">
              <option value="high">High</option>
              <option value="med">Medium</option>
              <option value="low">Low</option>
            </select>
            <button className="btn btn-primary" type="submit" disabled={!effectiveTitle || !targetClass}>Add</button>
          </form>

          <div className="hwp-filters" role="tablist" aria-label="Filter homework by class">
            <button type="button" role="tab" aria-selected={activeFilter === 'all'} className={`hwp-filter${activeFilter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
              All <span>{open.length}</span>
            </button>
            {classes.map((c) => {
              const n = open.filter((h) => h.classId === c.id).length;
              return (
                <button type="button" role="tab" aria-selected={activeFilter === c.id} key={c.id} className={`hwp-filter${activeFilter === c.id ? ' active' : ''}`} onClick={() => setFilter(c.id)}>
                  {c.name} {n > 0 && <span>{n}</span>}
                </button>
              );
            })}
            {hasUnsorted && (
              <button type="button" role="tab" aria-selected={activeFilter === 'unsorted'} className={`hwp-filter${activeFilter === 'unsorted' ? ' active' : ''}`} onClick={() => setFilter('unsorted')} title="Imported assignments that didn't match a class">
                Unsorted {unsortedCount > 0 && <span>{unsortedCount}</span>}
              </button>
            )}
          </div>

          {activeFilter === 'unsorted' && (
            <div className="text-muted" style={{ fontSize: 12.5 }}>
              These imported assignments didn’t match any of your classes. <Link to="/settings">Map them to a class in Settings → School</Link>.
            </div>
          )}

          {shownOpen.length === 0 ? (
            <div className="empty-state">
              <Icon name="check-circle" />
              <strong>{open.length === 0 ? 'No homework — you’re all caught up' : 'Nothing to do for this class'}</strong>
              <span>Add homework above, or connect Schoology, Canvas or Google Classroom in Settings to import it.</span>
            </div>
          ) : (
            <div className="hwp-list">{shownOpen.map(row)}</div>
          )}

          {shownDone.length > 0 && (
            <div className="hwp-done">
              <button type="button" className="completed-head" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
                <Icon name="chevron-down" strokeWidth={2.2} className={showDone ? '' : 'rot'} />
                Completed · {shownDone.length}
              </button>
              {showDone && <div className="hwp-list">{shownDone.map(row)}</div>}
            </div>
          )}
        </>
      )}
    </Widget>
  );
}
