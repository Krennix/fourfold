import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSchool } from '../state/SchoolContext';
import { useCalendarEvents } from '../state/CalendarContext';
import './MentionField.css';

export interface MentionLink {
  type: 'class' | 'event';
  id: string;
  label: string;
}

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

/**
 * A text field (input or textarea) that supports typing `@` to link a class
 * and `~` to link a calendar event, anywhere in the app.
 */
export function MentionField({
  value,
  onChange,
  onPick,
  placeholder,
  multiline,
  autoFocus,
  className,
  onEnter,
  hint = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick?: (link: MentionLink) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  className?: string;
  onEnter?: () => void;
  hint?: boolean;
}) {
  const { classes } = useSchool();
  const { events } = useCalendarEvents();
  const [mention, setMention] = useState<Mention | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleChange = (next: string, caret: number) => {
    onChange(next);
    setMention(findMention(next, caret));
  };

  const pickSuggestion = (id: string, label: string) => {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.start + 1 + mention.query.length);
    const inserted = `${mention.trigger}${label} `;
    onChange(`${before}${inserted}${after}`);
    onPick?.({ type: mention.trigger === '@' ? 'class' : 'event', id, label });
    setMention(null);
    requestAnimationFrame(() => (multiline ? textareaRef.current : inputRef.current)?.focus());
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !multiline && !mention) onEnter?.();
    if (e.key === 'Escape') setMention(null);
  };

  return (
    <div className="mention-field">
      {multiline ? (
        <textarea
          className={`input ${className ?? ''}`.trim()}
          ref={textareaRef}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyUp={(e) => handleChange(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <input
          className={`input ${className ?? ''}`.trim()}
          type="text"
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyUp={(e) => handleChange(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
          onKeyDown={handleKeyDown}
        />
      )}
      {mention && suggestions.length > 0 && (
        <div className="mention-menu">
          {suggestions.map((s) => (
            <div className="mention-opt" key={s.id} onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s.id, s.label); }}>
              <span className="mention-trigger">{mention.trigger}</span>{s.label}
            </div>
          ))}
        </div>
      )}
      {hint && (
        <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
          Type <strong>@</strong> to link a class, <strong>~</strong> to link a calendar event.
        </div>
      )}
    </div>
  );
}
