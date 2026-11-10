import type { ReactNode } from 'react';
import './Widget.css';

export function Widget({ children, style, align, className }: { children: ReactNode; style?: React.CSSProperties; align?: 'center'; className?: string }) {
  return (
    <div className={`widget${className ? ` ${className}` : ''}`} style={{ ...(align === 'center' ? { alignItems: 'center' } : {}), ...style }}>
      {children}
    </div>
  );
}

export function PageHeader({ kicker, title, subtitle, actions }: { kicker: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div style={{ minWidth: 0 }}>
        <h6>{kicker}</h6>
        <h1 style={{ fontSize: 32 }}>{title}</h1>
        {subtitle && <p className="page-header-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
