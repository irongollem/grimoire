import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { SoundPlaybackState, PlaylistTrackWithSound } from "@/types/sound.types";

// ── Playlist run-state types (module-level, not exported) ─────────────────

interface MusicPlaylistRunState {
  playlistId: string;
  playlistName: string;
  /** Sound IDs in play order (may be shuffled). */
  trackSoundIds: string[];
  /** soundId → file URL, prebuilt so play() never needs the track list again. */
  fileUrls: Record<string, string>;
  currentIndex: number;
  repeat: boolean;
}

interface AmbientPlaylistRunState {
  playlistId: string;
  playlistName: string;
  soundIds: string[];
}

// ── Audio Engine (module-level, NEVER reactive) ───────────────────────────
//
// HTMLAudioElement cannot go into Vue reactive state. Vue's Proxy wrapper
// breaks the browser audio pipeline (volume/loop mutations silently dropped,
// play() calls fail unpredictably). Keep instances in a plain Map at module
// scope and only surface serializable state to Pinia.
//
const audioInstances = new Map<string, HTMLAudioElement>();

// Tracks which sound IDs have already been retried once after a load error.
// CDN 502s from Freesound are usually transient — a single retry catches most.
const retriedIds = new Set<string>();

function makeAudio(fileUrl: string): HTMLAudioElement {
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = fileUrl;
  return audio;
}

function destroyAudio(soundId: string): void {
  const el = audioInstances.get(soundId);
  if (el) {
    el.pause();
    el.src = "";
    audioInstances.delete(soundId);
  }
}

// ─────────────────────────────────────────────────────────────────────────

export const useSoundboardStore = defineStore("soundboard", () => {
  // Per-sound playback state (serializable only)
  const playbackStates = ref<Record<string, SoundPlaybackState>>({});

  // Floating widget visibility
  const widgetOpen = ref(false);

  // Active playlist run states
  const activeMusicPlaylist = ref<MusicPlaylistRunState | null>(null);
  const activeAmbientPlaylist = ref<AmbientPlaylistRunState | null>(null);

  // Number of currently playing sounds — used for badge
  const playingCount = computed(
    () => Object.values(playbackStates.value).filter((s) => s.isPlaying).length,
  );

  function getState(soundId: string): SoundPlaybackState {
    if (!playbackStates.value[soundId]) {
      playbackStates.value[soundId] = { isPlaying: false, volume: 0.8, isLooping: false, currentTime: 0, duration: 0, loadError: false };
    }
    return playbackStates.value[soundId];
  }

  function getOrCreate(soundId: string, fileUrl: string): HTMLAudioElement {
    if (!audioInstances.has(soundId)) {
      const audio = makeAudio(fileUrl);
      audio.onerror = () => handleLoadError(soundId, fileUrl);
      audioInstances.set(soundId, audio);
    }
    return audioInstances.get(soundId)!;
  }

  function handleLoadError(soundId: string, fileUrl: string): void {
    if (retriedIds.has(soundId)) {
      // Already retried once — surface the failure to the UI.
      getState(soundId).loadError = true;
      return;
    }
    retriedIds.add(soundId);
    // Recreate the element to re-trigger the network fetch. Same URL — most
    // 502s are transient CDN blips that resolve on the next request.
    destroyAudio(soundId);
    const fresh = makeAudio(fileUrl);
    fresh.onerror = () => handleLoadError(soundId, fileUrl);
    audioInstances.set(soundId, fresh);
  }

  function play(soundId: string, fileUrl: string): void {
    const audio = getOrCreate(soundId, fileUrl);
    const state = getState(soundId);
    audio.volume = state.volume;
    audio.loop = state.isLooping;
    audio.play().catch(() => {
      // Browser may block autoplay; silently ignore — the button stays in
      // "stopped" state so the user can retry.
    });
    state.isPlaying = true;
    audio.ontimeupdate = () => {
      const s = playbackStates.value[soundId];
      if (s) {
        s.currentTime = audio.currentTime;
        s.duration = isFinite(audio.duration) ? audio.duration : 0;
      }
    };
    audio.onended = () => {
      if (playbackStates.value[soundId]) {
        playbackStates.value[soundId].isPlaying = false;
        playbackStates.value[soundId].currentTime = 0;
      }
      // Auto-advance music playlist when this track finishes
      const mpl = activeMusicPlaylist.value;
      if (mpl && mpl.trackSoundIds[mpl.currentIndex] === soundId) {
        musicPlaylistNext();
      }
    };
  }

  function stop(soundId: string): void {
    const audio = audioInstances.get(soundId);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (playbackStates.value[soundId]) {
      playbackStates.value[soundId].isPlaying = false;
      playbackStates.value[soundId].currentTime = 0;
    }
  }

  function pause(soundId: string): void {
    const audio = audioInstances.get(soundId);
    if (audio) audio.pause();
    if (playbackStates.value[soundId]) {
      playbackStates.value[soundId].isPlaying = false;
    }
  }

  function seek(soundId: string, time: number): void {
    const audio = audioInstances.get(soundId);
    if (audio) {
      audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0));
    }
    if (playbackStates.value[soundId]) {
      playbackStates.value[soundId].currentTime = audio?.currentTime ?? 0;
    }
  }

  function setVolume(soundId: string, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    getState(soundId).volume = clamped;
    const audio = audioInstances.get(soundId);
    if (audio) audio.volume = clamped;
  }

  function toggleLoop(soundId: string): void {
    const state = getState(soundId);
    state.isLooping = !state.isLooping;
    const audio = audioInstances.get(soundId);
    if (audio) audio.loop = state.isLooping;
  }

  function stopAll(): void {
    audioInstances.forEach((audio, id) => {
      audio.pause();
      audio.currentTime = 0;
      if (playbackStates.value[id]) {
        playbackStates.value[id].isPlaying = false;
      }
    });
    activeMusicPlaylist.value = null;
    activeAmbientPlaylist.value = null;
  }

  // ── Music playlist playback ─────────────────────────────────────────────

  function playMusicPlaylist(
    playlist: { id: string; name: string; shuffle: boolean; repeat: boolean },
    tracks: PlaylistTrackWithSound[],
  ): void {
    // Stop any currently running music playlist track
    if (activeMusicPlaylist.value) {
      const curId = activeMusicPlaylist.value.trackSoundIds[activeMusicPlaylist.value.currentIndex];
      stop(curId);
    }
    if (tracks.length === 0) return;

    // Build play order (optionally shuffled)
    const ordered = [...tracks].sort((a, b) => a.sort_order - b.sort_order);
    if (playlist.shuffle) {
      for (let i = ordered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
    }

    const trackSoundIds = ordered.map((t) => t.sound.id);
    const fileUrls: Record<string, string> = {};
    ordered.forEach((t) => { fileUrls[t.sound.id] = t.sound.file_url; });

    activeMusicPlaylist.value = {
      playlistId: playlist.id,
      playlistName: playlist.name,
      trackSoundIds,
      fileUrls,
      currentIndex: 0,
      repeat: playlist.repeat,
    };

    // Music tracks never loop individually — the playlist handles sequencing
    const firstId = trackSoundIds[0];
    getState(firstId).isLooping = false;
    const el = audioInstances.get(firstId);
    if (el) el.loop = false;
    play(firstId, fileUrls[firstId]);
  }

  function musicPlaylistNext(): void {
    const mpl = activeMusicPlaylist.value;
    if (!mpl) return;

    stop(mpl.trackSoundIds[mpl.currentIndex]);

    const nextIndex = mpl.currentIndex + 1;
    if (nextIndex >= mpl.trackSoundIds.length) {
      if (mpl.repeat) {
        mpl.currentIndex = 0;
      } else {
        activeMusicPlaylist.value = null;
        return;
      }
    } else {
      mpl.currentIndex = nextIndex;
    }

    const nextId = mpl.trackSoundIds[mpl.currentIndex];
    getState(nextId).isLooping = false;
    const el = audioInstances.get(nextId);
    if (el) el.loop = false;
    play(nextId, mpl.fileUrls[nextId]);
  }

  function musicPlaylistPrev(): void {
    const mpl = activeMusicPlaylist.value;
    if (!mpl) return;

    const curId = mpl.trackSoundIds[mpl.currentIndex];
    // If more than 3s in, restart current track instead of going back
    if ((playbackStates.value[curId]?.currentTime ?? 0) > 3) {
      seek(curId, 0);
      return;
    }

    stop(curId);

    const prevIndex = mpl.currentIndex - 1;
    mpl.currentIndex = prevIndex < 0
      ? (mpl.repeat ? mpl.trackSoundIds.length - 1 : 0)
      : prevIndex;

    const prevId = mpl.trackSoundIds[mpl.currentIndex];
    getState(prevId).isLooping = false;
    const el = audioInstances.get(prevId);
    if (el) el.loop = false;
    play(prevId, mpl.fileUrls[prevId]);
  }

  function stopMusicPlaylist(): void {
    if (!activeMusicPlaylist.value) return;
    stop(activeMusicPlaylist.value.trackSoundIds[activeMusicPlaylist.value.currentIndex]);
    activeMusicPlaylist.value = null;
  }

  // ── Ambient playlist playback ───────────────────────────────────────────

  function playAmbientPlaylist(
    playlist: { id: string; name: string },
    tracks: PlaylistTrackWithSound[],
  ): void {
    // Stop previous ambient scene first
    if (activeAmbientPlaylist.value) {
      stopAmbientPlaylist();
    }
    if (tracks.length === 0) return;

    const soundIds = tracks.map((t) => t.sound.id);
    activeAmbientPlaylist.value = { playlistId: playlist.id, playlistName: playlist.name, soundIds };

    // All tracks loop independently so the scene runs until explicitly stopped
    tracks.forEach((t) => {
      getState(t.sound.id).isLooping = true;
      const el = audioInstances.get(t.sound.id);
      if (el) el.loop = true;
      play(t.sound.id, t.sound.file_url);
    });
  }

  function stopAmbientPlaylist(): void {
    if (!activeAmbientPlaylist.value) return;
    activeAmbientPlaylist.value.soundIds.forEach((id) => stop(id));
    activeAmbientPlaylist.value = null;
  }

  /** Call when a sound is deleted from the library to clean up the engine. */
  function releaseSound(soundId: string): void {
    destroyAudio(soundId);
    retriedIds.delete(soundId);
    delete playbackStates.value[soundId];
  }

  function toggleWidget(): void {
    widgetOpen.value = !widgetOpen.value;
  }

  /**
   * Eagerly create the Audio element so the browser starts buffering the file
   * before the DM hits play. Idempotent — safe to call on every card mount.
   */
  function warmup(soundId: string, fileUrl: string): void {
    getOrCreate(soundId, fileUrl);
  }

  return {
    playbackStates,
    widgetOpen,
    playingCount,
    activeMusicPlaylist,
    activeAmbientPlaylist,
    getState,
    play,
    pause,
    stop,
    seek,
    setVolume,
    toggleLoop,
    stopAll,
    releaseSound,
    toggleWidget,
    warmup,
    playMusicPlaylist,
    musicPlaylistNext,
    musicPlaylistPrev,
    stopMusicPlaylist,
    playAmbientPlaylist,
    stopAmbientPlaylist,
  };
});
