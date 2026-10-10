/**
 * Google Cast Sender SDK integration for the soundboard.
 *
 * Watches the active music playlist in the soundboard store and mirrors it to a
 * connected Google Home / Chromecast Audio device using the Default Media Receiver
 * (no custom receiver app required). Only one audio stream is cast at a time —
 * music playlists are fully supported; ambient layering is browser-only.
 *
 * All state is module-level (singleton) so every useCast() caller shares the
 * same reactive refs.
 *
 * Cast is only available in Chrome/Edge on desktop and Android. Other browsers
 * silently receive isCastAvailable = false and all methods are no-ops.
 *
 * The SDK is loaded from Google only when someone asks to cast. It used to load
 * whenever the soundboard opened, which handed every DM's IP address to Google
 * although hardly anyone casts, which is the same GDPR exposure the self-hosted
 * fonts (src/assets/fonts.ts) removed. So the button is drawn from a browser
 * check alone, and the first click fetches the SDK and then opens the picker.
 * A browser that has actually cast before (a session started) remembers it
 * (CAST_USED_KEY) and preloads on first use, which keeps auto-rejoining a running session working for the
 * people who actually use it.
 */

import { safeLocalStorage } from "@/lib/safeLocalStorage";
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
  __onGCastApiAvailable?: (available: boolean) => void;
}

// ── Singleton module-level state ──────────────────────────────────────────────

type SdkState = "idle" | "loading" | "ready" | "unavailable";

const sdkState = ref<SdkState>("idle");
const castDeviceName = ref<string | null>(null);

/** Drawn before the SDK exists, so it cannot ask the SDK; hidden if the SDK later says no. */
const isCastAvailable = computed(() => browserSupportsCast() && sdkState.value !== "unavailable");
const isCastLoading = computed(() => sdkState.value === "loading");
/** The picker failed to open right after a first-time load: say to click again. */
const needsSecondClick = ref(false);

const SDK_URL = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
/** Set when a session has started in this browser, so preloading follows a real, completed choice. */
const CAST_USED_KEY = "grimoire:cast-used";

// Non-reactive SDK object references (same pattern as audioInstances in soundboard.ts)
let remotePlayer: RemotePlayerAPI | null = null;
let playerController: RemotePlayerControllerAPI | null = null;
let initialized = false;
let sdkLoad: Promise<boolean> | null = null;

// ── SDK access helpers ────────────────────────────────────────────────────────

/**
 * Chromium on desktop and Android. The SDK itself is the authority, but asking
 * it means loading it; `window.chrome` is present in Chrome and Edge and absent
 * in Firefox and Safari, and iOS browsers cannot cast at all.
 */
function browserSupportsCast(): boolean {
  if (typeof window === "undefined") return false;
  return "chrome" in window && !/iPhone|iPad|iPod/.test(navigator.userAgent);
}

function hasCastBefore(): boolean {
  try {
    return safeLocalStorage().getItem(CAST_USED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberCastUse(): void {
  try {
    safeLocalStorage().setItem(CAST_USED_KEY, "1");
  } catch {
    // Private mode or blocked storage: this viewer just loads on click next time.
  }
}

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
    if (browserSupportsCast() && hasCastBefore()) void loadSdk();
  }

  const store = useSoundboardStore();

  return {
    isCastAvailable,
    isCastLoading,
    needsSecondClick,
    isCasting: computed(() => store.isCasting),
    castDeviceName,
    openDevicePicker,
  };
}

async function openDevicePicker(): Promise<void> {
  const store = useSoundboardStore();
  if (store.isCasting) {
    castCtx()?.endCurrentSession(true);
    return;
  }
  needsSecondClick.value = false;
  const firstLoad = sdkState.value !== "ready";
  if (!(await loadSdk())) return;
  castCtx()?.requestSession().catch(() => {
    // Usually the user cancelled or no devices are on the network — ignore.
    // But on a first load the picker opens after a network fetch, and Chrome
    // may judge the click too long ago to open it. We cannot tell that apart
    // from a cancel by error code, so after a first load always offer a retry;
    // the SDK is loaded now and the next click opens the picker at once.
    if (firstLoad) needsSecondClick.value = true;
  });
}

// Convenience alias — called from module-scope event handlers that run after
// Pinia is installed, so the store is always accessible.
function useCastStore() {
  return useSoundboardStore();
}

// ── SDK loading (once, on the first request to cast) ──────────────────────────

/**
 * Resolves true once the framework is usable, false if this browser cannot cast.
 * Never at app startup either: the SDK's continuous mDNS device discovery once
 * starved audio streaming bandwidth there, crackling every ~1.3 seconds.
 */
function loadSdk(): Promise<boolean> {
  if (sdkLoad) return sdkLoad;
  sdkState.value = "loading";
  sdkLoad = new Promise<boolean>((resolve) => {
    // Register the callback BEFORE injecting the script — the Cast SDK invokes
    // __onGCastApiAvailable synchronously as the script executes, so the
    // assignment must already be in place.
    (window as CastWindow).__onGCastApiAvailable = (available: boolean) => {
      const ready = available && onSdkReady();
      sdkState.value = ready ? "ready" : "unavailable";
      resolve(ready);
    };
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.onerror = () => {
      // Blocked or offline: allow a later click to try again.
      sdkState.value = "idle";
      sdkLoad = null;
      s.remove();
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return sdkLoad;
}

function onSdkReady(): boolean {
  const fw = castFramework();
  if (!fw) return false;

  const ctx = fw.CastContext.getInstance();
  const cc  = chromeCast();

  ctx.setOptions({
    receiverApplicationId: cc?.media.DEFAULT_MEDIA_RECEIVER_APP_ID ?? "CC1AD845",
    autoJoinPolicy:        cc?.AutoJoinPolicy.ORIGIN_SCOPED ?? "origin_scoped",
  });

  remotePlayer     = new fw.RemotePlayer();
  playerController = new fw.RemotePlayerController(remotePlayer);

  // Available as soon as the SDK is loaded — device discovery is async and
  // getCastState() often returns NO_DEVICES_AVAILABLE on the first call even
  // when speakers are on the network. The picker handles the no-device case.

  ctx.addEventListener(fw.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
    onSessionStateChanged(e as SessionStateEvent);
  });

  playerController.addEventListener(fw.RemotePlayerEventType.PLAYER_STATE_CHANGED, (e) => {
    onPlayerStateChanged(e);
  });

  setupStoreWatchers();
  return true;
}

function onSessionStateChanged(e: SessionStateEvent): void {
  const store = useCastStore();
  const fw    = castFramework();
  if (!fw) return;

  switch (e.sessionState) {
    case fw.SessionState.SESSION_STARTED:
    case fw.SessionState.SESSION_RESUMED: {
      // Remembered only once a speaker is actually connected: a click that
      // was cancelled, failed or found no device must not turn a later visit
      // into an automatic request to Google.
      rememberCastUse();
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
          store.play(soundId, mpl.fileUrls[soundId], "music", mpl.gainTrims[soundId]);
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
