import { useEffect } from 'react';
import './Toaster.css';

export interface ToastItem {
  id: number;
  message: string;
  tone?: 'default' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(toast.id), toast.durationMs ?? (toast.action ? 6000 : 3500));
    return () => window.clearTimeout(t);
  }, [toast, onDismiss]);

  return (
    <div className={`toast toast-${toast.tone ?? 'default'}`} role="status">
      <span className="toast-dot" aria-hidden />
      <span className="toast-msg">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

export function Toaster({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
