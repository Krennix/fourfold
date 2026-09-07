import { useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useSchool, WEEKDAYS, type Weekday, type SchoolClass, type Preset } from '../state/SchoolContext';
import { useGoogleAuth } from '../state/GoogleAuthContext';
import { useAuth } from '../state/AuthContext';
import './Settings.css';

function AccessSettings() {
  const { email, logout } = useAuth();
  return (
    <Widget>
      <div className="widget-head">
        <h4>Access</h4>
        <button className="btn btn-ghost" type="button" onClick={logout}>Sign out</button>
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Signed in as <strong>{email}</strong>. To let someone else in, add their Google account email to{' '}
        <code>ALLOWED_EMAILS</code> and redeploy.
      </p>
    </Widget>
  );
}

function GoogleCalendarSettings() {
  const { status, email, error, connect, disconnect } = useGoogleAuth();

  return (
    <Widget>
      <div className="widget-head">
        <h4>Google Calendar</h4>
        {status === 'signed-in' && <button className="btn btn-ghost" type="button" onClick={disconnect}>Disconnect</button>}
        {(status === 'signed-out' || status === 'connecting' || status === 'error') && (
          <button className="btn btn-primary" type="button" onClick={connect} disabled={status === 'connecting'}>
            {status === 'connecting' ? 'Connecting…' : 'Connect Google Calendar'}
          </button>
        )}
      </div>

      {status === 'signed-in' && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          Connected as <strong>{email ?? '…'}</strong>. Events on the Calendar page now read from and write to this account.
        </p>
      )}
      {status === 'error' && error && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0, color: 'var(--danger, #c0392b)' }}>{error}</p>
      )}
      {status === 'signed-out' && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          Not connected yet. The Calendar page falls back to a local, device-only schedule until you connect.
        </p>
      )}
      {status === 'unconfigured' && (
        <>
          <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
            No Google OAuth client is configured, so sync is unavailable. To enable it:
          </p>
          <ol className="text-muted" style={{ fontSize: 12.5, marginTop: 4, paddingLeft: 18 }}>
            <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a> and create (or pick) a project.</li>
            <li>APIs &amp; Services → Library → enable the <strong>Google Calendar API</strong>.</li>
            <li>APIs &amp; Services → OAuth consent screen → set it up as External and add your own Google account as a test user.</li>
            <li>APIs &amp; Services → Credentials → Create Credentials → <strong>OAuth client ID</strong> → Application type <strong>Web application</strong> → add <code>http://localhost:5173</code> as an authorized JavaScript origin.</li>
            <li>Copy the client ID into a <code>.env</code> file at the project root as <code>VITE_GOOGLE_CLIENT_ID=&hellip;</code>, then restart the dev server.</li>
          </ol>
        </>
      )}
    </Widget>
  );
}

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

interface DayFormRow {
  enabled: boolean;
  start: string;
  end: string;
}
type ClassFormState = { name: string; room: string; days: Record<Weekday, DayFormRow> };

function emptyClassForm(): ClassFormState {
  const days = {} as Record<Weekday, DayFormRow>;
  for (const d of WEEKDAYS) days[d] = { enabled: false, start: '09:00', end: '10:00' };
  return { name: '', room: '', days };
}

function classToForm(c: SchoolClass): ClassFormState {
  const form = emptyClassForm();
  for (const m of c.meetings) {
    form.days[m.day] = { enabled: true, start: hourValueToTime(m.start), end: hourValueToTime(m.end) };
  }
  return form;
}

type PresetFormState = { name: string; classes: Record<string, DayFormRow> };

function emptyPresetForm(classIds: string[]): PresetFormState {
  const classes = {} as Record<string, DayFormRow>;
  for (const id of classIds) classes[id] = { enabled: false, start: '09:00', end: '10:00' };
  return { name: '', classes };
}

function presetToForm(p: Preset, classIds: string[]): PresetFormState {
  const form = emptyPresetForm(classIds);
  for (const m of p.meetings) {
    form.classes[m.classId] = { enabled: true, start: hourValueToTime(m.start), end: hourValueToTime(m.end) };
  }
  return form;
}

export function SettingsPage() {
  const { classes, addClass, updateClass, removeClass, presets, addPreset, updatePreset, removePreset } = useSchool();

  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classForm, setClassForm] = useState<ClassFormState>(emptyClassForm());

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetForm, setPresetForm] = useState<PresetFormState>(emptyPresetForm([]));

  const startEditClass = (c: SchoolClass) => { setEditingClassId(c.id); setClassForm(classToForm(c)); };
  const startAddClass = () => { setEditingClassId('new'); setClassForm(emptyClassForm()); };
  const cancelClass = () => { setEditingClassId(null); setClassForm(emptyClassForm()); };

  const saveClass = () => {
    if (!classForm.name.trim()) return;
    const meetings = WEEKDAYS.filter((d) => classForm.days[d].enabled).map((d) => ({
      day: d, start: timeToHourValue(classForm.days[d].start), end: timeToHourValue(classForm.days[d].end),
    }));
    if (meetings.length === 0) return;
    const payload = { name: classForm.name.trim(), room: classForm.room.trim(), meetings };
    if (editingClassId && editingClassId !== 'new') updateClass(editingClassId, payload);
    else addClass(payload);
    cancelClass();
  };

  const startEditPreset = (p: Preset) => { setEditingPresetId(p.id); setPresetForm(presetToForm(p, classes.map((c) => c.id))); };
  const startAddPreset = () => { setEditingPresetId('new'); setPresetForm(emptyPresetForm(classes.map((c) => c.id))); };
  const cancelPreset = () => { setEditingPresetId(null); setPresetForm(emptyPresetForm([])); };

  const savePreset = () => {
    if (!presetForm.name.trim()) return;
    const meetings = classes.filter((c) => presetForm.classes[c.id]?.enabled).map((c) => ({
      classId: c.id, start: timeToHourValue(presetForm.classes[c.id].start), end: timeToHourValue(presetForm.classes[c.id].end),
    }));
    const payload = { name: presetForm.name.trim(), meetings };
    if (editingPresetId && editingPresetId !== 'new') updatePreset(editingPresetId, payload);
    else addPreset(payload);
    cancelPreset();
  };

  const isClassFormOpen = editingClassId !== null;
  const isPresetFormOpen = editingPresetId !== null;

  return (
    <div className="page">
      <PageHeader kicker="Preferences" title="Settings" />

      <AccessSettings />
      <GoogleCalendarSettings />

      <Widget>
        <div className="widget-head">
          <h4>Classes</h4>
          {!isClassFormOpen && (
            <button className="btn btn-primary" type="button" onClick={startAddClass}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add class
            </button>
          )}
        </div>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          A class can meet at different times on different days. This is the normal weekly schedule shown on the School tab.
        </p>

        {classes.length === 0 && !isClassFormOpen && <div className="empty-msg">No classes yet — add your first one.</div>}

        <div className="class-list">
          {classes.map((c) => (
            <div className="class-row" key={c.id}>
              <div className="class-row-main">
                <span className="class-row-name">{c.name}</span>
                <span className="class-row-meta text-muted">
                  {c.room || 'No room'} &middot; {c.meetings.map((m) => `${m.day} ${fmtHour(m.start)}–${fmtHour(m.end)}`).join(', ')}
                </span>
              </div>
              <div className="class-row-actions">
                <button className="btn btn-ghost" type="button" onClick={() => startEditClass(c)}>Edit</button>
                <button className="btn btn-ghost" type="button" onClick={() => removeClass(c.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>

        {isClassFormOpen && (
          <div className="entity-form">
            <div className="field"><label>Class name</label><input className="input" type="text" value={classForm.name} onChange={(e) => setClassForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Calculus II" /></div>
            <div className="field"><label>Room</label><input className="input" type="text" value={classForm.room} onChange={(e) => setClassForm((f) => ({ ...f, room: e.target.value }))} placeholder="e.g. Rm 214" /></div>
            <div className="field">
              <label>Meeting times</label>
              <div className="day-time-rows">
                {WEEKDAYS.map((d) => {
                  const row = classForm.days[d];
                  return (
                    <div className="day-time-row" key={d}>
                      <label className="day-time-check">
                        <input type="checkbox" checked={row.enabled} onChange={(e) => setClassForm((f) => ({ ...f, days: { ...f.days, [d]: { ...row, enabled: e.target.checked } } }))} />
                        {d}
                      </label>
                      <input className="input" type="time" disabled={!row.enabled} value={row.start} onChange={(e) => setClassForm((f) => ({ ...f, days: { ...f.days, [d]: { ...row, start: e.target.value } } }))} />
                      <span className="text-muted">to</span>
                      <input className="input" type="time" disabled={!row.enabled} value={row.end} onChange={(e) => setClassForm((f) => ({ ...f, days: { ...f.days, [d]: { ...row, end: e.target.value } } }))} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={cancelClass}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={saveClass}>Save class</button>
            </div>
          </div>
        )}
      </Widget>

      <Widget>
        <div className="widget-head">
          <h4>Special-schedule presets</h4>
          {!isPresetFormOpen && (
            <button className="btn btn-primary" type="button" onClick={startAddPreset} disabled={classes.length === 0}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add preset
            </button>
          )}
        </div>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          A preset is an alternate day layout — like a half day or assembly schedule. Apply one to a specific day (or the
          whole week) from the School tab without changing your normal schedule.
        </p>

        {presets.length === 0 && !isPresetFormOpen && <div className="empty-msg">No presets yet.</div>}

        <div className="class-list">
          {presets.map((p) => (
            <div className="class-row" key={p.id}>
              <div className="class-row-main">
                <span className="class-row-name">{p.name}</span>
                <span className="class-row-meta text-muted">
                  {p.meetings.length === 0
                    ? 'No classes'
                    : p.meetings.map((m) => {
                        const cls = classes.find((c) => c.id === m.classId);
                        return `${cls?.name ?? 'Unknown'} ${fmtHour(m.start)}–${fmtHour(m.end)}`;
                      }).join(', ')}
                </span>
              </div>
              <div className="class-row-actions">
                <button className="btn btn-ghost" type="button" onClick={() => startEditPreset(p)}>Edit</button>
                <button className="btn btn-ghost" type="button" onClick={() => removePreset(p.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>

        {isPresetFormOpen && (
          <div className="entity-form">
            <div className="field"><label>Preset name</label><input className="input" type="text" value={presetForm.name} onChange={(e) => setPresetForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Half Day" /></div>
            <div className="field">
              <label>Classes on this day</label>
              <div className="day-time-rows">
                {classes.map((c) => {
                  const row = presetForm.classes[c.id] ?? { enabled: false, start: '09:00', end: '10:00' };
                  return (
                    <div className="day-time-row" key={c.id}>
                      <label className="day-time-check">
                        <input type="checkbox" checked={row.enabled} onChange={(e) => setPresetForm((f) => ({ ...f, classes: { ...f.classes, [c.id]: { ...row, enabled: e.target.checked } } }))} />
                        {c.name}
                      </label>
                      <input className="input" type="time" disabled={!row.enabled} value={row.start} onChange={(e) => setPresetForm((f) => ({ ...f, classes: { ...f.classes, [c.id]: { ...row, start: e.target.value } } }))} />
                      <span className="text-muted">to</span>
                      <input className="input" type="time" disabled={!row.enabled} value={row.end} onChange={(e) => setPresetForm((f) => ({ ...f, classes: { ...f.classes, [c.id]: { ...row, end: e.target.value } } }))} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={cancelPreset}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={savePreset}>Save preset</button>
            </div>
          </div>
        )}
      </Widget>
    </div>
  );
}
