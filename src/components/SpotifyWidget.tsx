import { useCallback, useEffect, useRef, useState } from 'react';
import { Widget } from './Widget';
import { useSpotifyAuth } from '../state/SpotifyAuthContext';
import {
  createBrowserPlayer,
  getPlaybackState,
  pause,
  play,
  skipNext,
  skipPrevious,
  SpotifyAuthError,
  SpotifyPlaybackError,
  transferPlayback,
  type BrowserPlayerHandle,
  type PlaybackState,
} from '../lib/spotify';
import './SpotifyWidget.css';

const POLL_MS = 4000;

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${ss < 10 ? '0' : ''}${ss}`;
}

export function SpotifyWidget() {
  const { connected, displayName, product, connecting, connectError, connect, disconnect, getAccessToken } = useSpotifyAuth();
  const [state, setState] = useState<PlaybackState | null>(null);
  const [displayProgressMs, setDisplayProgressMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [inTabPlayer, setInTabPlayer] = useState<BrowserPlayerHandle | null>(null);
  const [switchingDevice, setSwitchingDevice] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const playerRef = useRef<BrowserPlayerHandle | null>(null);
  const syncRef = useRef<{ progressMs: number; atMs: number } | null>(null);
  const suppressPollUntilRef = useRef(0);

  const withRetry = useCallback(
    async <T,>(fn: (accessToken: string) => Promise<T>): Promise<T | null> => {
      const token = await getAccessToken();
      if (!token) return null;
      try {
        return await fn(token);
      } catch (err) {
        if (err instanceof SpotifyAuthError) {
          const fresh = await getAccessToken({ force: true });
          if (!fresh) return null;
          return await fn(fresh);
        }
        throw err;
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    if (!connected) {
      setState(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      // Right after a control action, Spotify's own state takes a moment to catch up —
      // skip this tick rather than briefly showing (or erroring on) stale data.
      if (Date.now() < suppressPollUntilRef.current) return;
      try {
        const next = await withRetry((token) => getPlaybackState(token));
        if (!cancelled) {
          setState(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && err instanceof SpotifyPlaybackError) setError(null);
      }
    };
    void poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [connected, withRetry]);

  useEffect(() => {
    return () => {
      playerRef.current?.disconnect();
    };
  }, []);

  // Poll results only arrive every few seconds — interpolate between them locally so the
  // progress bar advances smoothly instead of jumping.
  useEffect(() => {
    if (!state) {
      syncRef.current = null;
      setDisplayProgressMs(0);
      return;
    }
    syncRef.current = { progressMs: state.progressMs, atMs: Date.now() };
    setDisplayProgressMs(state.progressMs);
    if (!state.isPlaying) return;

    const id = window.setInterval(() => {
      if (!syncRef.current) return;
      const elapsed = Date.now() - syncRef.current.atMs;
      setDisplayProgressMs(Math.min(state.durationMs, syncRef.current.progressMs + elapsed));
    }, 500);
    return () => window.clearInterval(id);
  }, [state]);

  const toggleInTabPlayer = async () => {
    if (inTabPlayer) {
      inTabPlayer.disconnect();
      playerRef.current = null;
      setInTabPlayer(null);
      return;
    }
    setSwitchingDevice(true);
    setError(null);
    try {
      const handle = await createBrowserPlayer(
        () => getAccessToken(),
        (playerState) => {
          if (!playerState) return;
          setState((prev) => ({
            isPlaying: !playerState.paused,
            trackName: playerState.track_window.current_track.name,
            artistNames: playerState.track_window.current_track.artists.map((a) => a.name).join(', '),
            albumArt: playerState.track_window.current_track.album.images[0]?.url ?? null,
            progressMs: playerState.position,
            durationMs: playerState.duration,
            deviceId: prev?.deviceId ?? null,
            deviceName: 'Fourfold Pomodoro',
          }));
        },
      );
      playerRef.current = handle;
      setInTabPlayer(handle);
      await withRetry((token) => transferPlayback(token, handle.deviceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start in-browser playback.');
    } finally {
      setSwitchingDevice(false);
    }
  };

  const handleTogglePlay = async () => {
    if (controlBusy) return;
    setControlBusy(true);
    // Hold off the background poll for a second so it doesn't stomp on the optimistic
    // state below with Spotify's not-yet-updated playback state.
    suppressPollUntilRef.current = Date.now() + 1000;
    try {
      if (state?.isPlaying) await withRetry((token) => pause(token));
      else await withRetry((token) => play(token));
      setState((prev) => (prev ? { ...prev, isPlaying: !prev.isPlaying } : prev));
      setError(null);
    } catch (err) {
      setError(err instanceof SpotifyPlaybackError ? 'No active Spotify device — open Spotify somewhere or play in this tab.' : 'Could not control playback.');
    } finally {
      setControlBusy(false);
    }
  };

  const handleSkip = async (dir: 'next' | 'prev') => {
    if (controlBusy) return;
    setControlBusy(true);
    suppressPollUntilRef.current = Date.now() + 1000;
    try {
      await withRetry((token) => (dir === 'next' ? skipNext(token) : skipPrevious(token)));
      setError(null);
    } catch {
      setError('Could not skip track.');
    } finally {
      setControlBusy(false);
    }
  };

  const openLibrary = () => {
    window.open('https://open.spotify.com/collection/tracks', '_blank', 'noopener');
  };

  if (!connected) {
    return (
      <Widget>
        <div className="widget-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4>Spotify</h4>
        </div>
        <div className="spotify-connect-prompt">
          <div className="spotify-brand-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 22, height: 22 }}>
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.6.6 0 0 1-.83.2c-2.3-1.4-5.2-1.7-8.6-.9a.6.6 0 1 1-.27-1.17c3.7-.85 6.9-.48 9.5 1.05.28.17.37.53.2.82Zm1.22-2.7a.75.75 0 0 1-1.03.26c-2.6-1.6-6.6-2.06-9.7-1.13a.75.75 0 1 1-.43-1.44c3.53-1.06 7.9-.55 10.9 1.28.36.22.48.68.26 1.03Zm.1-2.83c-3.1-1.85-8.3-2.02-11.3-1.11a.9.9 0 1 1-.52-1.72c3.4-1.03 9.13-.84 12.7 1.28a.9.9 0 1 1-.9 1.56Z" />
            </svg>
          </div>
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Connect Spotify to see and control what's playing while you focus.</p>
        </div>
        {connectError && <p style={{ fontSize: 12.5, color: 'var(--color-danger, #c0392b)', margin: 0 }}>{connectError}</p>}
        <button className="btn btn-secondary btn-block" type="button" onClick={connect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect Spotify'}
        </button>
      </Widget>
    );
  }

  const progressFrac = state?.durationMs ? Math.min(1, displayProgressMs / state.durationMs) : 0;

  return (
    <Widget>
      <div className="widget-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4>Spotify</h4>
        <span className="tag tag-outline">{displayName}</span>
      </div>

      {state ? (
        <>
          <div className="spotify-now-playing">
            {state.albumArt ? (
              <img src={state.albumArt} alt="" className="spotify-art" />
            ) : (
              <div className="spotify-art spotify-art-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
              </div>
            )}
            <div className="spotify-track-info">
              <div className="spotify-track-name">{state.trackName}</div>
              <div className="text-muted spotify-artist-name">{state.artistNames}</div>
              {state.deviceName && (
                <div className="text-muted spotify-device-name">
                  <span className={`spotify-device-dot${state.isPlaying ? ' live' : ''}`} />
                  {state.deviceName}
                </div>
              )}
            </div>
          </div>

          {state.durationMs > 0 && (
            <div className="spotify-progress">
              <div className="spotify-progress-track">
                <div className="spotify-progress-fill" style={{ width: `${progressFrac * 100}%` }} />
              </div>
              <div className="spotify-progress-times">
                <span>{formatMs(displayProgressMs)}</span>
                <span>{formatMs(state.durationMs)}</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Nothing playing right now.</p>
      )}

      <div className="spotify-controls">
        <button className="btn btn-secondary btn-icon spotify-skip-btn" type="button" onClick={() => handleSkip('prev')} disabled={controlBusy} aria-label="Previous track">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 20 9 12l10-8v16Z" /><path d="M5 19V5" /></svg>
        </button>
        <button className="spotify-play-btn" type="button" onClick={handleTogglePlay} disabled={controlBusy} aria-label={state?.isPlaying ? 'Pause' : 'Play'}>
          {state?.isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="m7 4 13 8-13 8z" /></svg>
          )}
        </button>
        <button className="btn btn-secondary btn-icon spotify-skip-btn" type="button" onClick={() => handleSkip('next')} disabled={controlBusy} aria-label="Next track">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4l10 8-10 8V4Z" /><path d="M19 5v14" /></svg>
        </button>
        <button className="btn btn-secondary btn-icon spotify-skip-btn" type="button" onClick={openLibrary} aria-label="Open your Spotify library">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
        </button>
      </div>

      {product === 'premium' && (
        <label className="spotify-in-tab-toggle">
          <span>Play in this tab</span>
          <span className="switch">
            <input type="checkbox" checked={Boolean(inTabPlayer)} onChange={toggleInTabPlayer} disabled={switchingDevice} />
            <span className="switch-track"><span className="switch-thumb" /></span>
          </span>
        </label>
      )}
      {switchingDevice && <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Starting in-tab player…</p>}
      {product && product !== 'premium' && (
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Playback control and in-tab playback need Spotify Premium — free accounts can still see what's playing.</p>
      )}

      {error && <p style={{ fontSize: 12.5, color: 'var(--color-danger, #c0392b)', margin: 0 }}>{error}</p>}

      <button className="btn btn-ghost" type="button" onClick={disconnect} style={{ fontSize: 12, alignSelf: 'flex-start' }}>
        Disconnect Spotify
      </button>
    </Widget>
  );
}
