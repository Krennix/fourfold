import { useEffect, useMemo } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useMatrix } from '../state/MatrixContext';
import { useCalendarEvents } from '../state/CalendarContext';
import { useQuadrantHomework } from '../lib/useQuadrantHomework';
import { getWeekRange, isWithinDays, calendarDateKey } from '../lib/dateRange';
import './WeeklyReview.css';

export function WeeklyReviewPage() {
  const { start, end } = useMemo(() => getWeekRange(), []);
  const { tasks } = useMatrix();
  const homeworkRows = useQuadrantHomework();
  const { events, refresh } = useCalendarEvents();

  useEffect(() => {
    refresh(start, new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  const days = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      list.push({ key: calendarDateKey(d), label: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) });
    }
    return list;
  }, [start]);

  const homeworkThisWeek = useMemo(
    () => Object.values(homeworkRows).flat().filter((hw) => !hw.done && isWithinDays(hw.dueDate, 7)),
    [homeworkRows],
  );
  const matrixThisWeek = useMemo(
    () => Object.values(tasks).flat().filter((t) => !t.done && isWithinDays(t.dueDate, 7)),
    [tasks],
  );

  return (
    <div className="page">
      <PageHeader kicker={`${days[0].label} – ${days[6].label}`} title="Weekly Review" />
      <div className="weekly-grid">
        {days.map((day) => {
          const dayEvents = events.filter((e) => e.date === day.key);
          const dayHomework = homeworkThisWeek.filter((hw) => hw.dueDate && calendarDateKey(new Date(hw.dueDate)) === day.key);
          const dayTasks = matrixThisWeek.filter((t) => t.dueDate && calendarDateKey(new Date(t.dueDate)) === day.key);
          const empty = dayEvents.length === 0 && dayHomework.length === 0 && dayTasks.length === 0;
          return (
            <Widget key={day.key}>
              <div className="widget-head"><h4>{day.label}</h4></div>
              {empty && <div className="empty-msg">Nothing due.</div>}
              {dayEvents.map((e) => (
                <div className="event-row" key={e.id}>
                  <span className="event-time">{e.time}</span>
                  <span style={{ fontSize: 14 }}>{e.title}</span>
                </div>
              ))}
              {dayHomework.map((hw) => (
                <div className="event-row" key={hw.id}>
                  <span className="tag tag-neutral">{hw.listTag}</span>
                  <span style={{ fontSize: 14 }}>{hw.title}</span>
                </div>
              ))}
              {dayTasks.map((t) => (
                <div className="event-row" key={t.id}>
                  <span className="tag tag-neutral">{t.listTag}</span>
                  <span style={{ fontSize: 14 }}>{t.title}</span>
                </div>
              ))}
            </Widget>
          );
        })}
      </div>
    </div>
  );
}
