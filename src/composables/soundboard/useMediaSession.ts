import { watch } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";

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
 * Ambient playlists are intentionally excluded: they have no single "track"
 * to display and no meaningful next/previous concept.
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

  // ── Metadata + handlers — refreshed whenever the active track changes ──

  watch(
    [
      () => store.activeMusicPlaylist?.playlistId,
      () => store.activeMusicPlaylist?.currentIndex,
    ],
    () => syncSession(),
    { immediate: true },
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

  let published: PublishedPosition | null = null;

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
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
      clearHandlers();
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
