import { useState } from 'react';
import { Widget, PageHeader } from '../components/Widget';
import { CountdownIcon, COUNTDOWN_TYPE_LABELS } from '../components/CountdownIcon';
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu';
import { CountdownDialog } from '../components/CountdownDialog';
import { useCountdowns, type Countdown } from '../state/CountdownsContext';
import './Countdowns.css';

function daysUntilNext(month: number, day: number) {
  const now = new Date();
  let target = new Date(now.getFullYear(), month - 1, day);
  target.setHours(0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (target < today) target = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function daysLabel(days: number) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function CountdownsPage() {
  const { countdowns, addCountdown, updateCountdown, removeCountdown } = useCountdowns();
  const [dialogState, setDialogState] = useState<'add' | Countdown | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; countdown: Countdown } | null>(null);

  const sorted = [...countdowns].sort((a, b) => daysUntilNext(a.month, a.day) - daysUntilNext(b.month, b.day));

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          label: 'Edit countdown',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          ),
          onClick: () => setDialogState(menu.countdown),
        },
        {
          label: 'Delete countdown',
          danger: true,
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          ),
          onClick: () => removeCountdown(menu.countdown.id),
        },
      ]
    : [];

  return (
    <div className="page">
      <PageHeader
        kicker="Mark your calendar"
        title="Countdowns"
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setDialogState('add')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Add countdown
          </button>
        }
      />

      <Widget>
        {sorted.length === 0 && (
          <div className="cd-empty">
            <CountdownIcon type="birthday" className="cd-empty-icon" />
            <div>No countdowns yet — add one to start tracking.</div>
          </div>
        )}
        {sorted.length > 0 && (
          <div className="cd-grid">
            {sorted.map((c) => {
              const days = daysUntilNext(c.month, c.day);
              return (
                <div
                  className="cd-card"
                  key={c.id}
                  onClick={() => setDialogState(c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, countdown: c });
                  }}
                >
                  <div className="cd-card-top">
                    <div className={`cd-card-icon cd-icon-${c.type}`}>
                      <CountdownIcon type={c.type} />
                    </div>
                    <span className="tag tag-neutral">{COUNTDOWN_TYPE_LABELS[c.type]}</span>
                  </div>
                  <div className="cd-card-name">{c.name}</div>
                  <div className="cd-card-date text-muted">{MONTH_NAMES[c.month - 1]} {c.day}</div>
                  <div className="cd-card-count">
                    <div className="cd-card-days">{days === 0 || days === 1 ? '' : days}</div>
                    <div className="cd-card-days-label">{daysLabel(days)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Widget>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

      {dialogState && (
        <CountdownDialog
          countdown={dialogState === 'add' ? null : dialogState}
          onClose={() => setDialogState(null)}
          onSave={(name, month, day, type) => {
            if (dialogState === 'add') addCountdown(name, month, day, type);
            else updateCountdown(dialogState.id, name, month, day, type);
          }}
        />
      )}
    </div>
  );
}
