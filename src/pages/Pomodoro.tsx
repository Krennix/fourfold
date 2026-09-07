import { useEffect, useRef, useState } from 'react';
import { Widget } from '../components/Widget';
import { usePomodoro, POMODORO_MODES as MODES, POMODORO_MODE_LABELS as MODE_LABELS, type PomodoroMode as Mode } from '../state/PomodoroContext';
import './Pomodoro.css';

const SOUND_DEFS = [
  { key: 'rain', label: 'Rain' },
  { key: 'waves', label: 'Ocean waves' },
  { key: 'white', label: 'White noise' },
  { key: 'forest', label: 'Forest & birds' },
  { key: 'cafe', label: 'Cafe' },
  { key: 'fireplace', label: 'Fireplace' },
] as const;

type SoundKey = (typeof SOUND_DEFS)[number]['key'];

function makeNoiseBuffer(ctx: AudioContext, kind: 'white' | 'brown', seconds = 4) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  } else {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

function playCrackle(ctx: AudioContext, dest: AudioNode) {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, 'white', 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1500 + Math.random() * 2500;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.5 + Math.random() * 0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05 + Math.random() * 0.05);
  src.connect(filter).connect(gain).connect(dest);
  src.start();
  src.stop(now + 0.15);
}

function playChirp(ctx: AudioContext, dest: AudioNode) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const base = 1800 + Math.random() * 1400;
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), now + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  osc.connect(gain).connect(dest);
  osc.start(now);
  osc.stop(now + 0.2);
}

type SoundHandle = { stop: () => void };

function startSound(ctx: AudioContext, key: SoundKey, dest: AudioNode): SoundHandle {
  const source = ctx.createBufferSource();
  const timers: number[] = [];
  const extraNodes: AudioNode[] = [];

  switch (key) {
    case 'white': {
      source.buffer = makeNoiseBuffer(ctx, 'white');
      source.loop = true;
      source.connect(dest);
      break;
    }
    case 'rain': {
      source.buffer = makeNoiseBuffer(ctx, 'white');
      source.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2200;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 8000;
      source.connect(hp).connect(lp).connect(dest);
      break;
    }
    case 'waves': {
      source.buffer = makeNoiseBuffer(ctx, 'brown');
      source.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const swell = ctx.createGain();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.35;
      swell.gain.value = 0.65;
      lfo.connect(lfoGain).connect(swell.gain);
      lfo.start();
      source.connect(lp).connect(swell).connect(dest);
      extraNodes.push(lfo);
      break;
    }
    case 'forest': {
      source.buffer = makeNoiseBuffer(ctx, 'brown');
      source.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1000;
      const bed = ctx.createGain();
      bed.gain.value = 0.4;
      source.connect(lp).connect(bed).connect(dest);
      const scheduleChirp = () => {
        playChirp(ctx, dest);
        timers.push(window.setTimeout(scheduleChirp, 800 + Math.random() * 3500));
      };
      timers.push(window.setTimeout(scheduleChirp, 500));
      break;
    }
    case 'cafe': {
      source.buffer = makeNoiseBuffer(ctx, 'brown');
      source.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.6;
      source.connect(bp).connect(dest);
      break;
    }
    case 'fireplace': {
      source.buffer = makeNoiseBuffer(ctx, 'brown');
      source.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      const bed = ctx.createGain();
      bed.gain.value = 0.5;
      source.connect(lp).connect(bed).connect(dest);
      const scheduleCrackle = () => {
        playCrackle(ctx, dest);
        timers.push(window.setTimeout(scheduleCrackle, 150 + Math.random() * 400));
      };
      timers.push(window.setTimeout(scheduleCrackle, 100));
      break;
    }
  }

  source.start();

  return {
    stop: () => {
      timers.forEach((t) => window.clearTimeout(t));
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
      extraNodes.forEach((n) => {
        if (n instanceof OscillatorNode) {
          try { n.stop(); } catch { /* already stopped */ }
        }
        n.disconnect();
      });
    },
  };
}

function SoundIcon({ soundKey }: { soundKey: SoundKey }) {
  switch (soundKey) {
    case 'rain':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 13v8" /><path d="M8 13v8" /><path d="M12 15v8" /><path d="M20 16.6A5 5 0 0 0 18 7h-1.3A6.5 6.5 0 1 0 5 13.5" /></svg>;
    case 'waves':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" /><path d="M2 18c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" /></svg>;
    case 'white':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /><path d="M17.6 7.6A2 2 0 1 1 19 11H2" /></svg>;
    case 'forest':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a4 4 0 0 1 8 0z" /><path d="M17 14v.2a2.5 2.5 0 0 1-1 4.8h-3a2.5 2.5 0 0 1-1-4.8V14a3 3 0 0 1 6 0z" transform="translate(4 -2)" /><path d="M12 22v-4M6 22v-2" /></svg>;
    case 'cafe':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h1a4 4 0 0 1 0 8h-1" /><path d="M3 8h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" /><path d="M6 2v2M10 2v2M14 2v2" /></svg>;
    case 'fireplace':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-2-1-3-1-3s2 1 2 4a5 5 0 0 1-10 0c0-5 4-6 4-10z" /></svg>;
  }
}

export function PomodoroPage() {
  const { mode, secondsLeft, isRunning, sessionsDone, toggleRun, reset, selectMode } = usePomodoro();
  const [activeSound, setActiveSound] = useState<SoundKey | null>(null);
  const [volume, setVolume] = useState(60);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const soundHandleRef = useRef<SoundHandle | null>(null);

  useEffect(() => {
    return () => {
      soundHandleRef.current?.stop();
      audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    soundHandleRef.current?.stop();
    soundHandleRef.current = null;

    if (!activeSound) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      masterGainRef.current = audioCtxRef.current.createGain();
      masterGainRef.current.connect(audioCtxRef.current.destination);
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    if (masterGainRef.current) masterGainRef.current.gain.value = volume / 100;

    soundHandleRef.current = startSound(ctx, activeSound, masterGainRef.current!);

    return () => {
      soundHandleRef.current?.stop();
      soundHandleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSound]);

  useEffect(() => {
    if (masterGainRef.current) masterGainRef.current.gain.value = volume / 100;
  }, [volume]);

  const selectSound = (key: SoundKey) => {
    setActiveSound((s) => (s === key ? null : key));
  };

  const total = MODES[mode];
  const frac = secondsLeft / total;
  const circumference = 2 * Math.PI * 120;
  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const timeLabel = `${mm}:${ss < 10 ? '0' : ''}${ss}`;
  const activeDef = SOUND_DEFS.find((s) => s.key === activeSound);

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
        <div className="widget-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4>Ambient sound</h4>
          {activeDef && <span className="tag tag-outline">{activeDef.label}</span>}
        </div>
        <div className="sound-grid">
          {SOUND_DEFS.map((s) => (
            <div className={`sound-card${activeSound === s.key ? ' active' : ''}`} onClick={() => selectSound(s.key)} key={s.key}>
              <SoundIcon soundKey={s.key} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        {activeDef && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flex: 'none', color: 'var(--color-accent-700)' }}><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>
            <input type="range" min="0" max="100" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
            <span className="text-muted" style={{ fontSize: 12, width: 32, textAlign: 'right' }}>{volume}%</span>
          </div>
        )}
      </Widget>
    </div>
  );
}
