import { useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useSchool, type SchoolClass, type Preset } from '../state/SchoolContext';
import { useGoogleAuth, type LinkedAccount } from '../state/GoogleAuthContext';
import { GoogleCalendarPicker } from '../components/GoogleCalendarPicker';
import { useSchoology } from '../state/SchoologyContext';
import { useAuth } from '../state/AuthContext';
import { allCategories, matchCategoryToClass } from '../lib/homeworkMerge';
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

function AccountRow({ account }: { account: LinkedAccount }) {
  const { reconnectAccount, disconnectAccount, updateAccountCalendars } = useGoogleAuth();
  const [editing, setEditing] = useState(false);
  const selectedCalendars = account.calendars.filter((c) => c.selected);

  return (
    <div className="class-row">
      <div className="class-row-main">
        <span className="class-row-name">{account.email}</span>
        <span className="class-row-meta text-muted">
          {account.status === 'error' && (account.error || 'Needs reconnecting')}
          {account.status === 'connecting' && 'Connecting…'}
          {account.status === 'signed-in' &&
            (selectedCalendars.length > 0
              ? selectedCalendars.map((c) => c.summary).join(', ')
              : 'No calendars selected yet')}
        </span>
      </div>
      <div className="class-row-actions">
        {account.status === 'signed-in' && account.accessToken && (
          <button className="btn btn-ghost" type="button" onClick={() => setEditing(true)}>Edit calendars</button>
        )}
        {account.status === 'error' && (
          <button className="btn btn-ghost" type="button" onClick={() => reconnectAccount(account.email)}>Reconnect</button>
        )}
        <button className="btn btn-ghost" type="button" onClick={() => disconnectAccount(account.email)}>Disconnect</button>
      </div>
      {editing && account.accessToken && (
        <GoogleCalendarPicker
          accountEmail={account.email}
          accessToken={account.accessToken}
          initialSelection={account.calendars}
          onCancel={() => setEditing(false)}
          onSave={(calendars) => {
            updateAccountCalendars(account.email, calendars);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function GoogleCalendarSettings() {
  const { status, accounts, connecting, connectError, connectNewAccount, pendingPicker, dismissPendingPicker, updateAccountCalendars } = useGoogleAuth();

  return (
    <Widget>
      <div className="widget-head">
        <h4>Google Calendar</h4>
        {status === 'ready' && (
          <button className="btn btn-primary" type="button" onClick={connectNewAccount} disabled={connecting}>
            {connecting ? 'Connecting…' : accounts.length > 0 ? 'Add another Google account' : 'Connect Google Calendar'}
          </button>
        )}
      </div>

      {status === 'ready' && accounts.length > 0 && (
        <div className="class-list">
          {accounts.map((account) => <AccountRow account={account} key={account.email} />)}
        </div>
      )}
      {status === 'ready' && accounts.length === 0 && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          Not connected yet. The Calendar page falls back to a local, device-only schedule until you connect an account.
        </p>
      )}
      {connectError && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0, color: 'var(--danger, #c0392b)' }}>{connectError}</p>
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

      {pendingPicker && (
        <GoogleCalendarPicker
          accountEmail={pendingPicker.email}
          accessToken={pendingPicker.accessToken}
          initialSelection={[]}
          onCancel={dismissPendingPicker}
          onSave={(calendars) => updateAccountCalendars(pendingPicker.email, calendars)}
        />
      )}
    </Widget>
  );
}

function SchoologySettings() {
  const { status, icsUrl, error, saveIcsUrl, refresh } = useSchoology();
  const [draft, setDraft] = useState(icsUrl ?? '');
  const [dirty, setDirty] = useState(false);

  const shown = dirty ? draft : (icsUrl ?? draft);

  const handleSave = () => {
    setDirty(false);
    void saveIcsUrl(draft.trim());
  };

  return (
    <Widget>
      <div className="widget-head">
        <h4>Schoology homework</h4>
        {icsUrl && (
          <button className="btn btn-ghost" type="button" onClick={() => void refresh()} disabled={status === 'loading'}>
            {status === 'loading' ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Paste your personal Schoology calendar feed URL to pull assignment due dates onto the School tab. In Schoology,
        go to <strong>Courses → Upcoming Assignments</strong> (or your Calendar), find <strong>Export/Subscribe</strong>,
        and copy the <code>.ics</code> link it gives you.
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          type="url"
          style={{ flex: 1, minWidth: 240 }}
          placeholder="https://.../feed/....ics"
          value={shown}
          onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
        />
        <button className="btn btn-primary" type="button" onClick={handleSave} disabled={status === 'loading' || !draft.trim()}>
          Save
        </button>
      </div>
      {error && <p className="text-muted" style={{ fontSize: 12.5, margin: 0, color: 'var(--danger, #c0392b)' }}>{error}</p>}
      {icsUrl && !error && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Connected. Assignments now show up on the School tab.</p>
      )}
    </Widget>
  );
}

function SchoologyClassMappingSettings() {
  const { assignments } = useSchoology();
  const { classes, classMappings, setClassMapping, classKeywords, setClassKeywords } = useSchool();
  const categories = allCategories(assignments);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({});

  return (
    <Widget>
      <div className="widget-head"><h4>Schoology course mapping</h4></div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Assignments are matched to a class by course name when the feed provides one, and by keywords you set below
        (checked against each assignment's title/description) otherwise.
      </p>

      {categories.length > 0 && (
        <div className="class-list">
          {categories.map((cat) => {
            const key = cat.trim().toLowerCase();
            const current = classMappings[key] ?? matchCategoryToClass(cat, classes, {}) ?? '';
            const isAuto = !classMappings[key];
            return (
              <div className="class-row" key={cat}>
                <div className="class-row-main">
                  <span className="class-row-name">{cat}</span>
                  {isAuto && current && <span className="class-row-meta text-muted">Auto-matched to {classes.find((c) => c.id === current)?.name}</span>}
                  {!current && <span className="class-row-meta text-muted">Unmatched</span>}
                </div>
                <select
                  className="input"
                  style={{ maxWidth: 200 }}
                  value={current}
                  onChange={(e) => setClassMapping(cat, e.target.value || null)}
                >
                  <option value="">No class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
      {categories.length === 0 && (
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
          No course names were found in your feed — use the keywords below to route assignments to classes instead.
        </p>
      )}

      <div className="class-list" style={{ marginTop: 'var(--space-2)' }}>
        {classes.map((c) => {
          const stored = (classKeywords[c.id] || []).join(', ');
          const shown = keywordDrafts[c.id] ?? stored;
          return (
            <div className="class-row" key={c.id}>
              <div className="class-row-main">
                <span className="class-row-name">{c.name}</span>
                <span className="class-row-meta text-muted">Keywords (comma-separated) matched against assignment title/description</span>
              </div>
              <input
                className="input"
                style={{ maxWidth: 220 }}
                type="text"
                placeholder="e.g. Chem, CHEM101"
                value={shown}
                onChange={(e) => setKeywordDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                onBlur={() => setClassKeywords(c.id, shown.split(','))}
              />
            </div>
          );
        })}
        {classes.length === 0 && <div className="empty-msg">Add a class first.</div>}
      </div>
    </Widget>
  );
}

function fmtHour(h: number) {
  const totalMins = Math.round(h * 60);
  const hour24 = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(mins).padStart(2, '0')}`;
}
function timeToHourValue(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h + m / 60;
}
function hourValueToTime(h: number) {
  const totalMins = Math.round(h * 60);
  const hour = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

const BELL_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

interface DayFormRow {
  enabled: boolean;
  start: string;
  end: string;
}
type ClassFormState = { name: string; room: string; periods: number[] };

function emptyClassForm(): ClassFormState {
  return { name: '', room: '', periods: [] };
}

function classToForm(c: SchoolClass): ClassFormState {
  return { name: c.name, room: c.room, periods: [...c.periods] };
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
  const { classes, addClass, updateClass, removeClass, presets, addPreset, updatePreset, removePreset, showBreaks, setShowBreaks } = useSchool();

  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classForm, setClassForm] = useState<ClassFormState>(emptyClassForm());

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetForm, setPresetForm] = useState<PresetFormState>(emptyPresetForm([]));

  const startEditClass = (c: SchoolClass) => { setEditingClassId(c.id); setClassForm(classToForm(c)); };
  const startAddClass = () => { setEditingClassId('new'); setClassForm(emptyClassForm()); };
  const cancelClass = () => { setEditingClassId(null); setClassForm(emptyClassForm()); };

  const saveClass = () => {
    if (!classForm.name.trim()) return;
    const payload = { name: classForm.name.trim(), room: classForm.room.trim(), periods: [...classForm.periods].sort((a, b) => a - b) };
    if (editingClassId && editingClassId !== 'new') updateClass(editingClassId, payload);
    else addClass(payload);
    cancelClass();
  };
  const togglePeriod = (p: number) => {
    setClassForm((f) => ({ ...f, periods: f.periods.includes(p) ? f.periods.filter((x) => x !== p) : [...f.periods, p] }));
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
      <SchoologySettings />
      <SchoologyClassMappingSettings />

      <Widget>
        <div className="widget-head">
          <h4>Bell schedule</h4>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={showBreaks} onChange={(e) => setShowBreaks(e.target.checked)} />
          <span>Show breaks, lunch, advisory &amp; office hours on the School tab</span>
        </label>
      </Widget>

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
          Assign each class to the bell-schedule periods it meets during (e.g. Period 1). The School tab looks up the
          real Harker bell schedule each day to figure out when that period actually happens.
        </p>

        {classes.length === 0 && !isClassFormOpen && <div className="empty-msg">No classes yet — add your first one.</div>}

        <div className="class-list">
          {classes.map((c) => (
            <div className="class-row" key={c.id}>
              <div className="class-row-main">
                <span className="class-row-name">{c.name}</span>
                <span className="class-row-meta text-muted">
                  {c.room || 'No room'} &middot; {c.periods.length ? c.periods.map((p) => `Period ${p}`).join(', ') : 'No periods assigned'}
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
              <label>Periods</label>
              <div className="period-chips">
                {BELL_PERIODS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`period-chip${classForm.periods.includes(p) ? ' active' : ''}`}
                    onClick={() => togglePeriod(p)}
                  >
                    {p}
                  </button>
                ))}
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
