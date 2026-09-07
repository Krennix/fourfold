import { useEffect, useRef, useState, type ReactNode } from 'react';
import './ContextMenu.css';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: ReactNode;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const ny = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('contextmenu', handleClick);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('contextmenu', handleClick);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return (
    <div className="context-menu" style={{ top: pos.y, left: pos.x }} ref={ref}>
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          className={`context-menu-item${item.danger ? ' danger' : ''}`}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
