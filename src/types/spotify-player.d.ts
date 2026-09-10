export {};

declare global {
  namespace Spotify {
    interface Track {
      name: string;
      uri: string;
      artists: { name: string }[];
      album: { name: string; images: { url: string }[] };
    }

    interface PlaybackState {
      paused: boolean;
      position: number;
      duration: number;
      track_window: { current_track: Track };
    }

    interface PlayerInit {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    }

    interface Player {
      connect: () => Promise<boolean>;
      disconnect: () => void;
      addListener(event: 'ready' | 'not_ready', cb: (data: { device_id: string }) => void): void;
      addListener(event: 'player_state_changed', cb: (state: PlaybackState | null) => void): void;
      addListener(event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error', cb: (data: { message: string }) => void): void;
      togglePlay: () => Promise<void>;
      setVolume: (volume: number) => Promise<void>;
    }

    const Player: {
      new (init: PlayerInit): Player;
    };
  }

  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify: {
      Player: typeof Spotify.Player;
    };
  }
}
