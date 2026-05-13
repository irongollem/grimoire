import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { SoundPlaybackState } from "@/types/sound.types";

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
    getState,
    play,
    stop,
    seek,
    setVolume,
    toggleLoop,
    stopAll,
    releaseSound,
    toggleWidget,
    warmup,
  };
});
