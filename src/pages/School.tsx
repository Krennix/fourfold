import { useEffect, useRef, useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useSchool, WEEKDAYS, type Weekday } from '../state/SchoolContext';
import { fetchBellSchedule, isNoSchoolDay, isoToLocalHour, type BellSchedule } from '../lib/harkerBell';
import './School.css';

interface Homework {
  id: number;
  title: string;
  due: string;
  priority: 'high' | 'med' | 'low';
  done: boolean;
}

const SCHOOL_START = 8 + 10 / 60; // 8:10am
const SCHOOL_END = 15 + 25 / 60; // 3:25pm
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
  const totalMins = Math.round(h * 60);
  const hour24 = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(mins).padStart(2, '0')}`;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayOf(d: Date) {
  const date = new Date(d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function SchoolPage() {
  const { classes, presets, overrides, setOverride } = useSchool();
  const [homework, setHomework] = useState(INITIAL_HOMEWORK);
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [menuDate, setMenuDate] = useState<string | null>(null);
  const [bellSchedules, setBellSchedules] = useState<Record<string, BellSchedule | null>>({});

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

  const weekDates = WEEKDAYS.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const today = new Date();

  useEffect(() => {
    let cancelled = false;
    Promise.all(weekDates.map((d) => fetchBellSchedule(d).then((sched) => [dateKey(d), sched] as const).catch(() => [dateKey(d), null] as const)))
      .then((entries) => {
        if (cancelled) return;
        setBellSchedules((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const bellHours = weekDates.flatMap((d) => {
    const sched = bellSchedules[dateKey(d)];
    if (!sched || isNoSchoolDay(sched)) return [];
    return sched.schedule.flatMap((p) => [isoToLocalHour(p.start), isoToLocalHour(p.end)]);
  });

  const allTimes = [
    ...classes.flatMap((c) => c.meetings.flatMap((m) => [m.start, m.end])),
    ...presets.flatMap((p) => p.meetings.flatMap((m) => [m.start, m.end])),
    ...bellHours,
  ];
  const START_HOUR = allTimes.length ? Math.min(SCHOOL_START, ...allTimes) : SCHOOL_START;
  const END_HOUR = allTimes.length ? Math.max(SCHOOL_END, ...allTimes) : SCHOOL_END;
  const totalHours = END_HOUR - START_HOUR;

  const hourLabels: { h: number; label: string }[] = [];
  for (let h = Math.ceil(START_HOUR); h < END_HOUR; h++) {
    hourLabels.push({ h, label: h > 12 ? `${h - 12}pm` : h === 12 ? '12pm' : `${h}am` });
  }

  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));

  const dayColumns = WEEKDAYS.map((day: Weekday, i) => {
    const date = weekDates[i];
    const key = dateKey(date);
    const override = overrides[key];

    let blocks: { classId: string; name: string; room: string; start: number; end: number }[];
    if (override) {
      const preset = presets.find((p) => p.id === override.presetId);
      blocks = preset
        ? preset.meetings.map((m) => {
            const cls = classById[m.classId];
            return { classId: m.classId, name: cls?.name ?? 'Unknown', room: cls?.room ?? '', start: m.start, end: m.end };
          })
        : [];
    } else {
      blocks = classes.flatMap((c) => c.meetings.filter((m) => m.day === day).map((m) => ({ classId: c.id, name: c.name, room: c.room, start: m.start, end: m.end })));
    }

    const positioned = [...blocks]
      .sort((a, b) => a.start - b.start)
      .map((b) => {
        const topPct = ((b.start - START_HOUR) / totalHours) * 100;
        const heightPct = ((b.end - b.start) / totalHours) * 100;
        const hw = homework[b.classId] || [];
        return {
          ...b,
          time: `${fmtHour(b.start)}–${fmtHour(b.end)}`,
          posStyle: { top: `${topPct}%`, height: `${heightPct}%` },
          hasHomework: hw.some((h) => !h.done),
        };
      });

    const bell = bellSchedules[key];
    const bellNoSchool = bell ? isNoSchoolDay(bell) : false;
    const bellPeriods = bell && !bellNoSchool
      ? bell.schedule.map((p, idx) => {
          const start = isoToLocalHour(p.start);
          const end = isoToLocalHour(p.end);
          return {
            key: `${key}-bell-${idx}`,
            name: p.name,
            posStyle: { top: `${((start - START_HOUR) / totalHours) * 100}%`, height: `${((end - start) / totalHours) * 100}%` },
          };
        })
      : [];

    return {
      day, date, key,
      isOverridden: !!override,
      isSpecialNoSchool: override ? !presets.find((p) => p.id === override.presetId) : false,
      classes: positioned,
      bell,
      bellNoSchool,
      bellPeriods,
    };
  });

  const cls = classes.find((c) => c.id === openClassId);
  const panelHomework = cls ? (homework[cls.id] || []) : [];

  const weekLabel = `${weekDates[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekDates[4].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const applyOverride = (dateKeys: string[], presetId: string | null) => {
    setOverride(dateKeys, { presetId });
    setMenuDate(null);
  };
  const clearOverride = (dateKeys: string[]) => {
    setOverride(dateKeys, null);
    setMenuDate(null);
  };

  return (
    <div className="page">
      <PageHeader kicker="School" title="Class Schedule" actions={<span className="tag tag-outline">Fall term</span>} />

      <Widget>
        <div className="widget-head" style={{ justifyContent: 'flex-start', gap: 'var(--space-3)' }}>
          <button className="btn btn-icon" type="button" onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <h3 style={{ minWidth: 220 }}>{weekLabel}</h3>
          <button className="btn btn-icon" type="button" onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setWeekStart(mondayOf(new Date()))} style={{ marginLeft: 'var(--space-2)' }}>This week</button>
        </div>

        <div className="week-grid">
          <div />
          {dayColumns.map((col) => (
            <div className="week-head-cell" key={col.key}>
              <div className={`week-head${isSameDate(col.date, today) ? ' is-today' : ''}`}>
                {col.day} <span className="week-head-date">{col.date.getDate()}</span>
              </div>
              <div className="day-menu-wrap">
                <button
                  className={`day-menu-btn${col.isOverridden ? ' active' : ''}`}
                  type="button"
                  onClick={() => setMenuDate(menuDate === col.key ? null : col.key)}
                >
                  {col.isOverridden ? (col.isSpecialNoSchool ? 'No school' : 'Special') : 'Normal'}
                </button>
                {menuDate === col.key && (
                  <div className="day-menu">
                    <button className="day-menu-item" type="button" onClick={() => clearOverride([col.key])}>Normal schedule</button>
                    {presets.map((p) => (
                      <button className="day-menu-item" type="button" key={p.id} onClick={() => applyOverride([col.key], p.id)}>{p.name}</button>
                    ))}
                    <button className="day-menu-item" type="button" onClick={() => applyOverride([col.key], null)}>No school</button>
                    <div className="day-menu-divider" />
                    <button className="day-menu-item" type="button" onClick={() => clearOverride(dayColumns.map((c) => c.key))}>Reset whole week</button>
                  </div>
                )}
              </div>
              {col.bell && (
                col.bellNoSchool ? (
                  <span className="tag bell-badge bell-badge-off">{col.bell.name || 'No school'}</span>
                ) : (
                  <span className="tag bell-badge" title={col.bell.name}>
                    {col.bell.code.trim() ? `${col.bell.code.trim()} Day` : 'Bell schedule'}
                    {col.bell.variant ? ` · ${col.bell.name || col.bell.variant}` : ''}
                  </span>
                )
              )}
            </div>
          ))}
          <div style={{ gridColumn: '1/2', position: 'relative', height: totalHours * 56 }}>
            {hourLabels.map(({ h, label }) => (
              <div className="time-label" style={{ position: 'absolute', top: `${((h - START_HOUR) / totalHours) * 100}%`, right: 0, left: 0 }} key={h}>{label}</div>
            ))}
          </div>
          {dayColumns.map((col) => (
            <div className="day-col" style={{ height: totalHours * 56 }} key={col.key}>
              {col.bellPeriods.map((p) => (
                <div className="bell-block" style={p.posStyle} key={p.key} title={p.name}>
                  <span className="bb-name">{p.name}</span>
                </div>
              ))}
              {col.classes.map((c) => (
                <div className="class-block" style={c.posStyle} onClick={() => setOpenClassId(c.classId)} key={`${col.key}-${c.classId}-${c.start}`}>
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
            <div className="dialog-body" style={{ marginBottom: 4 }}>
              {cls.room} &middot; {cls.meetings.map((m) => `${m.day} ${fmtHour(m.start)}–${fmtHour(m.end)}`).join(', ')}
            </div>

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
