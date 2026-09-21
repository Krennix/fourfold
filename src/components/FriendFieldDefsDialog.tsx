import { useState } from 'react';
import { useFriends, type FriendFieldDef, type FriendFieldType } from '../state/FriendsContext';

const FIELD_TYPE_LABELS: Record<FriendFieldType, string> = {
  text: 'Text',
  date: 'Date',
  url: 'Link',
  phone: 'Phone',
};

export function FriendFieldDefsDialog({ onClose }: { onClose: () => void }) {
  const { fieldDefs, addFieldDef, updateFieldDef, removeFieldDef } = useFriends();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FriendFieldType>('text');

  const startAdd = () => {
    setEditingId('new');
    setLabel('');
    setType('text');
  };
  const startEdit = (def: FriendFieldDef) => {
    setEditingId(def.id);
    setLabel(def.label);
    setType(def.type);
  };
  const cancelForm = () => setEditingId(null);
  const save = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (editingId && editingId !== 'new') updateFieldDef(editingId, trimmed, type);
    else addFieldDef(trimmed, type);
    cancelForm();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Manage fields</div>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          Field types defined here show up as optional fields you can fill in on any friend.
        </p>

        <div className="class-list">
          {fieldDefs.map((def) => (
            <div className="class-row" key={def.id}>
              <div className="class-row-main">
                <span className="class-row-name">{def.label}</span>
                <span className="class-row-meta text-muted">{FIELD_TYPE_LABELS[def.type]}</span>
              </div>
              <div className="class-row-actions">
                <button className="btn btn-icon" type="button" title="Edit" onClick={() => startEdit(def)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button className="btn btn-icon" type="button" title="Remove" onClick={() => removeFieldDef(def.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          ))}
          {fieldDefs.length === 0 && <div className="empty-msg">No custom fields yet.</div>}
        </div>

        {editingId === null && (
          <button className="btn btn-secondary" type="button" onClick={startAdd}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Add field
          </button>
        )}

        {editingId !== null && (
          <div className="entity-form">
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="field" style={{ flex: 2 }}>
                <label>Label</label>
                <input className="input" type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Favorite coffee" />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Type</label>
                <select className="input" value={type} onChange={(e) => setType(e.target.value as FriendFieldType)}>
                  {(Object.keys(FIELD_TYPE_LABELS) as FriendFieldType[]).map((t) => (
                    <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="dialog-actions" style={{ marginTop: 0 }}>
              <button className="btn btn-secondary" type="button" onClick={cancelForm}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={save}>Save field</button>
            </div>
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
