import type { ReactNode } from 'react';
import './Widget.css';

export function Widget({ children, style, align }: { children: ReactNode; style?: React.CSSProperties; align?: 'center' }) {
  return (
    <div className="widget" style={{ ...(align === 'center' ? { alignItems: 'center' } : {}), ...style }}>
      {children}
    </div>
  );
}

export function PageHeader({ kicker, title, actions }: { kicker: string; title: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h6 className="text-muted" style={{ marginBottom: 6 }}>{kicker}</h6>
        <h1 style={{ fontSize: 34 }}>{title}</h1>
      </div>
      {actions}
    </div>
  );
}
