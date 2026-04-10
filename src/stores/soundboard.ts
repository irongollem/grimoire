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

function getOrCreate(soundId: string, fileUrl: string): HTMLAudioElement {
  if (!audioInstances.has(soundId)) {
    audioInstances.set(soundId, new Audio(fileUrl));
  }
  return audioInstances.get(soundId)!;
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
      playbackStates.value[soundId] = { isPlaying: false, volume: 0.8, isLooping: false };
    }
    return playbackStates.value[soundId];
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
    audio.onended = () => {
      if (playbackStates.value[soundId]) {
        playbackStates.value[soundId].isPlaying = false;
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
    delete playbackStates.value[soundId];
  }

  function toggleWidget(): void {
    widgetOpen.value = !widgetOpen.value;
  }

  return {
    playbackStates,
    widgetOpen,
    playingCount,
    getState,
    play,
    stop,
    setVolume,
    toggleLoop,
    stopAll,
    releaseSound,
    toggleWidget,
  };
});
