import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { useSchool, type SchoolClass, type Preset } from '../state/SchoolContext';
import { useGoogleAuth, type LinkedAccount } from '../state/GoogleAuthContext';
import { GoogleCalendarPicker } from '../components/GoogleCalendarPicker';
import { useSchoology } from '../state/SchoologyContext';
import { useCanvas } from '../state/CanvasContext';
import { useClassroom } from '../state/ClassroomContext';
import { useGoogleIcs } from '../state/GoogleIcsContext';
import { useAuth, getStoredSession } from '../state/AuthContext';
import { useTheme } from '../state/ThemeContext';
import { useNavVisibility } from '../state/NavVisibilityContext';
import { navItems } from '../lib/navItems';
import { useNotifications } from '../state/NotificationsContext';
import { allCategories, matchCategoryToClass } from '../lib/homeworkMerge';
import { ColorSwatchPicker } from '../components/ColorSwatches';
import { exportAllData, downloadJson, isValidExport, importAllData, type FourFoldExport } from '../lib/exportImport';
import './Settings.css';

function ThemeSettings() {
  const { theme, setTheme } = useTheme();
  return (
    <Widget>
      <div className="widget-head">
        <h4>Appearance</h4>
      </div>
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        {(['light', 'dark', 'system'] as const).map((t) => (
          <label className="seg-opt" key={t}>
            <input type="radio" name="theme" checked={theme === t} onChange={() => setTheme(t)} />
            {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
          </label>
        ))}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        "System" follows your device's light/dark setting automatically. The quick toggle in the sidebar
        switches straight between light and dark.
      </p>
    </Widget>
  );
}

function NavVisibilitySettings() {
  const { isVisible, setVisible } = useNavVisibility();
  return (
    <Widget>
      <div className="widget-head">
        <h4>Sidebar tabs</h4>
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Choose which tabs appear in your sidebar. This only affects this device.
      </p>
      <div className="class-list">
        {navItems.map((item) => (
          <label className="toggle-row" key={item.to} style={{ padding: 'var(--space-2) 0' }}>
            <input type="checkbox" checked={isVisible(item.to)} onChange={(e) => setVisible(item.to, e.target.checked)} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </Widget>
  );
}

function ExportImportSettings() {
  const { email } = useAuth();
  const [includeLocal, setIncludeLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<FourFoldExport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!email) return;
    setBusy(true);
    try {
      downloadJson(`fourfold-export-${new Date().toISOString().slice(0, 10)}.json`, await exportAllData(email, includeLocal));
    } finally {
      setBusy(false);
    }
  };

  const handleFileChosen = async (file: File) => {
    setMessage(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMessage('That file is not valid JSON.');
      return;
    }
    if (!isValidExport(parsed)) {
      setMessage('That file is not a recognized FourFold export.');
      return;
    }
    setPending(parsed);
  };

  const confirmImport = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await importAllData(pending);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Widget>
      <div className="widget-head">
        <h4>Export &amp; import data</h4>
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Export downloads a JSON backup of your habits, matrix tasks, countdowns, school data, and assistant history.
        It never includes your sign-in session or your Google/Schoology feed links.
      </p>
      <label className="toggle-row">
        <input type="checkbox" checked={includeLocal} onChange={(e) => setIncludeLocal(e.target.checked)} />
        <span>Also include this device's local (unsynced) calendar events</span>
      </label>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button className="btn btn-primary" type="button" onClick={() => void handleExport()} disabled={busy}>
          Export JSON
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
          Import JSON…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFileChosen(f);
            e.target.value = '';
          }}
        />
      </div>
      {message && <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>{message}</p>}
      {pending && (
        <div className="dialog-backdrop" onClick={() => setPending(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Overwrite your data?</div>
            <p className="text-muted" style={{ fontSize: 13 }}>
              This file was exported {new Date(pending.exportedAt).toLocaleString()}
              {pending.email && pending.email !== email ? ` from ${pending.email}` : ''}. Importing replaces your
              current habits, matrix, countdowns, school, and assistant data with what's in this file. This can't be
              undone.
            </p>
            <div className="dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setPending(null)}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={() => void confirmImport()} disabled={busy}>
                {busy ? 'Importing…' : 'Overwrite & reload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Widget>
  );
}

function NotificationSettings() {
  const { permission, requestPermission, enabled, setEnabled } = useNotifications();
  return (
    <Widget>
      <div className="widget-head">
        <h4>Notifications</h4>
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Get a browser notification for habit reminders (using each habit's linked time), when a Pomodoro session
        ends, and for matrix/homework tasks due within a day. Only fires while FourFold is open in a tab.
      </p>
      {permission === 'unsupported' && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Notifications aren't supported in this browser.</p>
      )}
      {permission !== 'unsupported' && permission !== 'granted' && (
        <button className="btn btn-primary" type="button" onClick={() => void requestPermission()}>
          Enable notifications
        </button>
      )}
      {permission === 'granted' && (
        <label className="toggle-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Notify me for habits, Pomodoro, and upcoming deadlines</span>
        </label>
      )}
      {permission === 'denied' && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          Notifications are blocked for this site — enable them in your browser's site settings.
        </p>
      )}
    </Widget>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function InstallPwaSettings() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  return (
    <Widget>
      <div className="widget-head">
        <h4>Install FourFold</h4>
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Install FourFold as an app on this device for quicker access and offline loading of the app shell.
      </p>
      <button
        className="btn btn-primary"
        type="button"
        disabled={!deferred}
        onClick={async () => {
          if (!deferred) return;
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
      >
        {deferred ? 'Install' : 'Not available in this browser yet'}
      </button>
    </Widget>
  );
}

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

async function apiTokenFetch(method: 'GET' | 'POST' | 'DELETE', onExpired: () => void): Promise<string | null | undefined> {
  const session = getStoredSession();
  if (!session) {
    onExpired();
    return undefined;
  }
  const res = await fetch('/api/lms?action=apiToken', { method, headers: { Authorization: `Bearer ${session.token}` } });
  if (res.status === 401) {
    onExpired();
    return undefined;
  }
  const body = await res.json();
  return body.token ?? null;
}

function ApiTokenSettings() {
  const { handleSessionExpired } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setStatus('loading');
    void apiTokenFetch('GET', handleSessionExpired).then((t) => {
      if (t !== undefined) setToken(t);
      setStatus('ready');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    setStatus('loading');
    setCopied(false);
    const t = await apiTokenFetch('POST', handleSessionExpired);
    if (t !== undefined) setToken(t);
    setStatus('ready');
  };

  const revoke = async () => {
    setStatus('loading');
    await apiTokenFetch('DELETE', handleSessionExpired);
    setToken(null);
    setStatus('ready');
  };

  const homeworkUrl = `${window.location.origin}/api/lms?action=homework`;

  const copy = (value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Widget>
      <div className="widget-head">
        <h4>Personal API access</h4>
        {token && (
          <button className="btn btn-ghost" type="button" onClick={revoke} disabled={status === 'loading'}>
            Revoke
          </button>
        )}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        A long-lived token for reading your upcoming homework (Schoology/Canvas/Classroom, merged) from outside the
        app — e.g. so Claude can pull it into a daily brief. Unlike your sign-in session, this doesn't expire on its
        own; revoke it any time to cut off access immediately.
      </p>
      {token ? (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="input" type="text" readOnly style={{ flex: 1, minWidth: 240, fontFamily: 'monospace' }} value={token} />
            <button className="btn btn-secondary" type="button" onClick={() => copy(token)}>{copied ? 'Copied!' : 'Copy'}</button>
            <button className="btn btn-ghost" type="button" onClick={generate} disabled={status === 'loading'}>Regenerate</button>
          </div>
          <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
            Give Claude both this token and the URL below (as an <code>Authorization: Bearer &lt;token&gt;</code>{' '}
            header):
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="input" type="text" readOnly style={{ flex: 1, minWidth: 240, fontFamily: 'monospace' }} value={homeworkUrl} />
            <button className="btn btn-secondary" type="button" onClick={() => copy(homeworkUrl)}>Copy</button>
          </div>
        </>
      ) : (
        <button className="btn btn-primary" type="button" onClick={generate} disabled={status === 'loading'}>
          {status === 'loading' ? 'Generating…' : 'Generate token'}
        </button>
      )}
    </Widget>
  );
}

function AccountRow({ account }: { account: LinkedAccount }) {
  const { reconnectAccount, disconnectAccount, updateAccountCalendars, getAccessToken } = useGoogleAuth();
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const selectedCalendars = account.calendars.filter((c) => c.selected);

  const openPicker = async () => {
    setTokenLoading(true);
    const token = await getAccessToken(account.email);
    setTokenLoading(false);
    if (token) setEditingToken(token);
  };

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
        {account.status === 'signed-in' && (
          <button className="btn btn-ghost" type="button" onClick={openPicker} disabled={tokenLoading}>
            {tokenLoading ? 'Loading…' : 'Edit calendars'}
          </button>
        )}
        {account.status === 'error' && (
          <button className="btn btn-ghost" type="button" onClick={() => reconnectAccount(account.email)}>Reconnect</button>
        )}
        <button className="btn btn-ghost" type="button" onClick={() => disconnectAccount(account.email)}>Disconnect</button>
      </div>
      {editingToken && (
        <GoogleCalendarPicker
          accountEmail={account.email}
          accessToken={editingToken}
          initialSelection={account.calendars}
          onCancel={() => setEditingToken(null)}
          onSave={(calendars) => {
            updateAccountCalendars(account.email, calendars);
            setEditingToken(null);
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
            <li>APIs &amp; Services → Credentials → Create Credentials → <strong>OAuth client ID</strong> → Application type <strong>Web application</strong> → add <code>http://localhost:5173</code> as an authorized JavaScript origin, and add <code>http://localhost:5173/api/googleOAuthCallback</code> (and your deployed origin's equivalent) as an authorized redirect URI.</li>
            <li>Copy the client ID and client secret into <code>.env</code> as <code>VITE_GOOGLE_CLIENT_ID=&hellip;</code>, <code>GOOGLE_CLIENT_ID=&hellip;</code> (same value, no <code>VITE_</code> prefix) and <code>GOOGLE_CLIENT_SECRET=&hellip;</code>, then restart the dev server. The secret refreshes tokens server-side so a linked account stays connected without needing regular re-approval.</li>
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

function GoogleIcsSettings() {
  const { status, feeds, error, addFeed, removeFeed, updateFeedColor, refresh } = useGoogleIcs();
  const [labelDraft, setLabelDraft] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [colorDraft, setColorDraft] = useState('');

  const handleAdd = () => {
    if (!urlDraft.trim()) return;
    void addFeed(labelDraft.trim() || 'Google Calendar', urlDraft.trim(), colorDraft || undefined);
    setLabelDraft('');
    setUrlDraft('');
    setColorDraft('');
  };

  return (
    <Widget>
      <div className="widget-head">
        <h4>Google Calendar backup feeds</h4>
        {feeds.length > 0 && (
          <button className="btn btn-ghost" type="button" onClick={() => void refresh()} disabled={status === 'loading'}>
            {status === 'loading' ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        A read-only fallback that doesn't depend on the OAuth connection above — nothing to disconnect or reconnect, and
        you can add as many as you like. In Google Calendar, go to{' '}
        <strong>Settings → (your calendar) → Integrate calendar</strong>, and copy the{' '}
        <strong>Secret address in iCal format</strong>. Events show up here alongside your synced/local ones; you can
        edit or hide them locally (that never writes back to Google — only Google Calendar itself can). (Pasting the
        "embed this calendar" link works too, for calendars that are public — it gets converted automatically.)
      </p>

      {feeds.length > 0 && (
        <div className="class-list">
          {feeds.map((f) => (
            <div className="class-row" key={f.id}>
              <div className="class-row-main">
                <span className="class-row-name">{f.label}</span>
                <span className="class-row-meta text-muted">
                  {f.error ? f.error : `${f.events.length} event${f.events.length === 1 ? '' : 's'}`}
                </span>
              </div>
              <ColorSwatchPicker value={f.color ?? ''} onChange={(color) => void updateFeedColor(f.id, color)} />
              <div className="class-row-actions">
                <button className="btn btn-ghost" type="button" onClick={() => void removeFeed(f.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          type="text"
          style={{ width: 160 }}
          placeholder="Label (e.g. Work)"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
        />
        <input
          className="input"
          type="url"
          style={{ flex: 1, minWidth: 240 }}
          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
        />
        <ColorSwatchPicker value={colorDraft} onChange={setColorDraft} />
        <button className="btn btn-primary" type="button" onClick={handleAdd} disabled={status === 'loading' || !urlDraft.trim()}>
          Add feed
        </button>
      </div>
      {error && <p className="text-muted" style={{ fontSize: 12.5, margin: 0, color: 'var(--danger, #c0392b)' }}>{error}</p>}
    </Widget>
  );
}

function SchoologySettings() {
  const { status, icsUrl, hasApiKey, error, saveIcsUrl, saveApiCredentials, refresh } = useSchoology();
  const [draft, setDraft] = useState(icsUrl ?? '');
  const [dirty, setDirty] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [apiSecretDraft, setApiSecretDraft] = useState('');

  const shown = dirty ? draft : (icsUrl ?? draft);

  const handleSave = () => {
    setDirty(false);
    void saveIcsUrl(draft.trim());
  };

  const handleDisconnectFeed = () => {
    setDraft('');
    setDirty(false);
    void saveIcsUrl('');
  };

  const handleSaveApi = () => {
    void saveApiCredentials(apiKeyDraft.trim(), apiSecretDraft.trim());
    setApiKeyDraft('');
    setApiSecretDraft('');
  };

  const handleDisconnectApi = () => {
    setApiKeyDraft('');
    setApiSecretDraft('');
    void saveApiCredentials('', '');
  };

  return (
    <Widget>
      <div className="widget-head">
        <h4>Schoology homework</h4>
        {(icsUrl || hasApiKey) && (
          <button className="btn btn-ghost" type="button" onClick={() => void refresh()} disabled={status === 'loading'}>
            {status === 'loading' ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Paste your personal Schoology calendar feed URL to pull assignment due dates onto the School tab. In Schoology,
        go to <strong>Courses → Upcoming Assignments</strong> (or your Calendar), find <strong>Export/Subscribe</strong>,
        and copy the <code>.ics</code> link it gives you. This feed never includes points possible.
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
        {icsUrl && (
          <button className="btn btn-ghost" type="button" onClick={handleDisconnectFeed} disabled={status === 'loading'}>
            Disconnect
          </button>
        )}
      </div>

      <p className="text-muted" style={{ fontSize: 12.5, margin: 0, marginTop: 'var(--space-2)' }}>
        For points possible and full descriptions, connect Schoology's API instead: create a personal API key/secret
        under <strong>Account Settings → API</strong> in Schoology (requires the server to have
        <code> SCHOOLOGY_CONSUMER_KEY</code>/<code>SCHOOLOGY_CONSUMER_SECRET</code> configured).
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          type="text"
          style={{ flex: 1, minWidth: 180 }}
          placeholder="API key"
          value={apiKeyDraft}
          onChange={(e) => setApiKeyDraft(e.target.value)}
        />
        <input
          className="input"
          type="password"
          style={{ flex: 1, minWidth: 180 }}
          placeholder={hasApiKey ? 'API secret saved — enter both to replace' : 'API secret'}
          value={apiSecretDraft}
          onChange={(e) => setApiSecretDraft(e.target.value)}
        />
        <button
          className="btn btn-secondary"
          type="button"
          onClick={handleSaveApi}
          disabled={status === 'loading' || !apiKeyDraft.trim() || !apiSecretDraft.trim()}
        >
          Save
        </button>
        {hasApiKey && (
          <button className="btn btn-ghost" type="button" onClick={handleDisconnectApi} disabled={status === 'loading'}>
            Disconnect
          </button>
        )}
      </div>

      {error && <p className="text-muted" style={{ fontSize: 12.5, margin: 0, color: 'var(--danger, #c0392b)' }}>{error}</p>}
      {hasApiKey && !error && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Connected via API — points possible included.</p>
      )}
      {!hasApiKey && icsUrl && !error && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Connected via feed. Assignments now show up on the School tab.</p>
      )}
    </Widget>
  );
}

function CanvasSettings() {
  const { status, baseUrl, hasToken, error, saveCredentials, refresh } = useCanvas();
  const [urlDraft, setUrlDraft] = useState(baseUrl ?? '');
  const [tokenDraft, setTokenDraft] = useState('');
  const [dirty, setDirty] = useState(false);

  const shownUrl = dirty ? urlDraft : (baseUrl ?? urlDraft);

  const handleSave = () => {
    setDirty(false);
    // Omit the token entirely when left blank so an existing one isn't wiped just by re-saving
    // the URL — the backend only changes fields it actually receives.
    void saveCredentials(urlDraft.trim(), tokenDraft.trim() || undefined);
    setTokenDraft('');
  };

  const handleDisconnect = () => {
    setUrlDraft('');
    setDirty(false);
    setTokenDraft('');
    void saveCredentials('', '');
  };

  return (
    <Widget>
      <div className="widget-head">
        <h4>Canvas homework</h4>
        {hasToken && (
          <button className="btn btn-ghost" type="button" onClick={() => void refresh()} disabled={status === 'loading'}>
            {status === 'loading' ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Pulls assignments — including points possible and full descriptions — via Canvas's API. Generate a token
        under <strong>Account → Settings → New Access Token</strong>, and enter your school's Canvas URL below.
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          type="url"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="https://yourschool.instructure.com"
          value={shownUrl}
          onChange={(e) => { setUrlDraft(e.target.value); setDirty(true); }}
        />
        <input
          className="input"
          type="password"
          style={{ flex: 1, minWidth: 200 }}
          placeholder={hasToken ? 'Token saved — enter a new one to replace it' : 'Personal access token'}
          value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)}
        />
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleSave}
          disabled={status === 'loading' || !urlDraft.trim() || (!tokenDraft.trim() && !hasToken)}
        >
          Save
        </button>
        {hasToken && (
          <button className="btn btn-ghost" type="button" onClick={handleDisconnect} disabled={status === 'loading'}>
            Disconnect
          </button>
        )}
      </div>
      {error && <p className="text-muted" style={{ fontSize: 12.5, margin: 0, color: 'var(--danger, #c0392b)' }}>{error}</p>}
      {hasToken && !error && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Connected. Assignments now show up on the School tab.</p>
      )}
    </Widget>
  );
}

function ClassroomSettings() {
  const { status, accountEmail, error, refresh } = useClassroom();
  const { accounts } = useGoogleAuth();

  return (
    <Widget>
      <div className="widget-head">
        <h4>Google Classroom</h4>
        {accountEmail && (
          <button className="btn btn-ghost" type="button" onClick={() => void refresh()} disabled={status === 'loading'}>
            {status === 'loading' ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Reuses the Google account connected under Settings → Calendar — no separate sign-in. Pulls titles,
        descriptions, due dates, and points from every active class's coursework.
      </p>
      {accounts.length === 0 && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          Not connected — connect a Google account under Settings → Calendar to enable this.
        </p>
      )}
      {accounts.length > 0 && accountEmail && !error && (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Connected as {accountEmail}. Assignments now show up on the School tab.</p>
      )}
      {error && <p className="text-muted" style={{ fontSize: 12.5, margin: 0, color: 'var(--danger, #c0392b)' }}>{error}</p>}
    </Widget>
  );
}

function SchoologyClassMappingSettings() {
  const { assignments: schoologyAssignments } = useSchoology();
  const { assignments: canvasAssignments } = useCanvas();
  const { assignments: classroomAssignments } = useClassroom();
  const { classes, classMappings, setClassMapping, classKeywords, setClassKeywords } = useSchool();
  const categories = allCategories([...schoologyAssignments, ...canvasAssignments, ...classroomAssignments]);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({});

  return (
    <Widget>
      <div className="widget-head"><h4>Course mapping</h4></div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Assignments from Schoology, Canvas, and Google Classroom are matched to a class by course name when the
        source provides one, and by keywords you set below (checked against each assignment's title/description)
        otherwise.
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

type SettingsCategory = 'general' | 'account' | 'calendar' | 'school' | 'navigation';

const SETTINGS_CATEGORY_TABS: { id: SettingsCategory; label: string; description: string; color: string; icon: ReactNode }[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Appearance, notifications, and installing the app.',
    color: '#5980a6',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: 'account',
    label: 'Account & Data',
    description: "Who's signed in, and exporting or importing your data.",
    color: '#8759a6',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </svg>
    ),
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description: 'Connect Google Calendar accounts and backup feeds.',
    color: '#3f9968',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'school',
    label: 'School',
    description: 'Schoology sync, classes, bell schedule, and presets.',
    color: '#c07a35',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m22 10-10-5L2 10l10 5 10-5Z" />
        <path d="M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5" />
      </svg>
    ),
  },
  {
    id: 'navigation',
    label: 'Sidebar',
    description: 'Choose which tabs appear in your sidebar.',
    color: '#7a8a5f',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="18" rx="1" />
        <path d="M14 3h7v7h-7zM14 14h7v7h-7z" />
      </svg>
    ),
  },
];

const SETTINGS_TAB_KEY = 'fourfold.settings.tab';

export function SettingsPage() {
  const { classes, addClass, updateClass, removeClass, presets, addPreset, updatePreset, removePreset, showBreaks, setShowBreaks } = useSchool();

  const [activeTab, setActiveTab] = useState<SettingsCategory>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_TAB_KEY);
      return SETTINGS_CATEGORY_TABS.some((t) => t.id === stored) ? (stored as SettingsCategory) : 'general';
    } catch {
      return 'general';
    }
  });
  const selectTab = (id: SettingsCategory) => {
    setActiveTab(id);
    try {
      localStorage.setItem(SETTINGS_TAB_KEY, id);
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  };
  const activeCategory = SETTINGS_CATEGORY_TABS.find((t) => t.id === activeTab)!;

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

      <div className="settings-shell">
        <nav className="settings-nav">
          {SETTINGS_CATEGORY_TABS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`settings-nav-item${activeTab === cat.id ? ' active' : ''}`}
              onClick={() => selectTab(cat.id)}
            >
              <span className="settings-nav-icon" style={{ background: cat.color }}>{cat.icon}</span>
              <span className="settings-nav-label">{cat.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-panel">
          <div className="settings-panel-head">
            <span className="settings-panel-icon" style={{ background: activeCategory.color }}>{activeCategory.icon}</span>
            <div className="settings-panel-title">
              <h2>{activeCategory.label}</h2>
              <p className="text-muted">{activeCategory.description}</p>
            </div>
          </div>

      {activeTab === 'general' && (
        <>
          <ThemeSettings />
          <NotificationSettings />
          <InstallPwaSettings />
        </>
      )}

      {activeTab === 'account' && (
        <>
          <AccessSettings />
          <ApiTokenSettings />
          <ExportImportSettings />
        </>
      )}

      {activeTab === 'calendar' && (
        <>
          <GoogleCalendarSettings />
          <GoogleIcsSettings />
        </>
      )}

      {activeTab === 'school' && (
        <>
      <SchoologySettings />
      <CanvasSettings />
      <ClassroomSettings />
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
        </>
      )}

      {activeTab === 'navigation' && <NavVisibilitySettings />}
        </div>
      </div>
    </div>
  );
}
