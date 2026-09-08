import { useEffect, useState, type CSSProperties } from 'react';
import './StreakCelebration.css';

export function StreakCelebration({ streak, onClose }: { streak: number; onClose: () => void }) {
  const [display, setDisplay] = useState(Math.max(0, streak - 1));
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const from = Math.max(0, streak - 1);
    if (from === streak) return;
    const duration = 650;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (streak - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const timeout = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 350);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [streak]);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const particles = Array.from({ length: 18 }, (_, i) => i);

  return (
    <div className={`streak-celeb${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={`${streak} day streak`}>
      <div className="streak-celeb-rays" />
      <div className="streak-celeb-particles">
        {particles.map((i) => (
          <span
            key={i}
            className="streak-celeb-particle"
            style={{ '--i': i, '--n': particles.length } as CSSProperties}
          />
        ))}
      </div>

      <div className="streak-celeb-body">
        <div className="streak-celeb-flame">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12.6 1.6c.9 2.8-.4 4.2-1.9 5.9-1.7 1.9-3.5 4-3.5 7.1a5.8 5.8 0 0 0 11.6 0c0-2.5-1-4.2-2.2-5.7-.2 1.6-1 2.7-2 2.7-1.2 0-1.8-1.2-1.3-2.5.8-2 .9-4.6-.7-7.5Z"
              fill="url(#streak-celeb-grad)"
            />
            <path
              d="M12.2 12c.5-.6.7-1.3.5-2.1-1 .4-1.3 1.3-2 2.1-.7.8-1.1 1.9-.5 2.9a2.5 2.5 0 0 0 4.6-1.3c0-.9-.5-1.6-1.2-2 .1.6-.2 1.1-.7 1.1-.4 0-.9-.2-.7-.7Z"
              fill="#FFE49A"
            />
            <defs>
              <linearGradient id="streak-celeb-grad" x1="12" y1="1.6" x2="12" y2="20.2" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FFCF4D" />
                <stop offset="55%" stopColor="#FF8E1E" />
                <stop offset="100%" stopColor="#FF5A1E" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="streak-celeb-count">{display}</div>
        <div className="streak-celeb-label">day streak!</div>
        <div className="streak-celeb-sub">You hit 80%+ of your habits today. Keep it lit.</div>

        <button className="streak-celeb-btn" type="button" onClick={close} autoFocus>
          Nice!
        </button>
      </div>
    </div>
  );
}
