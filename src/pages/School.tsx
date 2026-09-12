import { useEffect, useMemo, useRef, useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useSchool, WEEKDAYS, type Weekday, type Homework } from '../state/SchoolContext';
import { useSchoology } from '../state/SchoologyContext';
import { useCanvas } from '../state/CanvasContext';
import { useClassroom } from '../state/ClassroomContext';
import { fetchBellSchedule, findNextClassMeeting, findPeriod, isNoSchoolDay, isoToLocalHour, type BellSchedule } from '../lib/harkerBell';
import { classBadge, mergeHomeworkForClass, type MergedHomeworkItem } from '../lib/homeworkMerge';
import './School.css';

const SCHOOL_START = 8 + 10 / 60; // 8:10am
const SCHOOL_END = 15 + 25 / 60; // 3:25pm
const PRIORITY_LABEL: Record<Homework['priority'], string> = { high: 'High', med: 'Medium', low: 'Low' };
const PRIORITY_CLASS: Record<Homework['priority'], string> = { high: 'pill-high', med: 'pill-med', low: 'pill-low' };

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

function fmtDueDisplay(due: string | null) {
  if (!due) return 'No date';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return 'No date';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SchoolPage() {
  const {
    classes, presets, overrides, setOverride, showBreaks, homework,
    addHomework: addHomeworkToClass, updateHomework, removeHomework, toggleHomework, schoologyDone, toggleSchoologyHomeworkDone, classMappings, classKeywords,
  } = useSchool();
  const { assignments: schoologyAssignments } = useSchoology();
  const { assignments: canvasAssignments } = useCanvas();
  const { assignments: classroomAssignments } = useClassroom();
  const assignments = useMemo(
    () => [...schoologyAssignments, ...canvasAssignments, ...classroomAssignments],
    [schoologyAssignments, canvasAssignments, classroomAssignments],
  );
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [menuDate, setMenuDate] = useState<string | null>(null);
  const [bellSchedules, setBellSchedules] = useState<Record<string, BellSchedule | null>>({});
  const [nextMeetingDate, setNextMeetingDate] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const dueRef = useRef<HTMLInputElement>(null);
  const priorityRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    setShowCompleted(false);
    setEditingId(null);
    if (!openClassId) {
      setNextMeetingDate(null);
      return;
    }
    const cls = classes.find((c) => c.id === openClassId);
    if (!cls) {
      setNextMeetingDate(null);
      return;
    }
    let cancelled = false;
    findNextClassMeeting(openClassId, cls.periods, overrides, presets).then((date) => {
      if (!cancelled) setNextMeetingDate(date);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openClassId]);

  const clearHomeworkForm = () => {
    if (titleRef.current) titleRef.current.value = '';
    if (descriptionRef.current) descriptionRef.current.value = '';
    if (dueRef.current) dueRef.current.value = '';
    if (priorityRef.current) priorityRef.current.value = 'med';
  };

  const saveHomework = () => {
    if (!openClassId) return;
    const title = titleRef.current?.value || 'New assignment';
    const description = descriptionRef.current?.value.trim() || undefined;
    const due = dueRef.current?.value || '';
    const priority = (priorityRef.current?.value as Homework['priority']) || 'med';
    if (editingId != null) {
      updateHomework(openClassId, editingId, { title, description, due, priority });
      setEditingId(null);
    } else {
      addHomeworkToClass(openClassId, { title, description, due, priority });
    }
    clearHomeworkForm();
  };

  const startEditHomework = (hw: MergedHomeworkItem) => {
    if (hw.source !== 'manual' || hw.homeworkId === undefined) return;
    setEditingId(hw.homeworkId);
    if (titleRef.current) titleRef.current.value = hw.title;
    if (descriptionRef.current) descriptionRef.current.value = hw.description || '';
    if (dueRef.current) dueRef.current.value = hw.due || '';
    if (priorityRef.current) priorityRef.current.value = hw.priorityLabel || 'med';
  };

  const cancelEditHomework = () => {
    setEditingId(null);
    clearHomeworkForm();
  };

  const deleteHomework = (hw: MergedHomeworkItem) => {
    if (!openClassId || hw.source !== 'manual' || hw.homeworkId === undefined) return;
    if (editingId === hw.homeworkId) cancelEditHomework();
    removeHomework(openClassId, hw.homeworkId);
  };

  const mergedByClass = useMemo(() => {
    const out: Record<string, MergedHomeworkItem[]> = {};
    for (const c of classes) {
      out[c.id] = mergeHomeworkForClass(c.id, homework[c.id] || [], assignments, classes, classMappings, classKeywords, schoologyDone);
    }
    return out;
  }, [classes, homework, assignments, classMappings, classKeywords, schoologyDone]);

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
    const bell = bellSchedules[key];
    const bellNoSchool = bell ? isNoSchoolDay(bell) : false;

    const usedPeriods = new Set<number>();
    let blocks: { classId: string; name: string; room: string; start: number; end: number }[];
    if (override) {
      const preset = presets.find((p) => p.id === override.presetId);
      blocks = preset
        ? preset.meetings.map((m) => {
            const cls = classById[m.classId];
            return { classId: m.classId, name: cls?.name ?? 'Unknown', room: cls?.room ?? '', start: m.start, end: m.end };
          })
        : [];
    } else if (bell && !bellNoSchool) {
      blocks = classes.flatMap((c) =>
        c.periods.flatMap((periodNum) => {
          const period = findPeriod(bell, periodNum);
          if (!period) return [];
          usedPeriods.add(periodNum);
          return [{ classId: c.id, name: c.name, room: c.room, start: isoToLocalHour(period.start), end: isoToLocalHour(period.end) }];
        }),
      );
    } else {
      blocks = [];
    }

    const nowHour = now.getHours() + now.getMinutes() / 60;
    const isToday = isSameDate(date, now);

    const positioned = [...blocks]
      .sort((a, b) => a.start - b.start)
      .map((b) => {
        const topPct = ((b.start - START_HOUR) / totalHours) * 100;
        const heightPct = ((b.end - b.start) / totalHours) * 100;
        const openItems = (mergedByClass[b.classId] || []).filter((h) => !h.done);
        const inProgress = isToday && nowHour >= b.start && nowHour < b.end;
        const minutesLeft = inProgress ? Math.max(0, Math.round((b.end - nowHour) * 60)) : 0;
        return {
          ...b,
          time: `${fmtHour(b.start)}–${fmtHour(b.end)}`,
          posStyle: { top: `${topPct}%`, height: `${heightPct}%` },
          badge: classBadge(openItems),
          inProgress,
          minutesLeft,
        };
      });

    const bellPeriods = bell && !bellNoSchool && !override
      ? bell.schedule.flatMap((p, idx) => {
          const name = p.name.trim();
          if (!name) return [];
          const match = /^class\s+(\d+)$/i.exec(name);
          const variant: 'open' | 'break' = match ? 'open' : 'break';
          if (variant === 'open' && usedPeriods.has(Number(match![1]))) return [];
          if (variant === 'break' && !showBreaks) return [];
          const start = isoToLocalHour(p.start);
          const end = isoToLocalHour(p.end);
          return [{
            key: `${key}-bell-${idx}`,
            label: variant === 'open' ? `Period ${match![1]}` : name,
            variant,
            posStyle: { top: `${((start - START_HOUR) / totalHours) * 100}%`, height: `${((end - start) / totalHours) * 100}%` },
          }];
        })
      : [];

    const showDayNowLine = isToday && nowHour >= START_HOUR && nowHour <= END_HOUR;
    const dayNowLinePct = showDayNowLine ? ((nowHour - START_HOUR) / totalHours) * 100 : 0;

    return {
      day, date, key,
      isOverridden: !!override,
      isSpecialNoSchool: override ? !presets.find((p) => p.id === override.presetId) : false,
      classes: positioned,
      bell,
      bellNoSchool,
      bellPeriods,
      showDayNowLine,
      dayNowLinePct,
    };
  });

  const cls = classes.find((c) => c.id === openClassId);
  const panelMerged = cls ? (mergedByClass[cls.id] || []) : [];
  const panelOpen = panelMerged.filter((h) => !h.done);
  const panelCompleted = panelMerged.filter((h) => h.done);

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
          <h3 style={{ minWidth: 0 }}>{weekLabel}</h3>
          <button className="btn btn-icon" type="button" onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setWeekStart(mondayOf(new Date()))} style={{ marginLeft: 'var(--space-2)' }}>This week</button>
        </div>

        <div className="week-grid-scroll">
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
            {dayColumns.some((col) => col.showDayNowLine) && (
              <div
                className="time-label now-time-label"
                style={{ position: 'absolute', top: `${((now.getHours() + now.getMinutes() / 60 - START_HOUR) / totalHours) * 100}%`, right: 0, left: 0 }}
              >
                {fmtHour(now.getHours() + now.getMinutes() / 60)}
              </div>
            )}
          </div>
          {dayColumns.map((col) => (
            <div className="day-col" style={{ height: totalHours * 56 }} key={col.key}>
              {col.showDayNowLine && (
                <div className="day-now-line" style={{ top: `${col.dayNowLinePct}%` }}>
                  <span className="day-now-dot" />
                </div>
              )}
              {col.bellPeriods.map((p) => (
                <div className={`bell-block bell-block-${p.variant}`} style={p.posStyle} key={p.key}>
                  <span className="bb-name">{p.label}</span>
                </div>
              ))}
              {col.classes.map((c) => (
                <div className={`class-block${c.inProgress ? ' in-progress' : ''}`} style={c.posStyle} onClick={() => setOpenClassId(c.classId)} key={`${col.key}-${c.classId}-${c.start}`}>
                  <span className="cb-name">{c.name}</span>
                  <span className="cb-meta">{c.time} &middot; {c.room}</span>
                  {c.badge && <span className={`cb-hw cb-hw-${c.badge.color}`}>{c.badge.count}</span>}
                  {c.inProgress && <span className="now-label">{c.minutesLeft} min left</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
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
              {cls.room} &middot; {cls.periods.length ? cls.periods.map((p) => `Period ${p}`).join(', ') : 'No periods assigned'}
            </div>

            <h4 style={{ marginTop: 8 }}>Homework</h4>
            <div>
              {panelOpen.map((hw) => (
                <div className="hw-row" key={hw.key}>
                  <div
                    className="hw-check"
                    onClick={() => (hw.source === 'manual' ? toggleHomework(cls.id, hw.homeworkId!) : toggleSchoologyHomeworkDone(hw.uid!))}
                  />
                  <span className={`hw-urgency-dot ${hw.urgency}`} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span className="hw-title" title={hw.description || undefined}>{hw.title}</span>
                    <span className="text-muted" style={{ fontSize: 11 }}>Due {fmtDueDisplay(hw.due)}</span>
                    {hw.description && <span className="text-muted" style={{ fontSize: 11 }}>{hw.description}</span>}
                  </div>
                  {hw.points != null && <span className="tag" style={{ opacity: 0.8 }}>{hw.points} pts</span>}
                  {hw.priorityLabel && <span className={`tag ${PRIORITY_CLASS[hw.priorityLabel]}`}>{PRIORITY_LABEL[hw.priorityLabel]}</span>}
                  {hw.source === 'manual' && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="hw-action-btn" type="button" title="Edit" onClick={() => startEditHomework(hw)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                      </button>
                      <button className="hw-action-btn" type="button" title="Delete" onClick={() => deleteHomework(hw)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {panelOpen.length === 0 && <div className="empty-msg" style={{ fontSize: 12, padding: '8px 0' }}>No homework yet</div>}

              {panelCompleted.length > 0 && (
                <div className="hw-completed-section">
                  <button className="hw-completed-toggle" type="button" onClick={() => setShowCompleted((s) => !s)}>
                    <svg className={showCompleted ? 'open' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                    Completed ({panelCompleted.length})
                  </button>
                  {showCompleted && panelCompleted.map((hw) => (
                    <div className="hw-row" key={hw.key}>
                      <div
                        className="hw-check done"
                        onClick={() => (hw.source === 'manual' ? toggleHomework(cls.id, hw.homeworkId!) : toggleSchoologyHomeworkDone(hw.uid!))}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span className="hw-title done" title={hw.description || undefined}>{hw.title}</span>
                        <span className="text-muted" style={{ fontSize: 11 }}>Due {fmtDueDisplay(hw.due)}</span>
                        {hw.description && <span className="text-muted" style={{ fontSize: 11 }}>{hw.description}</span>}
                      </div>
                      {hw.points != null && <span className="tag" style={{ opacity: 0.8 }}>{hw.points} pts</span>}
                  {hw.priorityLabel && <span className={`tag ${PRIORITY_CLASS[hw.priorityLabel]}`}>{PRIORITY_LABEL[hw.priorityLabel]}</span>}
                      {hw.source === 'manual' && (
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button className="hw-action-btn" type="button" title="Edit" onClick={() => startEditHomework(hw)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                          </button>
                          <button className="hw-action-btn" type="button" title="Delete" onClick={() => deleteHomework(hw)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 2, minWidth: 160 }}><label>{editingId != null ? 'Edit assignment' : 'New assignment'}</label><input className="input" type="text" ref={titleRef} placeholder="e.g. Problem set 4" /></div>
              <div className="field" style={{ flex: 1, minWidth: 130 }}>
                <label>Due date</label>
                <input className="input" type="date" ref={dueRef} defaultValue={nextMeetingDate ?? undefined} key={`${openClassId ?? ''}-${nextMeetingDate ?? ''}`} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 110 }}>
                <label>Priority</label>
                <select className="input" ref={priorityRef} defaultValue="med">
                  <option value="high">High</option>
                  <option value="med">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div className="field" style={{ marginTop: 6 }}>
              <label>Description</label>
              <textarea className="input" ref={descriptionRef} placeholder="Optional notes about this assignment" rows={2} />
            </div>

            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setOpenClassId(null)}>Close</button>
              {editingId != null && <button className="btn btn-secondary" type="button" onClick={cancelEditHomework}>Cancel edit</button>}
              <button className="btn btn-primary" type="button" onClick={saveHomework}>{editingId != null ? 'Save changes' : 'Add homework'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
