import { watch } from "vue";
import type { AudioBus } from "@/lib/audio/audioEngine";
import { useSoundboardStore } from "@/stores/soundboard";

/** What the phone is told while the board plays without a music playlist. */
export interface BoardSession {
  title: string;
  state: "playing" | "paused";
}

/**
 * What the phone's Now Playing should say when no music playlist runs: the
 * deck's pads and scenes. Null when nothing plays and nothing is paused.
 *
 * Since the deck (#1136) music is a pad, not a playlist, and until 7 Nov 2026
 * the session said "none" while it played. CarPlay showed the logo with a play
 * button, and audio that no media session claims is treated as a passing
 * system sound: the car switched channels for it every time, heard as a
 * reconnect every couple of seconds, and it kept fighting the next app.
 *
 * Music names it before a scene, a scene before any other sound.
 */
export function describeBoard(input: {
  loose: { bus: AudioBus; title: string | undefined }[];
  scenes: string[];
  pausedAll: boolean;
}): BoardSession | null {
  const music = input.loose.find((s) => s.bus === "music" && s.title !== undefined);
  const other = input.loose.find((s) => s.title !== undefined);
  const title = music?.title ?? input.scenes[0] ?? other?.title ?? "Dungeon Grimoire";
  if (input.loose.length > 0 || input.scenes.length > 0) return { title, state: "playing" };
  if (input.pausedAll) return { title: "Dungeon Grimoire", state: "paused" };
  return null;
}

export interface PublishedPosition {
  position: number;
  duration: number;
  /** performance.now() when it was published. */
  at: number;
}

/** How far playback may stray from where the OS thinks it is before it is told again. */
const POSITION_DRIFT_S = 1;

/**
 * Whether the media session needs a new position: nothing published while
 * playing, a different track length, or a position that is not where steady
 * playback from the last publish would have put it (a seek, a stall, a resume).
 */
export function positionNeedsPublish(
  last: PublishedPosition | null,
  next: { position: number; duration: number },
  nowMs: number,
): boolean {
  if (last === null) return true;
  if (last.duration !== next.duration) return true;
  const expected = last.position + (nowMs - last.at) / 1000;
  return Math.abs(next.position - expected) > POSITION_DRIFT_S;
}

/**
 * Wires the active music playlist to the browser's Media Session API so that
 * OS-level media controls (CarPlay, Android Auto, lock screen, Bluetooth
 * buttons) can see what's playing and drive next/previous/pause.
 *
 * Call once from App.vue. Safe on browsers that don't support the API — the
 * guard at the top of the function exits early.
 *
 * Without a music playlist the deck's pads and scenes are published instead
 * (describeBoard): their name, playing or paused, and pause / play / stop
 * mapped to Pause all, Resume and Stop all. There is no next or previous.
 */
export function useMediaSession() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

  const store = useSoundboardStore();

  // When the PWA returns to the foreground (screen unlocked, CarPlay interaction,
  // alt-tab back), iOS may have suspended the AudioContext or paused audio
  // elements. Resume everything so playback continues without manual intervention.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") store.resumeAudioEngine();
  });

  /** The last position handed to the OS; null means the next one must be published. */
  let published: PublishedPosition | null = null;

  // ── Metadata + handlers — refreshed whenever the active track changes ──

  watch(
    [
      () => store.activeMusicPlaylist?.playlistId,
      () => store.activeMusicPlaylist?.currentIndex,
    ],
    () => {
      // A new track always republishes its position, however close it is to the old one.
      published = null;
      syncSession();
    },
    { immediate: true },
  );

  // ── The board, when no music playlist runs ─────────────────────────────
  //
  // Keyed on what is said, not on every playback change, so the phone is told
  // again only when the name or the state moves.

  watch(
    () => {
      if (store.activeMusicPlaylist) return null;
      const board = describeBoard({
        loose: store.loosePlaying,
        scenes: store.activeAmbientPlaylists.filter((s) => !s.paused).map((s) => s.playlistName),
        pausedAll: store.isPausedAll,
      });
      return board === null ? null : `${board.state}\n${board.title}`;
    },
    (key) => {
      if (store.activeMusicPlaylist) return;
      syncBoard(key);
    },
  );

  // ── Playback state — kept in sync as isPlaying flips ─────────────────

  watch(
    () => {
      const pl = store.activeMusicPlaylist;
      if (!pl) return false;
      return store.getState(pl.trackSoundIds[pl.currentIndex]).isPlaying;
    },
    (isPlaying) => {
      if (!store.activeMusicPlaylist) return;
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    },
  );

  // ── Position state — lets CarPlay show a scrubber ─────────────────────
  //
  // Published only when it changes meaning (a new track, play, a seek), never
  // per timeupdate: the OS extrapolates the position from the last one at the
  // given rate. Each publish is a Now Playing update sent over the CarPlay
  // link, and four a second of them is traffic the link does not need.

  watch(
    () => {
      const pl = store.activeMusicPlaylist;
      if (!pl) return null;
      const s = store.getState(pl.trackSoundIds[pl.currentIndex]);
      return s.isPlaying && s.duration > 0
        ? { position: s.currentTime, duration: s.duration }
        : null;
    },
    (pos) => {
      if (!pos) {
        published = null;
        return;
      }
      const now = performance.now();
      if (!positionNeedsPublish(published, pos, now)) return;
      published = { ...pos, at: now };
      try {
        navigator.mediaSession.setPositionState({
          duration: pos.duration,
          playbackRate: 1,
          position: Math.min(pos.position, pos.duration),
        });
      } catch {
        // setPositionState throws if duration is not finite — silently ignore
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────

  function syncSession() {
    const pl = store.activeMusicPlaylist;

    if (!pl) {
      const board = describeBoard({
        loose: store.loosePlaying,
        scenes: store.activeAmbientPlaylists.filter((s) => !s.paused).map((s) => s.playlistName),
        pausedAll: store.isPausedAll,
      });
      syncBoard(board === null ? null : `${board.state}\n${board.title}`);
      return;
    }

    const soundId = pl.trackSoundIds[pl.currentIndex];
    const title = pl.soundNames[soundId] ?? "Unknown Track";
    const artist = pl.artists[soundId] ?? "Dungeon Grimoire";
    const thumbnailUrl = pl.thumbnailUrls[soundId] ?? null;

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      album: pl.playlistName,
      artist,
      artwork: thumbnailUrl
        ? [{ src: thumbnailUrl, type: "image/webp" }]
        : [{ src: "/icon-512.png", type: "image/png", sizes: "512x512" }],
    });

    navigator.mediaSession.setActionHandler("play", () => {
      const p = store.activeMusicPlaylist;
      if (!p) return;
      const id = p.trackSoundIds[p.currentIndex];
      store.play(id, p.fileUrls[id]);
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      const p = store.activeMusicPlaylist;
      if (!p) return;
      store.pause(p.trackSoundIds[p.currentIndex]);
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      store.musicPlaylistNext();
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      store.musicPlaylistPrev();
    });

    navigator.mediaSession.setActionHandler("stop", () => {
      store.stopMusicPlaylist();
    });

    navigator.mediaSession.setActionHandler("seekto", (details) => {
      const p = store.activeMusicPlaylist;
      if (!p || details.seekTime === undefined || details.seekTime === null) return;
      store.seek(p.trackSoundIds[p.currentIndex], details.seekTime);
    });
  }

  /** Publish the board as `state\ntitle`, or clear the session when nothing plays. */
  function syncBoard(key: string | null) {
    clearHandlers();
    try {
      navigator.mediaSession.setPositionState();
    } catch {
      // Older Safari takes no empty call; a stale scrubber is all that is lost.
    }
    if (key === null) {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
      return;
    }
    const [state, title] = key.split("\n");
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: "Dungeon Grimoire",
      artwork: [{ src: "/icon-512.png", type: "image/png", sizes: "512x512" }],
    });
    navigator.mediaSession.playbackState = state === "paused" ? "paused" : "playing";
    navigator.mediaSession.setActionHandler("play", () => store.resumeAll());
    navigator.mediaSession.setActionHandler("pause", () => store.pauseAll());
    navigator.mediaSession.setActionHandler("stop", () => store.stopAll());
  }

  function clearHandlers() {
    (
      ["play", "pause", "nexttrack", "previoustrack", "stop", "seekto"] as const
    ).forEach((action) => {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // Some browsers throw when clearing an unsupported action — ignore
      }
    });
  }
}
