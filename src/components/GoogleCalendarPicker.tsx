import { useEffect, useState } from 'react';
import { listCalendarList } from '../lib/googleCalendar';
import type { LinkedCalendar } from '../state/GoogleAuthContext';
import './GoogleCalendarPicker.css';

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
      <div className="dialog gcal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="gcal-header">
          <div className="gcal-icon" aria-hidden="true">📅</div>
          <div className="gcal-heading">
            <div className="dialog-title">Choose calendars to sync</div>
            <span className="gcal-subtitle">{accountEmail}</span>
          </div>
        </div>

        {loading && <p className="gcal-status">Loading calendars…</p>}
        {error && <p className="gcal-status" style={{ color: 'var(--danger, #c0392b)' }}>{error}</p>}
        {!loading && !error && (
          <div className="gcal-list">
            {calendars.map((c) => (
              <label className="gcal-row" key={c.id}>
                <input type="checkbox" checked={c.selected} onChange={() => toggle(c.id)} />
                <span className="gcal-dot" style={{ background: c.color }} />
                <span className="gcal-name">{c.summary}</span>
              </label>
            ))}
            {calendars.length === 0 && <div className="gcal-status">No calendars found on this account.</div>}
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
