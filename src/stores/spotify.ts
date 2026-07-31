// Spotify Web Playback SDK store.
//
// The SDK registers "Grimoire Soundboard" as a Spotify Connect device in the
// user's browser. Playback is fully programmatic — play/pause/seek/volume all
// go through the SDK rather than an iframe. Requires a Spotify Premium account.
//
// Module-level vars hold the non-reactive SDK objects (same pattern as
// soundboard.ts for HTMLAudioElement).

import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import {
  readSpotifyError,
  getValidToken,
  buildAuthUrl,
  clearTokens,
  getStoredTokens,
  urlToUri,
  isContextUri,
} from "@/lib/audio/spotifyAuth";

// ── SDK type declarations (no npm package) ────────────────────────────────

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: SpotifySDK;
  }
}

interface SpotifySDK {
  Player: new (options: SpotifyPlayerInit) => SpotifyPlayer;
}

interface SpotifyPlayerInit {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: "ready", cb: (data: { device_id: string }) => void): void;
  addListener(event: "not_ready", cb: (data: { device_id: string }) => void): void;
  addListener(event: "player_state_changed", cb: (state: SpotifyState | null) => void): void;
  addListener(event: "authentication_error", cb: (data: { message: string }) => void): void;
  addListener(event: string, cb: (data: unknown) => void): void;
  getCurrentState(): Promise<SpotifyState | null>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(position_ms: number): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
}

interface SpotifyState {
  paused: boolean;
  position: number;
  duration: number;
  repeat_mode: 0 | 1 | 2; // 0=off, 1=context, 2=track
  shuffle: boolean;
  track_window: {
    current_track: SpotifyTrack;
  };
}

interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string; width: number; height: number }>;
  };
}

// ── Module-level (never reactive) ─────────────────────────────────────────
let sdkPlayer: SpotifyPlayer | null = null;
let positionTick: ReturnType<typeof setInterval> | null = null;

// ─────────────────────────────────────────────────────────────────────────

export const useSpotifyStore = defineStore("spotify", () => {
  // Client ID comes from the campaign's spotify_client_id (BYOK).
  // Stored in the campaign settings by the DM.
  const clientId = computed(() => useCampaignStore().activeCampaign?.spotify_client_id ?? "");

  // Visible only to DMs who have configured a Client ID for this campaign.
  const isEnabled = computed(() => {
    if (!clientId.value) return false;
    const auth = useAuthStore();
    return auth.isDM;
  });

  // Token is stored in localStorage — persists across page reloads
  const isConnected = ref(!!getStoredTokens());

  // SDK player is initialised and device ID is registered with Spotify
  const isReady = ref(false);
  const deviceId = ref<string | null>(null);

  // Current playback
  const isPlaying = ref(false);
  const positionMs = ref(0);
  const durationMs = ref(0);
  const currentUri = ref<string | null>(null); // spotify:track:xxx of the currently playing track
  const lastPlayedUrl = ref<string | null>(null); // the file_url of the last Sound card activated
  const trackName = ref("");
  const artistName = ref("");
  const albumArtUrl = ref("");
  const volume = ref(0.8);
  const repeatMode = ref<0 | 1 | 2>(0); // 0=off, 1=context, 2=track
  const shuffleOn = ref(false);
  /** Last playback error message from Spotify, or null if the last play succeeded. */
  const playError = ref<string | null>(null);
  /** The Spotify account currently linked (fetched via /v1/me after SDK is ready). */
  const spotifyUser = ref<{ display_name: string; email: string; product: string } | null>(null);

  // ── Auth ───────────────────────────────────────────────────────────────

  async function connect() {
    if (!clientId.value) return;
    const url = await buildAuthUrl(clientId.value);
    window.location.href = url;
  }

  function disconnect() {
    clearTokens();
    isConnected.value = false;
    isReady.value = false;
    deviceId.value = null;
    isPlaying.value = false;
    currentUri.value = null;
    lastPlayedUrl.value = null;
    spotifyUser.value = null;
    _stopTick();
    sdkPlayer?.disconnect();
    sdkPlayer = null;
  }

  async function fetchAccount() {
    const token = await getValidToken(clientId.value);
    if (!token) return;
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // A 403 here means the login succeeded but the account cannot use the
      // app — almost always Development mode without the user allowlisted.
      // Silently returning left the UI looking connected but inert.
      playError.value = await readSpotifyError(res);
      return;
    }
    const data = await res.json() as { display_name: string; email: string; product: string };
    spotifyUser.value = { display_name: data.display_name, email: data.email, product: data.product };
  }

  // ── SDK lifecycle ──────────────────────────────────────────────────────

  /** Call this once when the soundboard mounts and a token exists. */
  function initSDK() {
    // Without a client ID the SDK's getOAuthToken callback can't validate
    // tokens — wait for the campaign store to hydrate (see watcher below).
    if (sdkPlayer || !isConnected.value || !clientId.value) return;

    window.onSpotifyWebPlaybackSDKReady = _createPlayer;

    if (!document.getElementById("spotify-sdk-script")) {
      const script = document.createElement("script");
      script.id = "spotify-sdk-script";
      script.src = "https://sdk.scdn.co/spotify-player.js";
      document.head.appendChild(script);
    } else {
      // Script already loaded (hot reload / already initialised)
      _createPlayer();
    }
  }

  function _createPlayer() {
    sdkPlayer = new window.Spotify.Player({
      name: "Grimoire Soundboard",
      getOAuthToken: async (cb) => {
        const token = await getValidToken(clientId.value);
        if (token) {
          cb(token);
        } else {
          // Token gone — force re-auth
          disconnect();
        }
      },
      volume: volume.value,
    });

    sdkPlayer.addListener("ready", ({ device_id }) => {
      deviceId.value = device_id;
      isReady.value = true;
      void fetchAccount();
    });

    sdkPlayer.addListener("not_ready", () => {
      isReady.value = false;
    });

    sdkPlayer.addListener("player_state_changed", (state) => {
      _applyState(state);
    });

    sdkPlayer.addListener("authentication_error", async () => {
      isReady.value = false;
      // Force-refresh once before nuking the session — Spotify can emit this
      // for transient reasons while the refresh token is still good.
      const refreshed = await getValidToken(clientId.value, true);
      if (refreshed && sdkPlayer) {
        sdkPlayer.connect();
      } else {
        disconnect();
      }
    });

    sdkPlayer.connect();
  }

  // On a fresh page refresh the soundboard mounts before the campaign store
  // hydrates, so clientId starts empty. Re-attempt SDK init the moment the
  // client ID becomes available.
  watch(clientId, (id) => {
    if (id && isConnected.value && !sdkPlayer) initSDK();
  });

  function _applyState(state: SpotifyState | null) {
    if (!state) {
      isPlaying.value = false;
      _stopTick();
      return;
    }

    isPlaying.value = !state.paused;
    positionMs.value = state.position;
    durationMs.value = state.duration;

    const track = state.track_window.current_track;
    currentUri.value = track.uri;
    trackName.value = track.name;
    artistName.value = track.artists.map((a) => a.name).join(", ");
    albumArtUrl.value = track.album.images[0]?.url ?? "";
    repeatMode.value = state.repeat_mode;
    shuffleOn.value = state.shuffle;

    if (!state.paused) {
      _startTick();
    } else {
      _stopTick();
    }
  }

  // Increment positionMs every 500 ms while playing so the progress bar
  // moves smoothly without hammering the SDK with getCurrentState() calls.
  function _startTick() {
    if (positionTick) return;
    positionTick = setInterval(() => {
      positionMs.value = Math.min(positionMs.value + 500, durationMs.value);
    }, 500);
  }

  function _stopTick() {
    if (positionTick) {
      clearInterval(positionTick);
      positionTick = null;
    }
  }

  // ── Playback controls ──────────────────────────────────────────────────

  /** Play a sound card's file_url (open.spotify.com URL or spotify: URI). */
  async function play(fileUrl: string) {
    if (!deviceId.value) return;

    const uri = urlToUri(fileUrl) ?? fileUrl;
    const token = await getValidToken(clientId.value);
    if (!token) return;

    const body = isContextUri(uri)
      ? { context_uri: uri }
      : { uris: [uri] };

    const res = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId.value}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      let msg = `Spotify error ${res.status}`;
      try {
        const body = await res.json() as { error?: { message?: string } };
        if (body.error?.message) msg = body.error.message;
      } catch { /* ignore parse errors */ }
      // Common: 403 "Player command failed: Not allowed" → desktop app is holding playback.
      // Common: 403 "Player command failed: Premium required" → free account.
      playError.value = msg;
      return;
    }

    playError.value = null;
    lastPlayedUrl.value = fileUrl;
  }

  async function pause() {
    await sdkPlayer?.pause();
    isPlaying.value = false;
    _stopTick();
  }

  async function resume() {
    await sdkPlayer?.resume();
    isPlaying.value = true;
    _startTick();
  }

  async function seek(ms: number) {
    await sdkPlayer?.seek(ms);
    positionMs.value = ms;
  }

  async function setVolume(v: number) {
    volume.value = v;
    await sdkPlayer?.setVolume(v);
  }

  async function nextTrack() {
    await sdkPlayer?.nextTrack();
  }

  async function previousTrack() {
    await sdkPlayer?.previousTrack();
  }

  async function setShuffle(on: boolean) {
    if (!deviceId.value) return;
    const token = await getValidToken(clientId.value);
    if (!token) return;
    await fetch(
      `https://api.spotify.com/v1/me/player/shuffle?state=${on}&device_id=${deviceId.value}`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}` } },
    );
    shuffleOn.value = on;
  }

  async function setRepeat(mode: 0 | 1 | 2) {
    if (!deviceId.value) return;
    const token = await getValidToken(clientId.value);
    if (!token) return;
    const stateStr = mode === 2 ? "track" : mode === 1 ? "context" : "off";
    await fetch(
      `https://api.spotify.com/v1/me/player/repeat?state=${stateStr}&device_id=${deviceId.value}`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}` } },
    );
    repeatMode.value = mode;
  }

  return {
    clientId,
    isEnabled,
    isConnected,
    isReady,
    deviceId,
    isPlaying,
    positionMs,
    durationMs,
    currentUri,
    lastPlayedUrl,
    trackName,
    artistName,
    albumArtUrl,
    volume,
    playError,
    spotifyUser,
    connect,
    disconnect,
    initSDK,
    play,
    pause,
    resume,
    seek,
    setVolume,
    nextTrack,
    previousTrack,
    repeatMode,
    setRepeat,
    shuffleOn,
    setShuffle,
  };
});
