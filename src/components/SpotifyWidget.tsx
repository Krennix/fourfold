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

export function SpotifyWidget() {
  const { connected, displayName, product, connecting, connectError, connect, disconnect, getAccessToken } = useSpotifyAuth();
  const [state, setState] = useState<PlaybackState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inTabPlayer, setInTabPlayer] = useState<BrowserPlayerHandle | null>(null);
  const [switchingDevice, setSwitchingDevice] = useState(false);
  const playerRef = useRef<BrowserPlayerHandle | null>(null);

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
    try {
      if (state?.isPlaying) await withRetry((token) => pause(token));
      else await withRetry((token) => play(token));
      setState((prev) => (prev ? { ...prev, isPlaying: !prev.isPlaying } : prev));
    } catch (err) {
      setError(err instanceof SpotifyPlaybackError ? 'No active Spotify device — open Spotify somewhere or play in this tab.' : 'Could not control playback.');
    }
  };

  const handleSkip = async (dir: 'next' | 'prev') => {
    try {
      await withRetry((token) => (dir === 'next' ? skipNext(token) : skipPrevious(token)));
    } catch {
      setError('Could not skip track.');
    }
  };

  if (!connected) {
    return (
      <Widget>
        <div className="widget-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4>Spotify</h4>
        </div>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Connect Spotify to see and control what's playing while you focus.</p>
        {connectError && <p style={{ fontSize: 12.5, color: 'var(--color-danger, #c0392b)', margin: 0 }}>{connectError}</p>}
        <button className="btn btn-secondary" type="button" onClick={connect} disabled={connecting}>
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 16, height: 16 }}>
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.6.6 0 0 1-.83.2c-2.3-1.4-5.2-1.7-8.6-.9a.6.6 0 1 1-.27-1.17c3.7-.85 6.9-.48 9.5 1.05.28.17.37.53.2.82Zm1.22-2.7a.75.75 0 0 1-1.03.26c-2.6-1.6-6.6-2.06-9.7-1.13a.75.75 0 1 1-.43-1.44c3.53-1.06 7.9-.55 10.9 1.28.36.22.48.68.26 1.03Zm.1-2.83c-3.1-1.85-8.3-2.02-11.3-1.11a.9.9 0 1 1-.52-1.72c3.4-1.03 9.13-.84 12.7 1.28a.9.9 0 1 1-.9 1.56Z" />
          </svg>
          {connecting ? 'Connecting…' : 'Connect Spotify'}
        </button>
      </Widget>
    );
  }

  return (
    <Widget>
      <div className="widget-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4>Spotify</h4>
        <span className="tag tag-outline">{displayName}</span>
      </div>

      {state ? (
        <div className="spotify-now-playing">
          {state.albumArt && <img src={state.albumArt} alt="" className="spotify-art" />}
          <div className="spotify-track-info">
            <div className="spotify-track-name">{state.trackName}</div>
            <div className="text-muted spotify-artist-name">{state.artistNames}</div>
            {state.deviceName && <div className="text-muted spotify-device-name">Playing on {state.deviceName}</div>}
          </div>
        </div>
      ) : (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Nothing playing right now.</p>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
        <button className="btn btn-secondary" type="button" onClick={() => handleSkip('prev')} aria-label="Previous track">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 20 9 12l10-8v16Z" /><path d="M5 19V5" /></svg>
        </button>
        <button className="btn btn-primary" type="button" onClick={handleTogglePlay} style={{ minWidth: 96 }}>
          {state?.isPlaying ? (
            <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>Pause</>
          ) : (
            <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7 4 13 8-13 8z" /></svg>Play</>
          )}
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => handleSkip('next')} aria-label="Next track">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4l10 8-10 8V4Z" /><path d="M19 5v14" /></svg>
        </button>
      </div>

      {product === 'premium' && (
        <label className="spotify-in-tab-toggle">
          <input type="checkbox" checked={Boolean(inTabPlayer)} onChange={toggleInTabPlayer} disabled={switchingDevice} />
          {switchingDevice ? 'Starting in-tab player…' : 'Play in this tab'}
        </label>
      )}
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
