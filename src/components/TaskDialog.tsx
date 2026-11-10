import { useState } from 'react';
import type { QuadKey, TaskLink } from '../state/MatrixContext';
import { MentionField } from './MentionField';
import './TaskRow.css';

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180] as const;

const QUAD_OPTIONS: { key: QuadKey; label: string; sub: string }[] = [
  { key: 'q1', label: 'Do first', sub: 'Urgent & important' },
  { key: 'q2', label: 'Schedule', sub: 'Important, not urgent' },
  { key: 'q3', label: 'Delegate', sub: 'Urgent, not important' },
  { key: 'q4', label: 'Eliminate', sub: 'Neither' },
];

export interface TaskDialogInitial {
  title: string;
  description: string;
  dueDate: string | null;
  durationMin: number | null;
  link: TaskLink | null;
  locked: boolean;
}

export function TaskDialog({
  initialQuad,
  initial,
  onClose,
  onSave,
}: {
  initialQuad: QuadKey;
  /** When set, the dialog edits this task instead of creating a new one. */
  initial?: TaskDialogInitial;
  onClose: () => void;
  onSave: (data: { title: string; description: string; quad: QuadKey; dueDate: string | null; link: TaskLink | null; durationMin: number | null; locked: boolean }) => void | Promise<void>;
}) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [quad, setQuad] = useState<QuadKey>(initialQuad);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  // 0 = no estimate. New tasks default to none so saving one doesn't silently book calendar time.
  const [durationMin, setDurationMin] = useState<number>(initial?.durationMin ?? 0);
  const [link, setLink] = useState<TaskLink | null>(initial?.link ?? null);
  const [locked, setLocked] = useState(initial?.locked ?? false);

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    void onSave({ title: trimmed, description: description.trim(), quad, dueDate: dueDate || null, link, durationMin: durationMin || null, locked });
    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{editing ? 'Edit task' : 'New task'}</div>

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
              <option value={0}>No estimate</option>
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? (m % 60 ? ` ${m % 60}m` : '') : ''}`}</option>
              ))}
            </select>
          </div>
        </div>

        {!editing && durationMin > 0 && (
          <div className="text-muted" style={{ fontSize: 12, marginTop: -4 }}>
            A {durationMin < 60 ? `${durationMin}-minute` : `${durationMin / 60}-hour`} slot will be booked on your calendar{dueDate ? ' before the due date' : ''}.
          </div>
        )}

        <div className="field">
          <label>Quadrant</label>
          <div className="quad-picker" role="radiogroup" aria-label="Quadrant">
            {QUAD_OPTIONS.map((q) => (
              <button
                key={q.key}
                type="button"
                role="radio"
                aria-checked={quad === q.key}
                className={`quad-pick${quad === q.key ? ' selected' : ''}`}
                style={{ '--qc': `var(--${q.key})` } as React.CSSProperties}
                onClick={() => setQuad(q.key)}
              >
                <span className="quad-pick-label">{q.label}</span>
                <span className="quad-pick-sub">{q.sub}</span>
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
          Locked — fixed in place, won't be moved or removed by scheduling/AI actions
        </label>

        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={!title.trim()}>{editing ? 'Save changes' : 'Add task'}</button>
        </div>
      </div>
    </div>
  );
}
