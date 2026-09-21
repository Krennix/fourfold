import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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

function PinForm() {
  const { status, handlePin } = useAuth();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pin.trim()) return;
    void handlePin(email.trim(), pin.trim());
  };

  return (
    <form className="login-gate-pin-form" onSubmit={submit}>
      <input
        className="input"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
      />
      <input
        className="input"
        type="password"
        placeholder="PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        autoComplete="current-password"
      />
      <button className="btn btn-primary" type="submit" disabled={status === 'verifying'}>Sign in</button>
    </form>
  );
}

export function LoginGate({ children }: { children: ReactNode }) {
  const { status, error, clientId } = useAuth();
  const [showPin, setShowPin] = useState(!clientId);

  if (status === 'unlocked') return <>{children}</>;

  return (
    <div className="login-gate">
      <div className="login-gate-card">
        <div className="login-gate-brand">Fourfold</div>
        <p className="login-gate-copy">Sign in with an approved Google account to continue.</p>

        {!clientId && (
          <p className="login-gate-error">
            No Google client is configured (missing <code>VITE_GOOGLE_CLIENT_ID</code>), so Google sign-in is unavailable.
          </p>
        )}

        {clientId && !showPin && <GoogleButton />}
        {showPin && <PinForm />}

        {clientId && (
          <button type="button" className="login-gate-link" onClick={() => setShowPin((v) => !v)}>
            {showPin ? 'Use Google instead' : 'Use email + PIN instead'}
          </button>
        )}

        {status === 'verifying' && <p className="login-gate-hint">Verifying…</p>}
        {(status === 'denied' || status === 'locked') && error && <p className="login-gate-error">{error}</p>}
      </div>
    </div>
  );
}
