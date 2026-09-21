import { useState } from 'react';
import { useFriends, type Friend, type FriendFieldType, type FriendLinkedEvent } from '../state/FriendsContext';
import { useCountdowns } from '../state/CountdownsContext';
import { useCalendarEvents, eventKey, type CalEvent } from '../state/CalendarContext';
import { FriendFieldDefsDialog } from './FriendFieldDefsDialog';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FIELD_TYPE_LABELS: Record<FriendFieldType, string> = {
  text: 'Text',
  date: 'Date',
  url: 'Link',
  phone: 'Phone',
};

function fieldInputType(type: FriendFieldType) {
  if (type === 'date') return 'date';
  if (type === 'url') return 'url';
  if (type === 'phone') return 'tel';
  return 'text';
}

function renderFieldValue(type: FriendFieldType, value: string) {
  if (type === 'url') return <a href={value} target="_blank" rel="noreferrer">{value}</a>;
  if (type === 'phone') return <a href={`tel:${value}`}>{value}</a>;
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
  const [eventSearch, setEventSearch] = useState('');

  const birthdaySynced = !friend.birthdayCountdownId || countdowns.some((c) => c.id === friend.birthdayCountdownId);

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

  const eventMap = new Map(events.map((e) => [eventKey(e), e]));
  const linkedResolved = friend.linkedEvents.map((ref) => ({ ref, event: eventMap.get(eventKey(ref)) }));
  const searchResults = eventSearch.trim().length >= 2
    ? events
        .filter((e) => e.title.toLowerCase().includes(eventSearch.trim().toLowerCase()) && !friend.linkedEvents.some((r) => eventKey(r) === eventKey(e)))
        .slice(0, 8)
    : [];

  const attachEvent = (e: CalEvent) => {
    updateFriend(friend.id, { linkedEvents: [...friend.linkedEvents, { id: e.id, accountEmail: e.accountEmail, calendarId: e.calendarId }] });
    setEventSearch('');
  };
  const detachEvent = (ref: FriendLinkedEvent) => {
    updateFriend(friend.id, { linkedEvents: friend.linkedEvents.filter((r) => eventKey(r) !== eventKey(ref)) });
  };

  return (
    <>
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px,100%)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {friend.avatarDataUrl ? (
            <img src={friend.avatarDataUrl} alt="" className="friend-avatar friend-avatar-lg" />
          ) : (
            <span className="friend-avatar friend-avatar-lg friend-avatar-placeholder">{initials(friend.name)}</span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dialog-title" style={{ marginBottom: 0 }}>{friend.name}</div>
            {friend.nickname && <div className="text-muted" style={{ fontSize: 13 }}>{friend.nickname}</div>}
          </div>
          <button className="btn btn-secondary" type="button" onClick={onEdit}>Edit</button>
        </div>

        {friend.notes && <p style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{friend.notes}</p>}

        <div className="class-list">
          {friend.birthday && (
            <div className="class-row">
              <div className="class-row-main">
                <span className="class-row-name">Birthday</span>
                <span className="class-row-meta text-muted">
                  {MONTH_NAMES[friend.birthday.month - 1]} {friend.birthday.day}
                  {!birthdaySynced && ' · not synced to Countdowns'}
                </span>
              </div>
              {!birthdaySynced && (
                <button className="btn btn-secondary" type="button" onClick={resolveSyncedBirthday}>Re-sync</button>
              )}
            </div>
          )}
          {friend.address && (
            <div className="class-row">
              <div className="class-row-main">
                <span className="class-row-name">Address</span>
                <span className="class-row-meta text-muted">
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(friend.address)}`} target="_blank" rel="noreferrer">{friend.address}</a>
                </span>
              </div>
            </div>
          )}
          {friend.phone && (
            <div className="class-row">
              <div className="class-row-main">
                <span className="class-row-name">Phone</span>
                <span className="class-row-meta text-muted"><a href={`tel:${friend.phone}`}>{friend.phone}</a></span>
              </div>
            </div>
          )}
        </div>

        <div className="widget-head" style={{ marginTop: 'var(--space-2)' }}>
          <h4>Custom fields</h4>
          <button className="btn btn-secondary" type="button" onClick={() => setManageFieldsOpen(true)}>Manage fields</button>
        </div>
        <div className="class-list">
          {resolvedFields.map((f) => (
            <div className="class-row" key={f.id}>
              <div className="class-row-main">
                <span className="class-row-name">{f.label}</span>
                <span className="class-row-meta text-muted">{renderFieldValue(f.type, f.value)}</span>
              </div>
              <div className="class-row-actions">
                <button className="btn btn-icon" type="button" title="Remove" onClick={() => removeFieldValue(f.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          ))}
          {resolvedFields.length === 0 && <div className="empty-msg">No custom fields yet.</div>}
        </div>

        {addMode === 'none' && (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {unusedDefs.length > 0 && (
              <button className="btn btn-secondary" type="button" onClick={() => setAddMode('global')}>Add existing field</button>
            )}
            <button className="btn btn-secondary" type="button" onClick={() => setAddMode('adhoc')}>Add one-off field</button>
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
                  onChange={(e) => setFieldValue(e.target.value)}
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
              <input className="input" type={fieldInputType(adhocType)} value={fieldValue} onChange={(e) => setFieldValue(e.target.value)} />
            </div>
            <div className="dialog-actions" style={{ marginTop: 0 }}>
              <button className="btn btn-secondary" type="button" onClick={resetAddForm}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={saveAdhocField}>Add</button>
            </div>
          </div>
        )}

        <div className="widget-head" style={{ marginTop: 'var(--space-2)' }}>
          <h4>Linked events</h4>
        </div>
        <div className="class-list">
          {linkedResolved.map(({ ref, event }) => (
            <div className="class-row" key={eventKey(ref)}>
              <div className="class-row-main">
                <span className="class-row-name">{event ? event.title : 'Event no longer available'}</span>
                {event && (
                  <span className="class-row-meta text-muted">
                    {parseEventDateKey(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div className="class-row-actions">
                <button className="btn btn-secondary" type="button" onClick={() => detachEvent(ref)}>Detach</button>
              </div>
            </div>
          ))}
          {linkedResolved.length === 0 && <div className="empty-msg">No linked events yet.</div>}
        </div>
        <div className="field">
          <label>Link an existing event</label>
          <input className="input" type="text" value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} placeholder="Search calendar events…" />
        </div>
        {searchResults.length > 0 && (
          <div className="class-list">
            {searchResults.map((e) => (
              <div className="class-row" key={eventKey(e)}>
                <div className="class-row-main">
                  <span className="class-row-name">{e.title}</span>
                  <span className="class-row-meta text-muted">
                    {parseEventDateKey(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <div className="class-row-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => attachEvent(e)}>Attach</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn btn-danger" type="button" onClick={handleDelete}>Delete friend</button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>

    {manageFieldsOpen && <FriendFieldDefsDialog onClose={() => setManageFieldsOpen(false)} />}
    </>
  );
}
