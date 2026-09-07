import { useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useSchool, type SchoolClass } from '../state/SchoolContext';
import './Settings.css';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function fmtHour(h: number) {
  const hour12 = h % 1 === 0 ? (h > 12 ? h - 12 : h) : (Math.floor(h) > 12 ? Math.floor(h) - 12 : Math.floor(h));
  const mins = h % 1 === 0 ? '00' : '30';
  return `${hour12}:${mins}`;
}

function timeToHourValue(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h + (m >= 30 ? 0.5 : 0);
}

function hourValueToTime(h: number) {
  const hour = Math.floor(h);
  const mins = h % 1 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${mins}`;
}

interface FormState {
  name: string;
  room: string;
  start: string;
  end: string;
  days: string[];
}

const EMPTY_FORM: FormState = { name: '', room: '', start: '09:00', end: '10:00', days: [] };

export function SettingsPage() {
  const { classes, addClass, updateClass, removeClass } = useSchool();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const startEdit = (c: SchoolClass) => {
    setEditingId(c.id);
    setForm({ name: c.name, room: c.room, start: hourValueToTime(c.start), end: hourValueToTime(c.end), days: c.days });
  };

  const startAdd = () => {
    setEditingId('new');
    setForm(EMPTY_FORM);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const toggleDay = (day: string) => {
    setForm((f) => ({ ...f, days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day] }));
  };

  const save = () => {
    if (!form.name.trim() || form.days.length === 0) return;
    const payload = {
      name: form.name.trim(),
      room: form.room.trim(),
      start: timeToHourValue(form.start),
      end: timeToHourValue(form.end),
      days: ALL_DAYS.filter((d) => form.days.includes(d)),
    };
    if (editingId && editingId !== 'new') {
      updateClass(editingId, payload);
    } else {
      addClass(payload);
    }
    cancelEdit();
  };

  const isFormOpen = editingId !== null;

  return (
    <div className="page">
      <PageHeader kicker="Preferences" title="Settings" />

      <Widget>
        <div className="widget-head">
          <h4>Class Schedule</h4>
          {!isFormOpen && (
            <button className="btn btn-primary" type="button" onClick={startAdd}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add class
            </button>
          )}
        </div>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          These classes drive the weekly grid on the School tab. Add, edit, or remove them here.
        </p>

        {classes.length === 0 && !isFormOpen && (
          <div className="empty-msg">No classes yet — add your first one.</div>
        )}

        <div className="class-list">
          {classes.map((c) => (
            <div className="class-row" key={c.id}>
              <div className="class-row-main">
                <span className="class-row-name">{c.name}</span>
                <span className="class-row-meta text-muted">
                  {fmtHour(c.start)}&ndash;{fmtHour(c.end)} &middot; {c.room || 'No room'} &middot; {c.days.join('/')}
                </span>
              </div>
              <div className="class-row-actions">
                <button className="btn btn-ghost" type="button" onClick={() => startEdit(c)}>Edit</button>
                <button className="btn btn-ghost" type="button" onClick={() => removeClass(c.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>

        {isFormOpen && (
          <div className="class-form">
            <div className="field"><label>Class name</label><input className="input" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Calculus II" /></div>
            <div className="field"><label>Room</label><input className="input" type="text" value={form.room} onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} placeholder="e.g. Rm 214" /></div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="field" style={{ flex: 1 }}><label>Start time</label><input className="input" type="time" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} /></div>
              <div className="field" style={{ flex: 1 }}><label>End time</label><input className="input" type="time" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} /></div>
            </div>
            <div className="field">
              <label>Days</label>
              <div className="day-toggle-row">
                {ALL_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`day-toggle${form.days.includes(d) ? ' active' : ''}`}
                    onClick={() => toggleDay(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={cancelEdit}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={save}>Save class</button>
            </div>
          </div>
        )}
      </Widget>
    </div>
  );
}
