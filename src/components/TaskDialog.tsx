import { useMemo, useRef, useState } from 'react';
import type { QuadKey, TaskLink } from '../state/MatrixContext';
import { useSchool } from '../state/SchoolContext';
import { useCalendarEvents } from '../state/CalendarContext';
import './TaskDialog.css';

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180] as const;

const QUAD_OPTIONS: { key: QuadKey; numeral: string; label: string }[] = [
  { key: 'q1', numeral: 'I', label: 'Urgent & Important' },
  { key: 'q2', numeral: 'II', label: 'Not Urgent & Important' },
  { key: 'q3', numeral: 'III', label: 'Urgent & Not Important' },
  { key: 'q4', numeral: 'IV', label: 'Not Urgent & Not Important' },
];

interface Mention {
  trigger: '@' | '~';
  start: number;
  query: string;
}

function findMention(text: string, caret: number): Mention | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf('@');
  const tilde = upto.lastIndexOf('~');
  const start = Math.max(at, tilde);
  if (start === -1) return null;
  const query = upto.slice(start + 1);
  if (/\s/.test(query)) return null;
  return { trigger: text[start] as '@' | '~', start, query };
}

export function TaskDialog({
  initialQuad,
  onClose,
  onSave,
}: {
  initialQuad: QuadKey;
  onClose: () => void;
  onSave: (data: { title: string; quad: QuadKey; dueDate: string | null; link: TaskLink | null; durationMin: number | null }) => void;
}) {
  const { classes } = useSchool();
  const { events } = useCalendarEvents();
  const [title, setTitle] = useState('');
  const [quad, setQuad] = useState<QuadKey>(initialQuad);
  const [dueDate, setDueDate] = useState('');
  const [durationMin, setDurationMin] = useState<number>(30);
  const [link, setLink] = useState<TaskLink | null>(null);
  const [mention, setMention] = useState<Mention | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    if (mention.trigger === '@') {
      return classes
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, 6)
        .map((c) => ({ id: c.id, label: c.name }));
    }
    const seen = new Set<string>();
    return events
      .filter((e) => e.title.toLowerCase().includes(q) && !seen.has(e.id) && seen.add(e.id))
      .slice(0, 6)
      .map((e) => ({ id: e.id, label: e.title }));
  }, [mention, classes, events]);

  const handleTitleChange = (value: string, caret: number) => {
    setTitle(value);
    setMention(findMention(value, caret));
  };

  const pickSuggestion = (id: string, label: string) => {
    if (!mention) return;
    const before = title.slice(0, mention.start);
    const after = title.slice(mention.start + 1 + mention.query.length);
    const inserted = `${mention.trigger}${label} `;
    setTitle(`${before}${inserted}${after}`);
    setLink({ type: mention.trigger === '@' ? 'class' : 'event', id, label });
    setMention(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave({ title: trimmed, quad, dueDate: dueDate || null, link, durationMin });
    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">New task</div>

        <div className="field mention-field">
          <label>Title</label>
          <input
            className="input"
            type="text"
            ref={inputRef}
            value={title}
            placeholder="Finish reading ch. 4 @Calculus II"
            autoFocus
            onChange={(e) => handleTitleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyUp={(e) => handleTitleChange(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !mention) handleSave();
              if (e.key === 'Escape') setMention(null);
            }}
          />
          {mention && suggestions.length > 0 && (
            <div className="mention-menu">
              {suggestions.map((s) => (
                <div className="mention-opt" key={s.id} onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s.id, s.label); }}>
                  <span className="mention-trigger">{mention.trigger}</span>{s.label}
                </div>
              ))}
            </div>
          )}
          <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Type <strong>@</strong> to link a class, <strong>~</strong> to link a calendar event.
          </div>
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

        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
