import { Widget } from '../components/Widget';
import { SpotifyWidget } from '../components/SpotifyWidget';
import { usePomodoro, POMODORO_MODES as MODES, POMODORO_MODE_LABELS as MODE_LABELS, type PomodoroMode as Mode } from '../state/PomodoroContext';
import './Pomodoro.css';

export function PomodoroPage() {
  const { mode, secondsLeft, isRunning, sessionsDone, toggleRun, reset, selectMode } = usePomodoro();

  const total = MODES[mode];
  const frac = secondsLeft / total;
  const circumference = 2 * Math.PI * 120;
  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const timeLabel = `${mm}:${ss < 10 ? '0' : ''}${ss}`;

  return (
    <div className="page pomodoro-page">
      <div>
        <h6 className="text-muted" style={{ marginBottom: 6 }}>Focus</h6>
        <h1 style={{ fontSize: 34 }}>Pomodoro Timer</h1>
      </div>

      <Widget align="center">
        <div className="seg">
          {(['focus', 'short', 'long'] as Mode[]).map((m) => (
            <label className="seg-opt" style={{ borderRadius: 5 }} key={m}>
              <input type="radio" name="pomo-mode" checked={mode === m} onChange={() => selectMode(m)} />
              {MODE_LABELS[m]}
            </label>
          ))}
        </div>

        <div className="ring-wrap">
          <svg viewBox="0 0 280 280" width="280" height="280">
            <circle cx="140" cy="140" r="120" fill="none" stroke="var(--color-neutral-200)" strokeWidth="10" />
            <circle
              cx="140" cy="140" r="120" fill="none" stroke="var(--color-accent)" strokeWidth="10"
              strokeLinecap="round" transform="rotate(-90 140 140)"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - frac)}
            />
          </svg>
          <div className="ring-time">
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 56, fontWeight: 600 }}>{timeLabel}</div>
            <div className="text-muted" style={{ fontSize: 13 }}>{MODE_LABELS[mode]}</div>
          </div>
        </div>

        <div className="dots">
          {[0, 1, 2, 3].map((i) => (
            <span className={`dot${i < sessionsDone ? ' filled' : ''}`} key={i} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" type="button" onClick={reset}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 1 3 6.7" /><path d="M3 16v-4h4" /></svg>
            Reset
          </button>
          <button className="btn btn-primary" type="button" onClick={toggleRun} style={{ minWidth: 140 }}>
            {isRunning ? (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>Pause</>
            ) : (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7 4 13 8-13 8z" /></svg>Start</>
            )}
          </button>
        </div>
      </Widget>

      <SpotifyWidget />
    </div>
  );
}
