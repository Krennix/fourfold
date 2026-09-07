import type { ReactNode } from 'react';
import './Widget.css';

export function Widget({ children, style, align }: { children: ReactNode; style?: React.CSSProperties; align?: 'center' }) {
  return (
    <div className="widget blueprint" style={{ ...(align === 'center' ? { alignItems: 'center' } : {}), ...style }}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
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
