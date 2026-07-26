import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  SoundPlaybackState,
  PlaylistTrackWithSound,
  AudioEffectPreset,
  SoundCategory,
} from "@/types/sound.types";
import { getAudioEngine, type AudioBus } from "@/lib/audioEngine";
import {
  getInstance,
  setInstance,
  forEachInstance,
  makeAudio,
  destroyAudio,
  hasRetried,
  markRetried,
  clearRetried,
  acquireDuck as takeDuck,
  releaseDuck as dropDuck,
  clearDucking,
  bumpGeneration,
  isCurrentGeneration,
  forgetGeneration,
  busForCategory,
} from "@/lib/soundTransport";

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
  /** soundId → loudness-normalisation multiplier from the sound row. */
  gainTrims: Record<string, number>;
  currentIndex: number;
  repeat: boolean;
  /** Effect carried across all tracks in this playlist session. */
  effect: AudioEffectPreset;
  /** True while the playlist is paused mid-track (audio paused, state preserved). */
  paused: boolean;
}

interface AmbientPlaylistRunState {
  playlistId: string;
  playlistName: string;
  soundIds: string[];
  /** True while the ambient scene is paused (all tracks paused, state preserved). */
  paused: boolean;
}

// ── Transition timings ────────────────────────────────────────────────────
//
// Every transition used to be a hard cut: play() slammed the element to full
// volume, stop() called pause() outright, and playlist advance did
// stop(current) → play(next) with a silence gap while the next file fetched.
// These are the ramps that replace that.

const FADE_IN_MS = 250;
const FADE_OUT_MS = 400;
/** Overlap when advancing between music-playlist tracks. */
const CROSSFADE_MS = 1500;
/** Ambient scene layers come up slower — they're a bed, not a cue. */
const AMBIENT_FADE_MS = 1200;

const DEFAULT_VOLUME = 0.8;

// ─────────────────────────────────────────────────────────────────────────

export const useSoundboardStore = defineStore("soundboard", () => {
  const engine = getAudioEngine();

  // Per-sound playback state (serializable only)
  const playbackStates = ref<Record<string, SoundPlaybackState>>({});

  // Floating widget visibility
  const widgetOpen = ref(false);

  // True while a Google Cast session is active — local audio.play() is skipped
  // so the Cast device plays instead. Set externally by useCast composable.
  const isCasting = ref(false);

  // Active playlist run states
  const activeMusicPlaylist = ref<MusicPlaylistRunState | null>(null);
  const activeAmbientPlaylist = ref<AmbientPlaylistRunState | null>(null);

  // Per-sound audio effect presets (reactive — drives UI only; actual params live in the engine)
  const soundEffects = ref<Record<string, AudioEffectPreset>>({});

  // Master + per-bus faders. New surface — nothing existed before, so a DM had
  // to ride every sound's slider individually to bring the whole mix down.
  const masterVolume = ref(1);
  const busVolumes = ref<Record<AudioBus, number>>({ music: 1, ambient: 1, effects: 1 });

  // Number of currently playing sounds — used for badge
  const playingCount = computed(
    () => Object.values(playbackStates.value).filter((s) => s.isPlaying).length,
  );

  function getState(soundId: string): SoundPlaybackState {
    if (!playbackStates.value[soundId]) {
      playbackStates.value[soundId] = { isPlaying: false, volume: DEFAULT_VOLUME, isLooping: false, currentTime: 0, duration: 0, loadError: false };
    }
    return playbackStates.value[soundId];
  }

  function getOrCreate(soundId: string, fileUrl: string): HTMLAudioElement {
    const existing = getInstance(soundId);
    if (existing) return existing;
    const audio = makeAudio(fileUrl);
    audio.onerror = () => handleLoadError(soundId, fileUrl);
    setInstance(soundId, audio);
    return audio;
  }

  function handleLoadError(soundId: string, fileUrl: string): void {
    if (hasRetried(soundId)) {
      // Already retried once — surface the failure to the UI.
      getState(soundId).loadError = true;
      return;
    }
    markRetried(soundId);
    // Recreate the element to re-trigger the network fetch. Same URL — most
    // 502s are transient CDN blips that resolve on the next request. The engine
    // keys its source nodes by element identity, so it rebuilds the chain when
    // this new element is attached.
    destroyAudio(soundId);
    const fresh = makeAudio(fileUrl);
    fresh.onerror = () => handleLoadError(soundId, fileUrl);
    setInstance(soundId, fresh);
  }

  function retryLoad(soundId: string, fileUrl: string): void {
    getState(soundId).loadError = false;
    clearRetried(soundId);
    destroyAudio(soundId);
    const fresh = makeAudio(fileUrl);
    fresh.onerror = () => handleLoadError(soundId, fileUrl);
    setInstance(soundId, fresh);
  }

  // ── Ducking ─────────────────────────────────────────────────────────────

  function acquireDuck(soundId: string): void {
    if (takeDuck(soundId)) engine.duck();
  }

  function releaseDuck(soundId: string): void {
    if (dropDuck(soundId)) engine.unduck();
  }

  // ── Core playback ───────────────────────────────────────────────────────

  /**
   * Apply the store's notion of a sound's level to whichever path is live:
   * the engine's gain node when Web Audio is available, the element's own
   * volume otherwise.
   */
  function applyVolume(soundId: string, audio: HTMLAudioElement, volume: number, rampMs: number): void {
    if (engine.available) {
      // Element stays wide open; the graph owns level so it can be ramped.
      audio.volume = 1;
      engine.setSoundVolume(soundId, volume, rampMs);
    } else {
      audio.volume = volume;
    }
  }

  function play(
    soundId: string,
    fileUrl: string,
    category?: SoundCategory,
    gainTrim?: number,
  ): void {
    const audio = getOrCreate(soundId, fileUrl);
    const state = getState(soundId);
    const bus = busForCategory(category);

    engine.attach(soundId, audio, bus);
    if (gainTrim !== undefined) engine.setSoundTrim(soundId, gainTrim);

    audio.loop = state.isLooping;
    attachHandlers(soundId, audio, bus);

    // A new play supersedes any in-flight fade-out for this sound.
    bumpGeneration(soundId);

    if (isCasting.value) {
      // Cast device is the output; keep the UI truthful about it playing.
      state.isPlaying = true;
      return;
    }

    // Start silent so fadeIn has somewhere to come from.
    applyVolume(soundId, audio, state.volume, 0);

    void audio
      .play()
      .then(() => {
        const live = playbackStates.value[soundId];
        if (live) live.isPlaying = true;
        if (bus === "effects") acquireDuck(soundId);
        engine.fadeIn(soundId, FADE_IN_MS);
      })
      .catch(() => {
        // Autoplay blocked (or the element was torn down mid-start). Previously
        // isPlaying was set unconditionally before this point, so the UI showed
        // a playing sound while the room heard silence. Tell the truth instead.
        const live = playbackStates.value[soundId];
        if (live) live.isPlaying = false;
      });
  }

  function attachHandlers(soundId: string, audio: HTMLAudioElement, bus: AudioBus): void {
    audio.ontimeupdate = () => {
      const s = playbackStates.value[soundId];
      if (!s) return;
      s.currentTime = audio.currentTime;
      s.duration = isFinite(audio.duration) ? audio.duration : 0;

      // Begin the crossfade before the track actually ends, so the next one is
      // already rising as this one falls. Without this the "crossfade" would be
      // a fade-in after silence, which is just a slower hard cut.
      const mpl = activeMusicPlaylist.value;
      if (!mpl || mpl.paused) return;
      if (mpl.trackSoundIds[mpl.currentIndex] !== soundId) return;
      if (!audio.loop && isFinite(audio.duration) && audio.duration > 0) {
        const remainingMs = (audio.duration - audio.currentTime) * 1000;
        if (remainingMs <= CROSSFADE_MS) advanceMusicPlaylist(1, CROSSFADE_MS);
      }
    };

    audio.onended = () => {
      const s = playbackStates.value[soundId];
      if (s) {
        s.isPlaying = false;
        s.currentTime = 0;
      }
      if (bus === "effects") releaseDuck(soundId);

      // Fallback advance for streams whose duration never resolves, so
      // ontimeupdate's early crossfade never got a chance to fire.
      const mpl = activeMusicPlaylist.value;
      if (mpl && mpl.trackSoundIds[mpl.currentIndex] === soundId) {
        advanceMusicPlaylist(1, 0);
      }
    };
  }

  /**
   * Ramp a sound to silence, then pause it. Returns immediately — callers stay
   * synchronous, matching the previous hard-cut signatures.
   */
  function fadeAndHalt(soundId: string, rewind: boolean, fadeMs: number): void {
    const audio = getInstance(soundId);
    releaseDuck(soundId);

    const st = playbackStates.value[soundId];
    if (st) {
      st.isPlaying = false;
      if (rewind) st.currentTime = 0;
    }
    if (!audio) return;

    const halt = (): void => {
      audio.pause();
      if (rewind) audio.currentTime = 0;
      // Restore the gain node for the next play, which starts from this value.
      const live = playbackStates.value[soundId];
      engine.setSoundVolume(soundId, live === undefined ? DEFAULT_VOLUME : live.volume, 0);
    };

    if (!engine.available || fadeMs <= 0) {
      halt();
      return;
    }

    const gen = bumpGeneration(soundId);
    void engine.fadeOut(soundId, fadeMs).then(() => {
      // A play() landed while we were fading — leave the new playback alone.
      if (!isCurrentGeneration(soundId, gen)) return;
      halt();
    });
  }

  function stop(soundId: string): void {
    fadeAndHalt(soundId, true, FADE_OUT_MS);
  }

  function pause(soundId: string): void {
    fadeAndHalt(soundId, false, FADE_OUT_MS);
  }

  function seek(soundId: string, time: number): void {
    const audio = getInstance(soundId);
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
    const audio = getInstance(soundId);
    if (audio) applyVolume(soundId, audio, clamped, 0);
  }

  /** Per-sound loudness-normalisation offset, so a quiet clip and a loud upload can be levelled once. */
  function setTrim(soundId: string, trim: number): void {
    engine.setSoundTrim(soundId, trim);
  }

  function setMasterVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    masterVolume.value = clamped;
    engine.setMasterVolume(clamped, 60);
  }

  function setBusVolume(bus: AudioBus, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    busVolumes.value[bus] = clamped;
    engine.setBusVolume(bus, clamped, 60);
  }

  function toggleLoop(soundId: string): void {
    const state = getState(soundId);
    state.isLooping = !state.isLooping;
    const audio = getInstance(soundId);
    if (audio) audio.loop = state.isLooping;
  }

  function stopAll(): void {
    forEachInstance((audio, id) => {
      bumpGeneration(id);
      audio.pause();
      audio.currentTime = 0;
      if (playbackStates.value[id]) {
        playbackStates.value[id].isPlaying = false;
      }
    });
    clearDucking();
    engine.unduck(0);
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
    const gainTrims: Record<string, number> = {};
    ordered.forEach((t) => {
      fileUrls[t.sound.id] = t.sound.file_url;
      soundNames[t.sound.id] = t.sound.name;
      artists[t.sound.id] = t.sound.artist ?? null;
      thumbnailUrls[t.sound.id] = t.sound.thumbnail_url ?? null;
      gainTrims[t.sound.id] = t.sound.gain_trim;
    });

    activeMusicPlaylist.value = {
      playlistId: playlist.id,
      playlistName: playlist.name,
      trackSoundIds,
      fileUrls,
      soundNames,
      artists,
      thumbnailUrls,
      gainTrims,
      currentIndex: 0,
      repeat: playlist.repeat,
      effect: "none",
      paused: false,
    };

    startCurrentPlaylistTrack(activeMusicPlaylist.value!);
  }

  /** Starts the track at mpl.currentIndex, enforcing loop=false + re-applying any active effect. */
  function startCurrentPlaylistTrack(mpl: MusicPlaylistRunState): void {
    const soundId = mpl.trackSoundIds[mpl.currentIndex];
    getState(soundId).isLooping = false;
    const el = getInstance(soundId);
    if (el) el.loop = false;
    play(soundId, mpl.fileUrls[soundId], "music", mpl.gainTrims[soundId]);
    if (mpl.effect !== "none") {
      engine.setEffect(soundId, mpl.effect);
      soundEffects.value[soundId] = mpl.effect;
    }
    prefetchNeighbour(mpl);
  }

  /**
   * Create the next track's element ahead of time so its fetch and decode
   * happen before the transition rather than inside the gap it would leave.
   */
  function prefetchNeighbour(mpl: MusicPlaylistRunState): void {
    const nextIndex = mpl.currentIndex + 1;
    const wrapped = nextIndex >= mpl.trackSoundIds.length ? (mpl.repeat ? 0 : -1) : nextIndex;
    if (wrapped < 0) return;
    const nextId = mpl.trackSoundIds[wrapped];
    if (nextId === undefined) return;
    getOrCreate(nextId, mpl.fileUrls[nextId]);
  }

  /**
   * Move by `delta` tracks, overlapping the outgoing fade-out with the incoming
   * fade-in. `fadeMs` of 0 means the outgoing track already ended, so there is
   * nothing to overlap.
   */
  function advanceMusicPlaylist(delta: number, fadeMs: number): void {
    const mpl = activeMusicPlaylist.value;
    if (!mpl) return;

    const outgoingId = mpl.trackSoundIds[mpl.currentIndex];
    const nextIndex = mpl.currentIndex + delta;

    if (nextIndex >= mpl.trackSoundIds.length) {
      if (!mpl.repeat) {
        fadeAndHalt(outgoingId, true, fadeMs);
        activeMusicPlaylist.value = null;
        return;
      }
      mpl.currentIndex = 0;
    } else if (nextIndex < 0) {
      mpl.currentIndex = mpl.repeat ? mpl.trackSoundIds.length - 1 : 0;
    } else {
      mpl.currentIndex = nextIndex;
    }

    const incomingId = mpl.trackSoundIds[mpl.currentIndex];
    if (incomingId !== outgoingId) fadeAndHalt(outgoingId, true, fadeMs);
    startCurrentPlaylistTrack(mpl);
  }

  function musicPlaylistNext(): void {
    advanceMusicPlaylist(1, CROSSFADE_MS);
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

    advanceMusicPlaylist(-1, CROSSFADE_MS);
  }

  function setMusicPlaylistEffect(preset: AudioEffectPreset): void {
    const mpl = activeMusicPlaylist.value;
    if (!mpl) return;
    mpl.effect = preset;
    const soundId = mpl.trackSoundIds[mpl.currentIndex];
    setEffect(soundId, mpl.fileUrls[soundId], preset);
  }

  function pauseMusicPlaylist(): void {
    const mpl = activeMusicPlaylist.value;
    if (!mpl || mpl.paused) return;
    pause(mpl.trackSoundIds[mpl.currentIndex]);
    mpl.paused = true;
  }

  function resumeMusicPlaylist(): void {
    const mpl = activeMusicPlaylist.value;
    if (!mpl || !mpl.paused) return;
    const soundId = mpl.trackSoundIds[mpl.currentIndex];
    play(soundId, mpl.fileUrls[soundId], "music", mpl.gainTrims[soundId]);
    mpl.paused = false;
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
    activeAmbientPlaylist.value = { playlistId: playlist.id, playlistName: playlist.name, soundIds, paused: false };

    // All tracks loop independently so the scene runs until explicitly stopped.
    // They rise together over AMBIENT_FADE_MS rather than snapping in at full.
    tracks.forEach((t) => {
      getState(t.sound.id).isLooping = true;
      const el = getInstance(t.sound.id);
      if (el) el.loop = true;
      play(t.sound.id, t.sound.file_url, "ambient", t.sound.gain_trim);
      engine.fadeIn(t.sound.id, AMBIENT_FADE_MS);
    });
  }

  function pauseAmbientPlaylist(): void {
    const apl = activeAmbientPlaylist.value;
    if (!apl || apl.paused) return;
    apl.soundIds.forEach((id) => pause(id));
    apl.paused = true;
  }

  function resumeAmbientPlaylist(): void {
    const apl = activeAmbientPlaylist.value;
    if (!apl || !apl.paused) return;
    apl.soundIds.forEach((id) => {
      const el = getInstance(id);
      if (!el) return;
      bumpGeneration(id);
      const st = playbackStates.value[id];
      applyVolume(id, el, st === undefined ? DEFAULT_VOLUME : st.volume, 0);
      void el
        .play()
        .then(() => {
          const live = playbackStates.value[id];
          if (live) live.isPlaying = true;
          engine.fadeIn(id, AMBIENT_FADE_MS);
        })
        .catch(() => {
          const live = playbackStates.value[id];
          if (live) live.isPlaying = false;
        });
    });
    apl.paused = false;
  }

  function stopAmbientPlaylist(): void {
    if (!activeAmbientPlaylist.value) return;
    activeAmbientPlaylist.value.soundIds.forEach((id) => fadeAndHalt(id, true, AMBIENT_FADE_MS));
    activeAmbientPlaylist.value = null;
  }

  // ── Audio effects ─────────────────────────────────────────────────────────

  /**
   * Apply (or remove) a filter effect to a sound with a smooth transition.
   * The element is attached to the graph on first use; the chain is transparent
   * while the preset is "none".
   */
  function setEffect(soundId: string, fileUrl: string, preset: AudioEffectPreset): void {
    const audio = getOrCreate(soundId, fileUrl);
    engine.attach(soundId, audio, "ambient");
    engine.setEffect(soundId, preset);
    soundEffects.value[soundId] = preset;
  }

  /**
   * Pause the local audio element for a sound without touching Pinia state.
   * Used by the Cast integration to silence local playback when Cast takes over,
   * while keeping isPlaying = true so the UI reflects that audio is playing (via Cast).
   */
  function pauseForCast(soundId: string): void {
    const audio = getInstance(soundId);
    if (audio) audio.pause();
  }

  /** Call when a sound is deleted from the library to clean up the engine. */
  function releaseSound(soundId: string): void {
    releaseDuck(soundId);
    bumpGeneration(soundId);
    engine.detach(soundId);
    destroyAudio(soundId);
    clearRetried(soundId);
    forgetGeneration(soundId);
    delete playbackStates.value[soundId];
    delete soundEffects.value[soundId];
  }

  /**
   * Resume the Web Audio graph after an OS suspension (screen-lock, PWA backgrounding).
   * Called from useMediaSession on visibilitychange → "visible".
   *
   * Only the AudioContext is resumed here. Re-playing HTMLAudioElements that
   * were paused by an interruption is intentionally omitted: doing so races with
   * the play() → onended → advance chain and can cause an AbortError that
   * silently kills auto-advance.
   */
  function resumeAudioEngine(): void {
    engine.resume();
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
    isCasting,
    masterVolume,
    busVolumes,
    getState,
    play,
    pause,
    stop,
    seek,
    setVolume,
    setTrim,
    setMasterVolume,
    setBusVolume,
    toggleLoop,
    stopAll,
    releaseSound,
    pauseForCast,
    resumeAudioEngine,
    toggleWidget,
    warmup,
    playMusicPlaylist,
    musicPlaylistNext,
    musicPlaylistPrev,
    pauseMusicPlaylist,
    resumeMusicPlaylist,
    stopMusicPlaylist,
    playAmbientPlaylist,
    pauseAmbientPlaylist,
    resumeAmbientPlaylist,
    stopAmbientPlaylist,
    setEffect,
    setMusicPlaylistEffect,
    retryLoad,
  };
});
