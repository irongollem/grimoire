import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { SoundPlaybackState, PlaylistTrackWithSound, AudioEffectPreset } from "@/types/sound.types";

// ── Playlist run-state types (module-level, not exported) ─────────────────

interface MusicPlaylistRunState {
  playlistId: string;
  playlistName: string;
  /** Sound IDs in play order (may be shuffled). */
  trackSoundIds: string[];
  /** soundId → file URL, prebuilt so play() never needs the track list again. */
  fileUrls: Record<string, string>;
  /** soundId → display name — used by Media Session (CarPlay, lock screen). */
  soundNames: Record<string, string>;
  /** soundId → artist (nullable) — used by Media Session; defaults to "Dungeon Grimoire". */
  artists: Record<string, string | null>;
  /** soundId → thumbnail URL (nullable) — used as Media Session artwork. */
  thumbnailUrls: Record<string, string | null>;
  currentIndex: number;
  repeat: boolean;
  /** Effect carried across all tracks in this playlist session. */
  effect: AudioEffectPreset;
}

interface AmbientPlaylistRunState {
  playlistId: string;
  playlistName: string;
  soundIds: string[];
}

// ── Web Audio effect engine (module-level) ────────────────────────────────
//
// Sounds can be "promoted" into a Web Audio graph to apply real-time filter
// effects. Once promoted, an HTMLAudioElement's output permanently routes
// through the AudioContext (Web Audio API constraint) — but the chain is
// transparent (frequency=22 kHz, gain=1.0) until an effect is applied.
//
// Volume is still controlled via audio.volume (pre-context), so the user's
// volume setting and the effect's gain reduction stack correctly.
//

interface EffectChain {
  source: MediaElementAudioSourceNode;
  filter: BiquadFilterNode;
  gainNode: GainNode;
}

interface EffectParams {
  frequency: number; // lowpass cutoff (Hz)
  Q: number;         // resonance
  gain: number;      // linear gain multiplier — < 1 = quieter
}

const EFFECT_PARAMS: Record<Exclude<AudioEffectPreset, "none">, EffectParams> = {
  through_door: { frequency: 700,  Q: 1.2, gain: 0.50 }, // wood: muffled, slight resonance
  through_wall: { frequency: 220,  Q: 0.8, gain: 0.25 }, // stone: very muffled, barely there
  distant:      { frequency: 1800, Q: 0.5, gain: 0.35 }, // air: loses sparkle, much quieter
  underwater:   { frequency: 150,  Q: 3.5, gain: 0.40 }, // water: heavy, resonant
};

const EFFECT_RAMP_S = 0.5; // smooth transition duration in seconds

let sharedAudioCtx: AudioContext | null = null;
const effectChains = new Map<string, EffectChain>();

function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx) sharedAudioCtx = new AudioContext();
  if (sharedAudioCtx.state === "suspended") void sharedAudioCtx.resume();
  return sharedAudioCtx;
}

function promoteToAudioCtx(soundId: string, audioEl: HTMLAudioElement): EffectChain {
  if (effectChains.has(soundId)) return effectChains.get(soundId)!;

  // If the element was created before crossOrigin was added to makeAudio()
  // (e.g. warmed-up or played in a previous session without the fix), we must
  // reload it with CORS headers before the browser will let Web Audio read it.
  // New elements from makeAudio() already have crossOrigin set, so this branch
  // is only hit on elements that predate this fix.
  if (audioEl.crossOrigin !== "anonymous") {
    const wasPlaying = !audioEl.paused;
    const savedTime  = audioEl.currentTime;
    audioEl.crossOrigin = "anonymous";
    audioEl.load(); // re-fetches with CORS; brief silence while rebuffering
    if (wasPlaying) {
      audioEl.addEventListener("canplay", () => {
        audioEl.currentTime = isFinite(audioEl.duration)
          ? Math.min(savedTime, audioEl.duration)
          : savedTime;
        void audioEl.play();
      }, { once: true });
    }
  }

  const ctx = getAudioCtx();
  const source = ctx.createMediaElementSource(audioEl);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 22000; // fully open — passes all frequencies
  filter.Q.value = 0.7071;        // maximally flat (Butterworth Q)
  const gainNode = ctx.createGain();
  gainNode.gain.value = 1.0;
  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  const chain: EffectChain = { source, filter, gainNode };
  effectChains.set(soundId, chain);
  return chain;
}

function destroyEffectChain(soundId: string): void {
  const chain = effectChains.get(soundId);
  if (!chain) return;
  try {
    chain.source.disconnect();
    chain.filter.disconnect();
    chain.gainNode.disconnect();
  } catch (_) { /* already disconnected — ignore */ }
  effectChains.delete(soundId);
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
  // crossOrigin must be set BEFORE src so the browser fetches with CORS headers.
  // Required for Web Audio API (MediaElementAudioSourceNode) to read audio data
  // from cross-origin URLs (Supabase Storage, Freesound CDN, etc.).
  audio.crossOrigin = "anonymous";
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

  // Per-sound audio effect presets (reactive — drives UI only; actual params live in effectChains)
  const soundEffects = ref<Record<string, AudioEffectPreset>>({});

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
    const soundNames: Record<string, string> = {};
    const artists: Record<string, string | null> = {};
    const thumbnailUrls: Record<string, string | null> = {};
    ordered.forEach((t) => {
      fileUrls[t.sound.id] = t.sound.file_url;
      soundNames[t.sound.id] = t.sound.name;
      artists[t.sound.id] = t.sound.artist ?? null;
      thumbnailUrls[t.sound.id] = t.sound.thumbnail_url ?? null;
    });

    activeMusicPlaylist.value = {
      playlistId: playlist.id,
      playlistName: playlist.name,
      trackSoundIds,
      fileUrls,
      soundNames,
      artists,
      thumbnailUrls,
      currentIndex: 0,
      repeat: playlist.repeat,
      effect: "none",
    };

    startCurrentPlaylistTrack(activeMusicPlaylist.value);
  }

  /** Starts the track at mpl.currentIndex, enforcing loop=false + re-applying any active effect. */
  function startCurrentPlaylistTrack(mpl: MusicPlaylistRunState): void {
    const soundId = mpl.trackSoundIds[mpl.currentIndex];
    getState(soundId).isLooping = false;
    const el = audioInstances.get(soundId);
    if (el) el.loop = false;
    play(soundId, mpl.fileUrls[soundId]);
    if (mpl.effect !== "none") {
      setEffect(soundId, mpl.fileUrls[soundId], mpl.effect);
    }
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

    startCurrentPlaylistTrack(mpl);
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

    startCurrentPlaylistTrack(mpl);
  }

  function setMusicPlaylistEffect(preset: AudioEffectPreset): void {
    const mpl = activeMusicPlaylist.value;
    if (!mpl) return;
    mpl.effect = preset;
    const soundId = mpl.trackSoundIds[mpl.currentIndex];
    setEffect(soundId, mpl.fileUrls[soundId], preset);
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

  // ── Audio effects ─────────────────────────────────────────────────────────

  /**
   * Apply (or remove) a filter effect to a sound with a smooth 500 ms transition.
   * Promotes the audio element into the Web Audio graph on first call — this is
   * permanent for the element's lifetime, but the chain is transparent when
   * preset is "none".
   */
  function setEffect(soundId: string, fileUrl: string, preset: AudioEffectPreset): void {
    const audio = getOrCreate(soundId, fileUrl);
    const chain = promoteToAudioCtx(soundId, audio);
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // Anchor current values before scheduling a ramp (prevents discontinuities
    // if setEffect is called multiple times before a previous ramp finishes)
    chain.filter.frequency.cancelScheduledValues(now);
    chain.filter.frequency.setValueAtTime(chain.filter.frequency.value, now);
    chain.filter.Q.cancelScheduledValues(now);
    chain.filter.Q.setValueAtTime(chain.filter.Q.value, now);
    chain.gainNode.gain.cancelScheduledValues(now);
    chain.gainNode.gain.setValueAtTime(chain.gainNode.gain.value, now);

    if (preset === "none") {
      chain.filter.frequency.linearRampToValueAtTime(22000, now + EFFECT_RAMP_S);
      chain.filter.Q.linearRampToValueAtTime(0.7071, now + EFFECT_RAMP_S);
      chain.gainNode.gain.linearRampToValueAtTime(1.0, now + EFFECT_RAMP_S);
    } else {
      const p = EFFECT_PARAMS[preset];
      chain.filter.frequency.linearRampToValueAtTime(p.frequency, now + EFFECT_RAMP_S);
      chain.filter.Q.linearRampToValueAtTime(p.Q, now + EFFECT_RAMP_S);
      chain.gainNode.gain.linearRampToValueAtTime(p.gain, now + EFFECT_RAMP_S);
    }

    soundEffects.value[soundId] = preset;
  }

  /** Call when a sound is deleted from the library to clean up the engine. */
  function releaseSound(soundId: string): void {
    destroyEffectChain(soundId); // disconnect AudioContext nodes before destroying element
    destroyAudio(soundId);
    retriedIds.delete(soundId);
    delete playbackStates.value[soundId];
    delete soundEffects.value[soundId];
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
    soundEffects,
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
    setEffect,
    setMusicPlaylistEffect,
  };
});
