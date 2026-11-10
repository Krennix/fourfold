import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { dueInfo } from '../lib/due';
import { formatDuration } from '../lib/quickAdd';
import './TaskRow.css';

export interface TaskRowData {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  durationMin: number | null;
  time: string | null;
  listTag?: string;
  locked?: boolean;
  description?: string;
  source?: 'matrix' | 'homework';
}

export function Checkbox({ checked, onToggle, label, color }: { checked: boolean; onToggle: () => void; label: string; color?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`tcheck${checked ? ' done' : ''}`}
      style={color ? ({ '--check-color': color } as React.CSSProperties) : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Icon name="check" strokeWidth={3} />
    </button>
  );
}

export function TaskRow({
  task,
  color,
  onToggle,
  onMenu,
  onOpen,
  actions,
  extraMeta,
  draggable,
  onDragStart,
  compact,
}: {
  task: TaskRowData;
  color?: string;
  onToggle: () => void;
  onMenu?: (x: number, y: number) => void;
  /** Clicking the title/body opens the item (e.g. to edit it). */
  onOpen?: () => void;
  actions?: ReactNode;
  extraMeta?: ReactNode;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  compact?: boolean;
}) {
  const due = task.done ? null : dueInfo(task.dueDate);
  return (
    <div
      className={`task-row${task.done ? ' is-done' : ''}${compact ? ' compact' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onContextMenu={
        onMenu
          ? (e) => {
              e.preventDefault();
              onMenu(e.clientX, e.clientY);
            }
          : undefined
      }
    >
      <Checkbox checked={task.done} onToggle={onToggle} label={task.done ? `Mark “${task.title}” not done` : `Complete “${task.title}”`} color={color} />
      <div
        className={`task-main${onOpen ? ' clickable' : ''}`}
        onClick={onOpen}
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onKeyDown={onOpen ? (e) => { if (e.key === 'Enter') onOpen(); } : undefined}
      >
        <span className="ttitle" title={task.description || task.title}>
          {task.locked && <Icon name="lock" className="tlock" />}
          {task.title}
        </span>
        {(due || task.time || task.durationMin || task.source === 'homework' || (task.listTag && task.listTag !== 'Inbox') || extraMeta) && (
          <span className="tmeta">
            {due && <span className={`tdue tdue-${due.tone}`}><Icon name="calendar" />{due.label}</span>}
            {task.time && !task.done && <span className="tchip tchip-time"><Icon name="clock" />{task.time}</span>}
            {task.durationMin ? <span className="tchip">{formatDuration(task.durationMin)}</span> : null}
            {task.source === 'homework' && <span className="tchip tchip-hw" title="From the School tab"><Icon name="book" />{task.listTag}</span>}
            {task.source !== 'homework' && task.listTag && task.listTag !== 'Inbox' && <span className="tchip">{task.listTag}</span>}
            {extraMeta}
          </span>
        )}
      </div>
      {(actions || onMenu) && (
        <div className="task-actions">
          {actions}
          {onMenu && (
            <button
              type="button"
              className="btn btn-icon task-menu-btn"
              aria-label={`More actions for “${task.title}”`}
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                onMenu(r.left, r.bottom + 4);
              }}
            >
              <Icon name="more" strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
