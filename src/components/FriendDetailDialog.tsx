import { useState, type ReactNode } from 'react';
import { useFriends, type Friend, type FriendFieldType, type FriendLinkedEvent } from '../state/FriendsContext';
import { useCountdowns, type Countdown } from '../state/CountdownsContext';
import { useCalendarEvents, eventKey, type CalEvent } from '../state/CalendarContext';
import { formatPhoneNumber, phoneToTelHref } from '../lib/phoneFormat';
import { FriendFieldDefsDialog } from './FriendFieldDefsDialog';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FIELD_TYPE_LABELS: Record<FriendFieldType, string> = {
  text: 'Text',
  date: 'Date',
  url: 'Link',
  phone: 'Phone',
};

const ICONS = {
  cake: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6Z" /><path d="M4 17c1.5 1 2.5 1 4 0s2.5-1 4 0 2.5 1 4 0 2.5-1 4 0" />
      <path d="M12 13V9" /><path d="M12 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.8 2.2Z" />
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.6 12.3 12.7 20.2a2 2 0 0 1-2.8 0l-6.1-6.1a2 2 0 0 1 0-2.8l7.9-7.9A2 2 0 0 1 13.1 3H19a2 2 0 0 1 2 2v5.9a2 2 0 0 1-.4 1.4Z" />
      <circle cx="15.5" cy="8.5" r="1.5" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7a5 5 0 0 1 0-10h2" /><path d="M15 7h2a5 5 0 1 1 0 10h-2" /><path d="M8 12h8" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  countdown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M9 2h6" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
  ),
  sliders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  ),
};

function fieldTypeIcon(type: FriendFieldType) {
  if (type === 'phone') return ICONS.phone;
  if (type === 'date') return ICONS.calendar;
  if (type === 'url') return ICONS.link;
  return ICONS.tag;
}

function fieldInputType(type: FriendFieldType) {
  if (type === 'date') return 'date';
  if (type === 'url') return 'url';
  if (type === 'phone') return 'tel';
  return 'text';
}

function renderFieldValue(type: FriendFieldType, value: string) {
  if (type === 'url') return <a href={value} target="_blank" rel="noreferrer">{value}</a>;
  if (type === 'phone') return <a href={phoneToTelHref(value)}>{formatPhoneNumber(value)}</a>;
  if (type === 'date') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return value;
}

function parseEventDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m, d);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SectionIcon({ tone, children }: { tone: 'accent' | 'accent-2' | 'neutral'; children: ReactNode }) {
  return <span className={`friend-section-icon friend-section-icon-${tone}`}>{children}</span>;
}

function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  return (
    <div className="friend-empty">
      {icon}
      <span>{message}</span>
    </div>
  );
}

export function FriendDetailDialog({
  friend,
  onEdit,
  onClose,
}: {
  friend: Friend;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { fieldDefs, updateFriend, removeFriend } = useFriends();
  const { countdowns } = useCountdowns();
  const { events } = useCalendarEvents();

  const [manageFieldsOpen, setManageFieldsOpen] = useState(false);
  const [addMode, setAddMode] = useState<'none' | 'global' | 'adhoc'>('none');
  const [selectedDefId, setSelectedDefId] = useState('');
  const [adhocLabel, setAdhocLabel] = useState('');
  const [adhocType, setAdhocType] = useState<FriendFieldType>('text');
  const [fieldValue, setFieldValue] = useState('');
  const [linkSearch, setLinkSearch] = useState('');

  const birthdaySynced = !friend.birthdayCountdownId || countdowns.some((c) => c.id === friend.birthdayCountdownId);
  const hasInfo = friend.birthday || friend.address || friend.phone;

  const resolveSyncedBirthday = () => {
    if (!friend.birthday) return;
    updateFriend(friend.id, { birthday: friend.birthday });
  };

  const handleDelete = () => {
    if (!window.confirm(`Remove ${friend.name} from Friends?`)) return;
    removeFriend(friend.id);
    onClose();
  };

  const resolvedFields = friend.fields
    .map((f) => {
      if (f.defId) {
        const def = fieldDefs.find((d) => d.id === f.defId);
        if (!def) return null;
        return { id: f.id, label: def.label, type: def.type, value: f.value };
      }
      if (!f.label || !f.type) return null;
      return { id: f.id, label: f.label, type: f.type, value: f.value };
    })
    .filter((f): f is { id: string; label: string; type: FriendFieldType; value: string } => f !== null);

  const unusedDefs = fieldDefs.filter((d) => !friend.fields.some((f) => f.defId === d.id));

  const resetAddForm = () => {
    setAddMode('none');
    setSelectedDefId('');
    setAdhocLabel('');
    setAdhocType('text');
    setFieldValue('');
  };

  const saveGlobalField = () => {
    if (!selectedDefId || !fieldValue.trim()) return;
    updateFriend(friend.id, { fields: [...friend.fields, { id: `field-${Date.now()}`, defId: selectedDefId, value: fieldValue.trim() }] });
    resetAddForm();
  };

  const saveAdhocField = () => {
    if (!adhocLabel.trim() || !fieldValue.trim()) return;
    updateFriend(friend.id, {
      fields: [...friend.fields, { id: `field-${Date.now()}`, label: adhocLabel.trim(), type: adhocType, value: fieldValue.trim() }],
    });
    resetAddForm();
  };

  const removeFieldValue = (id: string) => {
    updateFriend(friend.id, { fields: friend.fields.filter((f) => f.id !== id) });
  };

  const linkedCountdownIds = friend.linkedCountdowns ?? [];
  const eventMap = new Map(events.map((e) => [eventKey(e), e]));
  const linkedEventsResolved = friend.linkedEvents.map((ref) => ({ ref, event: eventMap.get(eventKey(ref)) }));
  const linkedCountdownsResolved = linkedCountdownIds.map((id) => ({ id, countdown: countdowns.find((c) => c.id === id) }));

  // ":cd <query>" searches countdowns only, ":evnt <query>" searches calendar events only,
  // anything else searches both.
  const trimmedSearch = linkSearch.trim();
  let searchScope: 'all' | 'event' | 'countdown' = 'all';
  let searchQuery = trimmedSearch;
  if (/^:cd(\s|$)/i.test(trimmedSearch)) {
    searchScope = 'countdown';
    searchQuery = trimmedSearch.replace(/^:cd\s*/i, '');
  } else if (/^:evnt(\s|$)/i.test(trimmedSearch)) {
    searchScope = 'event';
    searchQuery = trimmedSearch.replace(/^:evnt\s*/i, '');
  }
  const q = searchQuery.trim().toLowerCase();

  const eventResults: CalEvent[] = (searchScope === 'all' || searchScope === 'event') && q.length >= 2
    ? events
        .filter((e) => e.title.toLowerCase().includes(q) && !friend.linkedEvents.some((r) => eventKey(r) === eventKey(e)))
        .slice(0, 8)
    : [];
  const countdownResults: Countdown[] = (searchScope === 'all' || searchScope === 'countdown') && q.length >= 2
    ? countdowns
        .filter((c) => c.name.toLowerCase().includes(q) && c.id !== friend.birthdayCountdownId && !linkedCountdownIds.includes(c.id))
        .slice(0, 8)
    : [];

  const attachEvent = (e: CalEvent) => {
    updateFriend(friend.id, { linkedEvents: [...friend.linkedEvents, { id: e.id, accountEmail: e.accountEmail, calendarId: e.calendarId }] });
    setLinkSearch('');
  };
  const detachEvent = (ref: FriendLinkedEvent) => {
    updateFriend(friend.id, { linkedEvents: friend.linkedEvents.filter((r) => eventKey(r) !== eventKey(ref)) });
  };
  const attachCountdown = (c: Countdown) => {
    updateFriend(friend.id, { linkedCountdowns: [...linkedCountdownIds, c.id] });
    setLinkSearch('');
  };
  const detachCountdown = (id: string) => {
    updateFriend(friend.id, { linkedCountdowns: linkedCountdownIds.filter((cId) => cId !== id) });
  };

  return (
    <>
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog friend-detail-dialog" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px,100%)' }}>

        <div className="friend-detail-header">
          {friend.avatarDataUrl ? (
            <img src={friend.avatarDataUrl} alt="" className="friend-avatar friend-avatar-lg friend-avatar-ring" />
          ) : (
            <span className="friend-avatar friend-avatar-lg friend-avatar-placeholder friend-avatar-ring">{initials(friend.name)}</span>
          )}
          <div className="friend-detail-heading">
            <div className="friend-detail-name">{friend.name}</div>
            {friend.nickname && <span className="tag tag-neutral">{friend.nickname}</span>}
          </div>
          <button className="btn btn-secondary" type="button" onClick={onEdit}>Edit</button>
        </div>

        {friend.notes && <p className="friend-notes">{friend.notes}</p>}

        {hasInfo && (
          <div className="friend-section">
            {friend.birthday && (
              <div className="friend-info-row">
                <SectionIcon tone="accent">{ICONS.cake}</SectionIcon>
                <div className="friend-info-main">
                  <span className="friend-info-label">Birthday</span>
                  <span className="friend-info-value">
                    {MONTH_NAMES[friend.birthday.month - 1]} {friend.birthday.day}
                    {!birthdaySynced && <span className="text-muted"> · not synced to Countdowns</span>}
                  </span>
                </div>
                {!birthdaySynced && (
                  <button className="btn btn-ghost" type="button" onClick={resolveSyncedBirthday}>Re-sync</button>
                )}
              </div>
            )}
            {friend.address && (
              <div className="friend-info-row">
                <SectionIcon tone="accent-2">{ICONS.pin}</SectionIcon>
                <div className="friend-info-main">
                  <span className="friend-info-label">Address</span>
                  <span className="friend-info-value">
                    <a href={`https://maps.google.com/?q=${encodeURIComponent(friend.address)}`} target="_blank" rel="noreferrer">{friend.address}</a>
                  </span>
                </div>
              </div>
            )}
            {friend.phone && (
              <div className="friend-info-row">
                <SectionIcon tone="neutral">{ICONS.phone}</SectionIcon>
                <div className="friend-info-main">
                  <span className="friend-info-label">Phone</span>
                  <span className="friend-info-value"><a href={phoneToTelHref(friend.phone)}>{formatPhoneNumber(friend.phone)}</a></span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="friend-section">
          <div className="friend-section-head">
            <div className="friend-section-title">
              <SectionIcon tone="accent-2">{ICONS.tag}</SectionIcon>
              <h4>Custom fields</h4>
            </div>
            <button className="btn btn-ghost" type="button" onClick={() => setManageFieldsOpen(true)}>
              {ICONS.sliders} Manage fields
            </button>
          </div>

          {resolvedFields.length === 0 && addMode === 'none' && (
            <EmptyState icon={ICONS.tag} message="No custom fields yet — add one below." />
          )}

          {resolvedFields.map((f) => (
            <div className="friend-info-row" key={f.id}>
              <SectionIcon tone="accent-2">{fieldTypeIcon(f.type)}</SectionIcon>
              <div className="friend-info-main">
                <span className="friend-info-label">{f.label}</span>
                <span className="friend-info-value">{renderFieldValue(f.type, f.value)}</span>
              </div>
              <button className="btn btn-icon friend-row-remove" type="button" title="Remove" onClick={() => removeFieldValue(f.id)}>
                {ICONS.x}
              </button>
            </div>
          ))}

          {addMode === 'none' && (
            <div className="friend-add-row">
              {unusedDefs.length > 0 && (
                <button className="btn btn-ghost" type="button" onClick={() => setAddMode('global')}>{ICONS.plus} Add existing field</button>
              )}
              <button className="btn btn-ghost" type="button" onClick={() => setAddMode('adhoc')}>{ICONS.plus} Add one-off field</button>
            </div>
          )}

          {addMode === 'global' && (
            <div className="entity-form">
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Field</label>
                  <select className="input" value={selectedDefId} onChange={(e) => setSelectedDefId(e.target.value)}>
                    <option value="">Choose a field…</option>
                    {unusedDefs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Value</label>
                  <input
                    className="input"
                    type={fieldInputType(unusedDefs.find((d) => d.id === selectedDefId)?.type ?? 'text')}
                    value={fieldValue}
                    onChange={(e) => setFieldValue(
                      unusedDefs.find((d) => d.id === selectedDefId)?.type === 'phone' ? formatPhoneNumber(e.target.value) : e.target.value,
                    )}
                  />
                </div>
              </div>
              <div className="dialog-actions" style={{ marginTop: 0 }}>
                <button className="btn btn-secondary" type="button" onClick={resetAddForm}>Cancel</button>
                <button className="btn btn-primary" type="button" onClick={saveGlobalField}>Add</button>
              </div>
            </div>
          )}

          {addMode === 'adhoc' && (
            <div className="entity-form">
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Label</label>
                  <input className="input" type="text" value={adhocLabel} onChange={(e) => setAdhocLabel(e.target.value)} placeholder="e.g. Blood type" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Type</label>
                  <select className="input" value={adhocType} onChange={(e) => setAdhocType(e.target.value as FriendFieldType)}>
                    {(Object.keys(FIELD_TYPE_LABELS) as FriendFieldType[]).map((t) => (
                      <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Value</label>
                <input
                  className="input"
                  type={fieldInputType(adhocType)}
                  value={fieldValue}
                  onChange={(e) => setFieldValue(adhocType === 'phone' ? formatPhoneNumber(e.target.value) : e.target.value)}
                />
              </div>
              <div className="dialog-actions" style={{ marginTop: 0 }}>
                <button className="btn btn-secondary" type="button" onClick={resetAddForm}>Cancel</button>
                <button className="btn btn-primary" type="button" onClick={saveAdhocField}>Add</button>
              </div>
            </div>
          )}
        </div>

        <div className="friend-section">
          <div className="friend-section-head">
            <div className="friend-section-title">
              <SectionIcon tone="neutral">{ICONS.calendar}</SectionIcon>
              <h4>Linked events &amp; countdowns</h4>
            </div>
          </div>

          {linkedEventsResolved.length === 0 && linkedCountdownsResolved.length === 0 && (
            <EmptyState icon={ICONS.calendar} message="Nothing linked yet — search below to attach an event or countdown." />
          )}

          {linkedEventsResolved.map(({ ref, event }) => (
            <div className="friend-info-row" key={eventKey(ref)}>
              <SectionIcon tone="neutral">{ICONS.calendar}</SectionIcon>
              <div className="friend-info-main">
                <span className="friend-info-value">{event ? event.title : 'Event no longer available'}</span>
                {event && (
                  <span className="friend-info-label">
                    {parseEventDateKey(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
              <button className="btn btn-icon friend-row-remove" type="button" title="Detach" onClick={() => detachEvent(ref)}>
                {ICONS.x}
              </button>
            </div>
          ))}

          {linkedCountdownsResolved.map(({ id, countdown }) => (
            <div className="friend-info-row" key={id}>
              <SectionIcon tone="neutral">{ICONS.countdown}</SectionIcon>
              <div className="friend-info-main">
                <span className="friend-info-value">{countdown ? countdown.name : 'Countdown no longer available'}</span>
                {countdown && (
                  <span className="friend-info-label">{MONTH_NAMES[countdown.month - 1]} {countdown.day}</span>
                )}
              </div>
              <button className="btn btn-icon friend-row-remove" type="button" title="Detach" onClick={() => detachCountdown(id)}>
                {ICONS.x}
              </button>
            </div>
          ))}

          <div className="friend-search-field">
            {ICONS.search}
            <input
              className="input"
              type="text"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Search to link… (:cd for countdowns, :evnt for events)"
            />
          </div>

          {(eventResults.length > 0 || countdownResults.length > 0) && (
            <div className="friend-search-results">
              {eventResults.map((e) => (
                <div className="friend-info-row" key={eventKey(e)}>
                  <SectionIcon tone="accent">{ICONS.calendar}</SectionIcon>
                  <div className="friend-info-main">
                    <span className="friend-info-value">{e.title}</span>
                    <span className="friend-info-label">
                      {parseEventDateKey(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={() => attachEvent(e)}>Attach</button>
                </div>
              ))}
              {countdownResults.map((c) => (
                <div className="friend-info-row" key={c.id}>
                  <SectionIcon tone="accent">{ICONS.countdown}</SectionIcon>
                  <div className="friend-info-main">
                    <span className="friend-info-value">{c.name}</span>
                    <span className="friend-info-label">{MONTH_NAMES[c.month - 1]} {c.day}</span>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={() => attachCountdown(c)}>Attach</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dialog-actions friend-detail-actions">
          <button className="btn btn-ghost friend-delete-btn" type="button" onClick={handleDelete}>{ICONS.trash} Delete friend</button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>

    {manageFieldsOpen && <FriendFieldDefsDialog onClose={() => setManageFieldsOpen(false)} />}
    </>
  );
}
