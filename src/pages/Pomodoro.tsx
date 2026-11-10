import { Widget } from '../components/Widget';
import { SpotifyWidget } from '../components/SpotifyWidget';
import { usePomodoro, POMODORO_MODES as MODES, POMODORO_MODE_LABELS as MODE_LABELS, type PomodoroMode as Mode } from '../state/PomodoroContext';
import './Pomodoro.css';

export function PomodoroPage() {
  const { mode, secondsLeft, isRunning, sessionsDone, toggleRun, reset, selectMode, todaySessions, sessionHistory } = usePomodoro();
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { key, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), count: sessionHistory[key] ?? 0, today: i === 6 };
  });
  const weekTotal = week.reduce((n, d) => n + d.count, 0);
  const weekMax = Math.max(4, ...week.map((d) => d.count));

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

      <Widget>
        <div className="widget-head">
          <h4>Focus history</h4>
          <span className="text-muted" style={{ fontSize: 12.5 }}>Saved on this device</span>
        </div>
        <div className="focus-stats">
          <div className="focus-stat"><span className="focus-stat-value">{todaySessions}</span><span className="text-muted">today · {todaySessions * 25} min</span></div>
          <div className="focus-stat"><span className="focus-stat-value">{weekTotal}</span><span className="text-muted">last 7 days · {Math.round((weekTotal * 25) / 6) / 10} h</span></div>
          <div className="focus-week" role="img" aria-label={`Focus sessions over the last 7 days: ${week.map((d) => d.count).join(', ')}`}>
            {week.map((d) => (
              <div className="focus-week-col" key={d.key} title={`${d.count} session${d.count === 1 ? '' : 's'}`}>
                <div className="focus-week-track">
                  <div className={`focus-week-bar${d.today ? ' today' : ''}`} style={{ height: `${(d.count / weekMax) * 100}%` }} />
                </div>
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Widget>

      <SpotifyWidget />
    </div>
  );
}
