import { useState } from 'react';
import type { QuadKey, TaskLink } from '../state/MatrixContext';
import { MentionField } from './MentionField';

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180] as const;

const QUAD_OPTIONS: { key: QuadKey; numeral: string; label: string }[] = [
  { key: 'q1', numeral: 'I', label: 'Urgent & Important' },
  { key: 'q2', numeral: 'II', label: 'Not Urgent & Important' },
  { key: 'q3', numeral: 'III', label: 'Urgent & Not Important' },
  { key: 'q4', numeral: 'IV', label: 'Not Urgent & Not Important' },
];

export function TaskDialog({
  initialQuad,
  onClose,
  onSave,
}: {
  initialQuad: QuadKey;
  onClose: () => void;
  onSave: (data: { title: string; description: string; quad: QuadKey; dueDate: string | null; link: TaskLink | null; durationMin: number | null; locked: boolean }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quad, setQuad] = useState<QuadKey>(initialQuad);
  const [dueDate, setDueDate] = useState('');
  const [durationMin, setDurationMin] = useState<number>(30);
  const [link, setLink] = useState<TaskLink | null>(null);
  const [locked, setLocked] = useState(false);

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave({ title: trimmed, description: description.trim(), quad, dueDate: dueDate || null, link, durationMin, locked });
    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">New task</div>

        <div className="field">
          <label>Title</label>
          <MentionField
            value={title}
            onChange={setTitle}
            onPick={setLink}
            placeholder="Finish reading ch. 4 @Calculus II"
            autoFocus
            onEnter={handleSave}
          />
        </div>

        <div className="field">
          <label>Description</label>
          <MentionField
            value={description}
            onChange={setDescription}
            onPick={setLink}
            placeholder="Add any extra details (optional)"
            multiline
            hint={false}
          />
        </div>

        {link && (
          <div className="field">
            <span className="tag tag-accent-2" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {link.type === 'class' ? '@' : '~'}{link.label}
              <button
                type="button"
                onClick={() => setLink(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}
                aria-label="Remove link"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Due date</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Time needed</label>
            <select className="input" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? (m % 60 ? ` ${m % 60}m` : '') : ''}`}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Priority</label>
          <select className="input" value={quad} onChange={(e) => setQuad(e.target.value as QuadKey)}>
            {QUAD_OPTIONS.map((q) => <option key={q.key} value={q.key}>{q.numeral} · {q.label}</option>)}
          </select>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
          Locked — fixed in place, won't be moved or removed by scheduling/AI actions
        </label>

        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
