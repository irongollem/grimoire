/**
 * Google Cast Sender SDK integration for the soundboard.
 *
 * Watches the active music playlist in the soundboard store and mirrors it to a
 * connected Google Home / Chromecast Audio device using the Default Media Receiver
 * (no custom receiver app required). Only one audio stream is cast at a time —
 * music playlists are fully supported; ambient layering is browser-only.
 *
 * Call once from App.vue. All state is module-level (singleton) so subsequent
 * calls to useCast() return the same reactive refs.
 *
 * Cast is only available in Chrome/Edge on desktop and Android. Other browsers
 * silently receive isCastAvailable = false and all methods are no-ops.
 */

import { ref, computed, watch } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";

// ── Minimal Cast SDK type declarations ────────────────────────────────────────
//
// The Cast Sender SDK has no npm type package. We declare only the subset we use.
// SDK globals are accessed via window.cast and window.chrome.cast at runtime.

interface CastContextAPI {
  setOptions(opts: { receiverApplicationId: string; autoJoinPolicy: string }): void;
  requestSession(): Promise<string | null>;
  endCurrentSession(stopCasting: boolean): void;
  getCurrentSession(): CastSessionAPI | null;
  getCastState(): string;
  addEventListener(type: string, handler: (e: CastStateEvent | SessionStateEvent) => void): void;
}

interface CastSessionAPI {
  getSessionObj(): { receiver?: { friendlyName?: string } } | null;
  getMediaSession(): { idleReason: string | null } | null;
  loadMedia(request: CastLoadRequest): Promise<string | null>;
}

interface CastStateEvent {
  castState: string;
}

interface SessionStateEvent {
  sessionState: string;
  session?: CastSessionAPI;
}

interface PlayerStateEvent {
  value: string;
}

interface RemotePlayerAPI {
  isPaused: boolean;
  playerState: string;
}

interface RemotePlayerControllerAPI {
  addEventListener(type: string, handler: (e: PlayerStateEvent) => void): void;
  playOrPause(): void;
  stop(): void;
}

// Cast SDK constructor functions (used with `new`)
interface CastMediaInfo { metadata: CastMusicMetadata | null; streamType: string }
interface CastMusicMetadata { title: string; artistName: string; albumName: string; images: CastImage[] }
interface CastImage { url: string }
interface CastLoadRequest { autoplay: boolean; currentTime: number }

interface ChromeCastMedia {
  MediaInfo: new (url: string, contentType: string) => CastMediaInfo;
  MusicTrackMediaMetadata: new () => CastMusicMetadata;
  LoadRequest: new (info: CastMediaInfo) => CastLoadRequest;
  StreamType: { BUFFERED: string };
  DEFAULT_MEDIA_RECEIVER_APP_ID: string;
}

interface ChromeCastAPI {
  media: ChromeCastMedia;
  Image: new (url: string) => CastImage;
  AutoJoinPolicy: { ORIGIN_SCOPED: string };
}

interface CastFramework {
  CastContext: { getInstance(): CastContextAPI };
  RemotePlayer: new () => RemotePlayerAPI;
  RemotePlayerController: new (player: RemotePlayerAPI) => RemotePlayerControllerAPI;
  CastContextEventType: { SESSION_STATE_CHANGED: string; CAST_STATE_CHANGED: string };
  RemotePlayerEventType: { PLAYER_STATE_CHANGED: string };
  CastState: { NO_DEVICES_AVAILABLE: string };
  SessionState: {
    SESSION_STARTED: string;
    SESSION_RESUMED: string;
    SESSION_ENDED: string;
    SESSION_START_FAILED: string;
  };
}

interface CastWindow {
  cast?: { framework?: CastFramework };
  chrome?: { cast?: ChromeCastAPI };
  __castApiAvailable?: boolean;
}

// ── Singleton module-level state ──────────────────────────────────────────────

const isCastAvailable = ref(false);
const castDeviceName = ref<string | null>(null);

// Non-reactive SDK object references (same pattern as audioInstances in soundboard.ts)
let remotePlayer: RemotePlayerAPI | null = null;
let playerController: RemotePlayerControllerAPI | null = null;
let initialized = false;

// ── SDK access helpers ────────────────────────────────────────────────────────

function castFramework(): CastFramework | undefined {
  return (window as CastWindow).cast?.framework;
}

function castCtx(): CastContextAPI | null {
  return castFramework()?.CastContext.getInstance() ?? null;
}

function chromeCast(): ChromeCastAPI | undefined {
  return (window as CastWindow).chrome?.cast;
}

function mimeFromUrl(url: string): string {
  try {
    const ext = new URL(url).pathname.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      mp3:  "audio/mpeg",
      ogg:  "audio/ogg",
      opus: "audio/ogg; codecs=opus",
      webm: "audio/webm",
      wav:  "audio/wav",
      flac: "audio/flac",
      m4a:  "audio/mp4",
      aac:  "audio/mp4",
    };
    return map[ext ?? ""] ?? "audio/mpeg";
  } catch {
    return "audio/mpeg";
  }
}

// ── Media loading ─────────────────────────────────────────────────────────────

function loadMedia(
  url: string,
  meta: { title: string; artist: string; album: string; thumbnail: string | null },
): void {
  const session = castCtx()?.getCurrentSession();
  if (!session) return;

  const cc = chromeCast();
  if (!cc) return;

  const mediaInfo = new cc.media.MediaInfo(url, mimeFromUrl(url));
  mediaInfo.streamType = cc.media.StreamType.BUFFERED;

  const metadata = new cc.media.MusicTrackMediaMetadata();
  metadata.title = meta.title;
  metadata.artistName = meta.artist;
  metadata.albumName = meta.album;
  if (meta.thumbnail) {
    metadata.images = [new cc.Image(meta.thumbnail)];
  }
  mediaInfo.metadata = metadata;

  const request = new cc.media.LoadRequest(mediaInfo);
  request.autoplay = true;
  request.currentTime = 0;

  session.loadMedia(request).catch((err: unknown) => {
    console.warn("[Cast] loadMedia failed:", err);
  });
}

// ── Public interface ──────────────────────────────────────────────────────────

export function useCast() {
  if (!import.meta.env.SSR && !initialized) {
    initialized = true;
    _init();
  }

  const store = useSoundboardStore();

  return {
    isCastAvailable,
    isCasting: computed(() => store.isCasting),
    castDeviceName,
    openDevicePicker,
  };
}

function openDevicePicker(): void {
  const store = useSoundboardStore();
  if (store.isCasting) {
    castCtx()?.endCurrentSession(true);
  } else {
    castCtx()?.requestSession().catch(() => {
      // User cancelled the device picker or no devices available — ignore
    });
  }
}

// Convenience alias — called from module-scope event handlers that run after
// Pinia is installed, so the store is always accessible.
function useCastStore() {
  return useSoundboardStore();
}

// ── Initialization (runs once after Cast SDK fires __onGCastApiAvailable) ─────

function _init(): void {
  window.addEventListener("cast-api-available", onSdkReady, { once: true });
  if ((window as CastWindow).__castApiAvailable) onSdkReady();
}

function onSdkReady(): void {
  const fw = castFramework();
  if (!fw) return;

  const ctx = fw.CastContext.getInstance();
  const cc  = chromeCast();

  ctx.setOptions({
    receiverApplicationId: cc?.media.DEFAULT_MEDIA_RECEIVER_APP_ID ?? "CC1AD845",
    autoJoinPolicy:        cc?.AutoJoinPolicy.ORIGIN_SCOPED ?? "origin_scoped",
  });

  remotePlayer     = new fw.RemotePlayer();
  playerController = new fw.RemotePlayerController(remotePlayer);

  const initialState = ctx.getCastState();
  isCastAvailable.value = initialState !== fw.CastState.NO_DEVICES_AVAILABLE;

  ctx.addEventListener(fw.CastContextEventType.CAST_STATE_CHANGED, (e) => {
    isCastAvailable.value = (e as CastStateEvent).castState !== fw.CastState.NO_DEVICES_AVAILABLE;
  });

  ctx.addEventListener(fw.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
    onSessionStateChanged(e as SessionStateEvent);
  });

  playerController.addEventListener(fw.RemotePlayerEventType.PLAYER_STATE_CHANGED, (e) => {
    onPlayerStateChanged(e);
  });

  setupStoreWatchers();
}

function onSessionStateChanged(e: SessionStateEvent): void {
  const store = useCastStore();
  const fw    = castFramework();
  if (!fw) return;

  switch (e.sessionState) {
    case fw.SessionState.SESSION_STARTED:
    case fw.SessionState.SESSION_RESUMED: {
      store.isCasting = true;
      castDeviceName.value =
        e.session?.getSessionObj()?.receiver?.friendlyName ?? null;

      const mpl = store.activeMusicPlaylist;
      if (mpl) {
        const soundId = mpl.trackSoundIds[mpl.currentIndex];
        store.pauseForCast(soundId);
        loadMedia(mpl.fileUrls[soundId], {
          title:     mpl.soundNames[soundId]    ?? "Unknown Track",
          artist:    mpl.artists[soundId]       ?? "Dungeon Grimoire",
          album:     mpl.playlistName,
          thumbnail: mpl.thumbnailUrls[soundId] ?? null,
        });
      }
      break;
    }

    case fw.SessionState.SESSION_ENDED:
    case fw.SessionState.SESSION_START_FAILED: {
      const wasCasting = store.isCasting;
      store.isCasting      = false;
      castDeviceName.value = null;

      if (wasCasting) {
        const mpl = store.activeMusicPlaylist;
        if (mpl && !mpl.paused) {
          const soundId = mpl.trackSoundIds[mpl.currentIndex];
          store.play(soundId, mpl.fileUrls[soundId]);
        }
      }
      break;
    }
  }
}

function onPlayerStateChanged(e: PlayerStateEvent): void {
  if (e.value !== "IDLE") return;

  const store = useCastStore();
  if (!store.isCasting) return;

  const idleReason = castCtx()?.getCurrentSession()?.getMediaSession()?.idleReason;
  if (idleReason === "FINISHED") {
    store.musicPlaylistNext();
  }
}

// ── Reactive store → Cast sync ────────────────────────────────────────────────

function setupStoreWatchers(): void {
  const store = useCastStore();

  // New track started (playlist changed or index advanced)
  watch(
    () => [store.activeMusicPlaylist?.playlistId, store.activeMusicPlaylist?.currentIndex] as const,
    ([playlistId, index], prev) => {
      if (!store.isCasting) return;
      const mpl = store.activeMusicPlaylist;
      if (!mpl) return;
      if (prev?.[0] === playlistId && prev?.[1] === index) return;

      const soundId = mpl.trackSoundIds[mpl.currentIndex];
      loadMedia(mpl.fileUrls[soundId], {
        title:     mpl.soundNames[soundId]    ?? "Unknown Track",
        artist:    mpl.artists[soundId]       ?? "Dungeon Grimoire",
        album:     mpl.playlistName,
        thumbnail: mpl.thumbnailUrls[soundId] ?? null,
      });
    },
  );

  // Playlist stopped entirely — stop Cast media but keep the session alive
  watch(
    () => store.activeMusicPlaylist,
    (mpl) => {
      if (!store.isCasting || mpl !== null) return;
      playerController?.stop();
    },
  );

  // Pause / resume sync
  watch(
    () => store.activeMusicPlaylist?.paused,
    (paused) => {
      if (!store.isCasting || paused === undefined || !remotePlayer) return;
      if (paused && !remotePlayer.isPaused) playerController?.playOrPause();
      if (!paused &&  remotePlayer.isPaused) playerController?.playOrPause();
    },
  );
}
