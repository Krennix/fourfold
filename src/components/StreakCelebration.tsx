import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import './StreakCelebration.css';

const MILESTONES: Record<number, { badge: string; sub: string }> = {
  3: { badge: 'Getting started', sub: 'Three days running. This is how habits begin.' },
  7: { badge: 'One week', sub: 'A whole week of showing up. That’s a habit forming.' },
  14: { badge: 'Two weeks', sub: 'Two weeks strong. It’s getting automatic.' },
  30: { badge: 'One month', sub: 'A full month. You’re not trying anymore — you’re just doing it.' },
  50: { badge: '50 days', sub: 'Fifty days of fire. Seriously impressive.' },
  100: { badge: 'Triple digits', sub: '100 days. Legendary.' },
  365: { badge: 'One year', sub: 'A year of daily wins. Absolute legend.' },
};

/** Small deterministic pseudo-random in [0, 1) so particle layouts are stable between renders. */
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function StreakCelebration({ streak, onClose }: { streak: number; onClose: () => void }) {
  const [reduced] = useState(prefersReducedMotion);
  const [display, setDisplay] = useState(reduced ? streak : Math.max(0, streak - 1));
  const [landed, setLanded] = useState(reduced);
  const [closing, setClosing] = useState(false);
  const milestone = MILESTONES[streak];

  useEffect(() => {
    if (reduced) return;
    const from = Math.max(0, streak - 1);
    const duration = 700;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (streak - from) * eased));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setLanded(true);
        navigator.vibrate?.(milestone ? [30, 40, 60] : 25);
      }
    };
    const timeout = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 450);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [streak, reduced, milestone]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const sparkCount = milestone ? 36 : 22;
  const sparks = Array.from({ length: sparkCount }, (_, i) => i);
  const embers = Array.from({ length: milestone ? 22 : 14 }, (_, i) => i);

  return (
    <div
      className={`streak-celeb${closing ? ' closing' : ''}${milestone ? ' milestone' : ''}${landed ? ' landed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${streak} day streak`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="streak-celeb-rays" />
      <div className="streak-celeb-glow" />

      <div className="streak-celeb-particles" aria-hidden="true">
        {sparks.map((i) => (
          <span
            key={`s${i}`}
            className="streak-celeb-spark"
            style={
              {
                '--angle': `${(360 / sparkCount) * i + rand(i, 1) * 14}deg`,
                '--dist': `${22 + rand(i, 2) * 30}vh`,
                '--size': `${4 + rand(i, 3) * 7}px`,
                '--hue': 22 + rand(i, 4) * 36,
                '--delay': `${0.42 + rand(i, 5) * 0.12}s`,
              } as CSSProperties
            }
          />
        ))}
        {embers.map((i) => (
          <span
            key={`e${i}`}
            className="streak-celeb-ember"
            style={
              {
                '--x': `${42 + rand(i, 6) * 16}%`,
                '--dx': `${(rand(i, 7) - 0.5) * 90}px`,
                '--size': `${2 + rand(i, 8) * 4}px`,
                '--dur': `${2.6 + rand(i, 9) * 2.2}s`,
                '--delay': `${0.9 + rand(i, 10) * 3}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="streak-celeb-body">
        <div className="streak-celeb-stage">
          <span className="streak-celeb-ring" aria-hidden="true" />
          <span className="streak-celeb-ring streak-celeb-ring-2" aria-hidden="true" />
          <div className="streak-celeb-flame">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="streak-celeb-grad" x1="12" y1="1.6" x2="12" y2="20.2" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FFCF4D" />
                  <stop offset="55%" stopColor="#FF8E1E" />
                  <stop offset="100%" stopColor="#FF4E1E" />
                </linearGradient>
                <linearGradient id="streak-celeb-core" x1="12" y1="9" x2="12" y2="17.5" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FFF3C4" />
                  <stop offset="100%" stopColor="#FFC94A" />
                </linearGradient>
              </defs>
              <path
                className="streak-celeb-outer"
                d="M12.6 1.6c.9 2.8-.4 4.2-1.9 5.9-1.7 1.9-3.5 4-3.5 7.1a5.8 5.8 0 0 0 11.6 0c0-2.5-1-4.2-2.2-5.7-.2 1.6-1 2.7-2 2.7-1.2 0-1.8-1.2-1.3-2.5.8-2 .9-4.6-.7-7.5Z"
                fill="url(#streak-celeb-grad)"
              />
              <path
                className="streak-celeb-mid"
                d="M12.2 12c.5-.6.7-1.3.5-2.1-1 .4-1.3 1.3-2 2.1-.7.8-1.1 1.9-.5 2.9a2.5 2.5 0 0 0 4.6-1.3c0-.9-.5-1.6-1.2-2 .1.6-.2 1.1-.7 1.1-.4 0-.9-.2-.7-.7Z"
                fill="#FFE49A"
              />
              <ellipse className="streak-celeb-core" cx="12.1" cy="16" rx="1.7" ry="2.3" fill="url(#streak-celeb-core)" />
            </svg>
          </div>
        </div>

        {milestone && <div className="streak-celeb-badge">{milestone.badge}</div>}
        <div className="streak-celeb-count" aria-live="polite">{display}</div>
        <div className="streak-celeb-label">{streak === 1 ? 'day streak started!' : 'day streak!'}</div>
        <div className="streak-celeb-sub">{milestone?.sub ?? 'You hit 80%+ of your habits today. Keep it lit.'}</div>

        <button className="streak-celeb-btn" type="button" onClick={close} autoFocus>
          Nice!
        </button>
      </div>
    </div>
  );
}
