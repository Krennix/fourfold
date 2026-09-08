import { useMemo, useState } from 'react';
import { useSchool } from '../state/SchoolContext';
import { useCalendarEvents, type CalEvent, type EventExtras } from '../state/CalendarContext';
import { MentionField } from './MentionField';

function toDurationMin(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? mins : 60;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Create/edit dialog for a calendar event. `initialDate` (YYYY-MM-DD) pre-fills the date, e.g.
 * when opened by clicking a day cell rather than the generic "Add event" button.
 */
export function EventDialog({
  initialDate,
  editing,
  onClose,
}: {
  initialDate: string;
  editing?: CalEvent | null;
  onClose: () => void;
}) {
  const { classes } = useSchool();
  const { events, addEvent, updateEvent } = useCalendarEvents();

  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [location, setLocation] = useState(editing?.location ?? '');
  const [date, setDate] = useState(editing ? isoFromKey(editing.date) : initialDate);
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [startTime, setStartTime] = useState(editing && !editing.allDay ? to24h(editing.time) : '09:00');
  const [endTime, setEndTime] = useState(
    editing && !editing.allDay && editing.durationMin
      ? addMinutesToTime(to24h(editing.time), editing.durationMin)
      : '10:00',
  );

  const locationSuggestions = useMemo(() => {
    const rooms = classes.map((c) => c.room).filter(Boolean);
    const usedLocations = events.map((e) => e.location).filter((l): l is string => !!l);
    return [...new Set([...rooms, ...usedLocations])];
  }, [classes, events]);

  const canSave = title.trim().length > 0 && date.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const [y, m, d] = date.split('-').map(Number);
    const dateKey = `${y}-${m - 1}-${d}`;
    const extras: EventExtras = { description: description.trim(), location: location.trim(), allDay };
    const durationMin = allDay ? undefined : toDurationMin(startTime, endTime);
    const time = allDay ? '' : startTime;
    if (editing) {
      updateEvent(editing.id, dateKey, title.trim(), time, durationMin, extras);
    } else {
      addEvent(dateKey, title.trim(), time, durationMin, extras);
    }
    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{editing ? 'Edit event' : 'Add event'}</div>

        <div className="event-dialog-timing">
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Date</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', paddingBottom: 10 }}>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              All day
            </label>
          </div>
          {!allDay && (
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="field" style={{ flex: 1 }}>
                <label>From</label>
                <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>To</label>
                <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <label>Title</label>
          <MentionField value={title} onChange={setTitle} placeholder="Event title" autoFocus />
        </div>

        <div className="field">
          <label>Description</label>
          <MentionField value={description} onChange={setDescription} placeholder="Add any extra details (optional)" multiline />
        </div>

        <div className="field">
          <label>Location</label>
          <input
            className="input"
            type="text"
            list="event-location-options"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Room, address…"
          />
          <datalist id="event-location-options">
            {locationSuggestions.map((loc) => <option value={loc} key={loc} />)}
          </datalist>
        </div>

        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" disabled={!canSave} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

/** "Y-M-D" (0-based month) -> "YYYY-MM-DD" for a date input. */
function isoFromKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Best-effort parse of a display time ("9:00 AM", "14:30") back into 24h "HH:MM" for a time input. */
function to24h(display: string): string {
  const match = display.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '09:00';
  let h = Number(match[1]);
  const m = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}
