import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '../state/AuthContext';
import './LoginGate.css';

function GoogleButton() {
  const { clientId, handleCredential } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const init = () => {
      if (cancelled || !buttonRef.current) return;
      if (!window.google) {
        setTimeout(init, 150);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          void handleCredential(response.credential);
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 260,
      });
    };
    init();

    return () => {
      cancelled = true;
    };
  }, [clientId, handleCredential]);

  return <div ref={buttonRef} className="login-gate-button" />;
}

export function LoginGate({ children }: { children: ReactNode }) {
  const { status, error } = useAuth();

  if (status === 'unlocked') return <>{children}</>;

  return (
    <div className="login-gate">
      <div className="login-gate-card">
        <div className="login-gate-brand">Fourfold</div>
        <p className="login-gate-copy">Sign in with an approved Google account to continue.</p>

        {status === 'unconfigured' ? (
          <p className="login-gate-error">
            No Google client is configured (missing <code>VITE_GOOGLE_CLIENT_ID</code>), so sign-in is unavailable.
          </p>
        ) : (
          <GoogleButton />
        )}

        {status === 'verifying' && <p className="login-gate-hint">Verifying…</p>}
        {(status === 'denied' || status === 'locked') && error && <p className="login-gate-error">{error}</p>}
      </div>
    </div>
  );
}
