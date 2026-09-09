import { useEffect, useState } from 'react';
import { listCalendarList } from '../lib/googleCalendar';
import type { LinkedCalendar } from '../state/GoogleAuthContext';

/**
 * Modal for choosing which of a Google account's calendars to sync. Rendered right after an
 * account finishes OAuth (`pendingPicker`), and reopenable from Settings to edit the selection.
 */
export function GoogleCalendarPicker({
  accountEmail,
  accessToken,
  initialSelection,
  onSave,
  onCancel,
}: {
  accountEmail: string;
  accessToken: string;
  initialSelection: LinkedCalendar[];
  onSave: (calendars: LinkedCalendar[]) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<LinkedCalendar[]>(initialSelection);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listCalendarList(accessToken)
      .then((items) => {
        if (cancelled) return;
        const known = new Map(initialSelection.map((c) => [c.id, c.selected]));
        setCalendars(
          items.map((item) => ({
            id: item.id,
            summary: item.summary,
            color: item.backgroundColor,
            selected: known.get(item.id) ?? item.primary === true,
          })),
        );
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const toggle = (id: string) => {
    setCalendars((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  };

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Choose calendars for {accountEmail}</div>
        {loading && <p className="text-muted" style={{ fontSize: 12.5 }}>Loading calendars…</p>}
        {error && <p className="text-muted" style={{ fontSize: 12.5, color: 'var(--danger, #c0392b)' }}>{error}</p>}
        {!loading && !error && (
          <div className="class-list">
            {calendars.map((c) => (
              <label className="class-row" key={c.id} style={{ cursor: 'pointer' }}>
                <div className="class-row-main" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={c.selected} onChange={() => toggle(c.id)} />
                  <span className="class-row-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
                    {c.summary}
                  </span>
                </div>
              </label>
            ))}
            {calendars.length === 0 && <div className="empty-msg">No calendars found on this account.</div>}
          </div>
        )}
        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" type="button" disabled={loading || !!error} onClick={() => onSave(calendars)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
