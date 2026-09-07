import { useRef, useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useSchool } from '../state/SchoolContext';
import './School.css';

interface Homework {
  id: number;
  title: string;
  due: string;
  priority: 'high' | 'med' | 'low';
  done: boolean;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const START_HOUR = 8;
const END_HOUR = 18;
const PRIORITY_LABEL: Record<Homework['priority'], string> = { high: 'High', med: 'Medium', low: 'Low' };
const PRIORITY_CLASS: Record<Homework['priority'], string> = { high: 'pill-high', med: 'pill-med', low: 'pill-low' };

const INITIAL_HOMEWORK: Record<string, Homework[]> = {
  calc: [{ id: 1, title: 'Problem set 6', due: 'Sep 10', priority: 'high', done: false }],
  cs: [
    { id: 2, title: 'Read chapter 3', due: 'Sep 9', priority: 'low', done: true },
    { id: 3, title: 'Lab 2 writeup', due: 'Sep 12', priority: 'med', done: false },
  ],
};

function fmtHour(h: number) {
  const hour12 = h % 1 === 0 ? (h > 12 ? h - 12 : h) : (Math.floor(h) > 12 ? Math.floor(h) - 12 : Math.floor(h));
  const mins = h % 1 === 0 ? '00' : '30';
  return `${hour12}:${mins}`;
}

export function SchoolPage() {
  const { classes } = useSchool();
  const [homework, setHomework] = useState(INITIAL_HOMEWORK);
  const [openClassId, setOpenClassId] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const dueRef = useRef<HTMLInputElement>(null);
  const priorityRef = useRef<HTMLSelectElement>(null);

  const toggleHomework = (classId: string, id: number) => {
    setHomework((s) => ({ ...s, [classId]: (s[classId] || []).map((h) => (h.id === id ? { ...h, done: !h.done } : h)) }));
  };

  const addHomework = () => {
    if (!openClassId) return;
    const title = titleRef.current?.value || 'New assignment';
    const dueRaw = dueRef.current?.value;
    const priority = (priorityRef.current?.value as Homework['priority']) || 'med';
    const due = dueRaw ? new Date(`${dueRaw}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No date';
    setHomework((s) => ({ ...s, [openClassId]: [...(s[openClassId] || []), { id: Date.now(), title, due, priority, done: false }] }));
    if (titleRef.current) titleRef.current.value = '';
    if (dueRef.current) dueRef.current.value = '';
  };

  const hourLabels: string[] = [];
  for (let h = START_HOUR; h < END_HOUR; h++) hourLabels.push(h > 12 ? `${h - 12}pm` : h === 12 ? '12pm' : `${h}am`);

  const totalHours = END_HOUR - START_HOUR;
  const dayColumns = DAYS.map((day) => {
    const dayClasses = classes.filter((c) => c.days.includes(day)).map((c) => {
      const topPct = ((c.start - START_HOUR) / totalHours) * 100;
      const heightPct = ((c.end - c.start) / totalHours) * 100;
      const hw = homework[c.id] || [];
      return {
        ...c,
        time: `${fmtHour(c.start)}–${fmtHour(c.end)}`,
        posStyle: { top: `${topPct}%`, height: `${heightPct}%` },
        hasHomework: hw.some((h) => !h.done),
      };
    });
    return { day, classes: dayClasses };
  });

  const cls = classes.find((c) => c.id === openClassId);
  const panelHomework = cls ? (homework[cls.id] || []) : [];

  return (
    <div className="page">
      <PageHeader kicker="School" title="Class Schedule" actions={<span className="tag tag-outline">Fall term</span>} />

      <Widget>
        <div className="week-grid">
          <div />
          {DAYS.map((d) => <div className="week-head" key={d}>{d}</div>)}
          <div style={{ gridColumn: '1/2', display: 'flex', flexDirection: 'column' }}>
            {hourLabels.map((h) => <div className="time-label" style={{ height: 56 }} key={h}>{h}</div>)}
          </div>
          {dayColumns.map((col) => (
            <div className="day-col" key={col.day}>
              {col.classes.map((c) => (
                <div className="class-block" style={c.posStyle} onClick={() => setOpenClassId(c.id)} key={c.id}>
                  <span className="cb-name">{c.name}</span>
                  <span className="cb-meta">{c.time} &middot; {c.room}</span>
                  {c.hasHomework && <span className="cb-hw" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Widget>

      {classes.length === 0 && (
        <div className="empty-msg">No classes yet — add some in Settings.</div>
      )}

      {cls && (
        <div className="dialog-backdrop" onClick={() => setOpenClassId(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px,100%)' }}>
            <div className="dialog-title">{cls.name}</div>
            <div className="dialog-body" style={{ marginBottom: 4 }}>{fmtHour(cls.start)}&ndash;{fmtHour(cls.end)} &middot; {cls.room} &middot; {cls.days.join('/')}</div>

            <h4 style={{ marginTop: 8 }}>Homework</h4>
            <div>
              {panelHomework.map((hw) => (
                <div className="hw-row" key={hw.id}>
                  <div className={`hw-check${hw.done ? ' done' : ''}`} onClick={() => toggleHomework(cls.id, hw.id)}>
                    {hw.done && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span className={`hw-title${hw.done ? ' done' : ''}`}>{hw.title}</span>
                    <span className="text-muted" style={{ fontSize: 11 }}>Due {hw.due}</span>
                  </div>
                  <span className={`tag ${PRIORITY_CLASS[hw.priority]}`}>{PRIORITY_LABEL[hw.priority]}</span>
                </div>
              ))}
              {panelHomework.length === 0 && <div className="empty-msg" style={{ fontSize: 12, padding: '8px 0' }}>No homework yet</div>}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 2, minWidth: 160 }}><label>New assignment</label><input className="input" type="text" ref={titleRef} placeholder="e.g. Problem set 4" /></div>
              <div className="field" style={{ flex: 1, minWidth: 130 }}><label>Due date</label><input className="input" type="date" ref={dueRef} /></div>
              <div className="field" style={{ flex: 1, minWidth: 110 }}>
                <label>Priority</label>
                <select className="input" ref={priorityRef} defaultValue="med">
                  <option value="high">High</option>
                  <option value="med">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setOpenClassId(null)}>Close</button>
              <button className="btn btn-primary" type="button" onClick={addHomework}>Add homework</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
