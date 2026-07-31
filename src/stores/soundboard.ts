import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  SoundPlaybackState,
  PlaylistTrackWithSound,
  AudioEffectPreset,
  SoundCategory,
  PlaylistType,
} from "@/types/sound.types";
import { getAudioEngine, type AudioBus } from "@/lib/audio/audioEngine";
import { setAutoResumeGate } from "@/lib/audio/audioContext";
import { isVolumeSettable } from "@/lib/audio/audioDirectOutput";
import { getDirectOutputEnabled, setDirectOutputEnabled } from "@/lib/audio/audioOutputPrefs";
import { createSceneGeneratorPool } from "@/lib/audio/sceneGenerators";
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
  loopShadowId,
} from "@/lib/audio/soundTransport";

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
  /** soundId → level within this scene, live-adjustable while it plays. */
  layerVolumes: Record<string, number>;
  /** soundId → true when this layer fires one-shots instead of looping. */
  generators: Record<string, boolean>;
  /** soundId → file URL, so resume can rebuild the gapless pair. */
  fileUrls: Record<string, string>;
  /** soundId → loudness-normalisation multiplier from the sound row. */
  gainTrims: Record<string, number>;
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
/** Overlap used to hide the seam when a looping bed wraps around. */
const LOOP_CROSSFADE_MS = 700;

const DEFAULT_VOLUME = 0.8;

/**
 * A looping sound played as two alternating elements, so the wrap is covered by
 * a crossfade rather than exposed as a gap. `liveId` is whichever half is
 * currently audible; the other is idle and pre-buffered.
 */
interface GaplessLoop {
  fileUrl: string;
  bus: AudioBus;
  gainTrim: number | undefined;
  liveId: string;
  swapping: boolean;
}

/** Logical soundId → its gapless-loop state. Non-reactive; the UI only ever sees the logical id. */
const gaplessLoops = new Map<string, GaplessLoop>();

// ─────────────────────────────────────────────────────────────────────────

export const useSoundboardStore = defineStore("soundboard", () => {
  const engine = getAudioEngine();

  // Scene layers that fire one-shots at random intervals rather than looping.
  // Lives outside the store because it is timers and randomness rather than
  // reactive state — see src/lib/audio/sceneGenerators.ts.
  const generators = createSceneGeneratorPool({ engine, getAudio: getOrCreate });

  // Per-sound playback state (serializable only)
  const playbackStates = ref<Record<string, SoundPlaybackState>>({});

  // Floating widget visibility
  const widgetOpen = ref(false);

  // True while a Google Cast session is active — local audio.play() is skipped
  // so the Cast device plays instead. Set externally by useCast composable.
  const isCasting = ref(false);

  // Active playlist run states
  const activeMusicPlaylist = ref<MusicPlaylistRunState | null>(null);
  // Scenes stack: rain over a tavern, a forge under a market. Music does not —
  // two tracks at once is a mistake, two rooms at once is the feature.
  const activeAmbientPlaylists = ref<AmbientPlaylistRunState[]>([]);

  // Per-sound audio effect presets (reactive — drives UI only; actual params live in the engine)
  const soundEffects = ref<Record<string, AudioEffectPreset>>({});

  // Master + per-bus faders. New surface — nothing existed before, so a DM had
  // to ride every sound's slider individually to bring the whole mix down.
  const masterVolume = ref(1);
  const busVolumes = ref<Record<AudioBus, number>>({ music: 1, ambient: 1, effects: 1 });

  // Effect applied to the whole mix. Per-sound effects answer "that bard is
  // behind a door"; this answers "the party is in a cave", where everything
  // audible should be in the cave rather than one selected track.
  const masterEffect = ref<AudioEffectPreset>("none");

  // ── Output mode ─────────────────────────────────────────────────────────
  //
  // Direct output bypasses the Web Audio graph to dodge WebKit bug 221334,
  // which drops audio out every few seconds over CarPlay and Bluetooth.
  // `audioDirectOutput.ts` has the full reasoning and the trade.

  const directOutput = ref(getDirectOutputEnabled());
  engine.setDirectMode(directOutput.value);

  /**
   * Whether the faders in the UI actually do anything right now.
   *
   * False on iOS in direct output: Apple does not allow JS to set an element's
   * volume there, so master, bus and per-sound levels are the device's to
   * control. The UI reads this to say so rather than offering sliders that
   * move and change nothing.
   */
  const volumeControlAvailable = computed(
    () => !directOutput.value || isVolumeSettable(),
  );

  /**
   * Why the faders are unavailable, or null when they work.
   *
   * The copy lives here rather than in each surface so the mixer, the scene
   * layers and the sound cards all give the same explanation — there are four
   * places showing a `VolumeSlider` and a DM should not get four answers.
   */
  const volumeControlNote = computed(() =>
    volumeControlAvailable.value
      ? null
      : "Direct output is on and this device reserves volume for its hardware controls — use the car or device dial.",
  );

  /**
   * Switch output modes, rebuilding every audio element on the way.
   *
   * The rebuild is not optional. `createMediaElementSource()` may only be
   * called once per element and cannot be undone, so an element that has been
   * through the graph can never be played directly again — the only way back
   * is a fresh element. Everything stops first, because destroying an element
   * mid-playback is how you get a stuck `isPlaying` and no way to clear it.
   */
  function setDirectOutput(enabled: boolean): void {
    if (directOutput.value === enabled) return;

    stopAll();
    // Snapshot the ids first: destroyAudio deletes from the same map.
    const ids: string[] = [];
    forEachInstance((_el, id) => ids.push(id));
    ids.forEach((id) => {
      engine.detach(id);
      destroyAudio(id);
      forgetGeneration(id);
    });

    directOutput.value = enabled;
    setDirectOutputEnabled(enabled);
    engine.setDirectMode(enabled);

    // The new mode starts at unity — hand it the levels the DM already set.
    engine.setMasterVolume(masterVolume.value, 0);
    (Object.keys(busVolumes.value) as AudioBus[]).forEach((bus) =>
      engine.setBusVolume(bus, busVolumes.value[bus], 0),
    );
  }

  // Number of currently playing sounds — used for badge
  const playingCount = computed(
    () => Object.values(playbackStates.value).filter((s) => s.isPlaying).length,
  );

  /**
   * How many distinct things are making noise, for the nav badge.
   *
   * A running playlist counts as one item, not as its individual tracks — and
   * its layers are excluded from the per-sound tally so a three-layer scene
   * reads as "1", matching how the DM thinks about it.
   */
  const activeAudioCount = computed(() => {
    const scenes = activeAmbientPlaylists.value;
    const mpl = activeMusicPlaylist.value;
    const ownedIds = new Set<string>([
      ...scenes.flatMap((s) => s.soundIds),
      ...(mpl ? mpl.trackSoundIds : []),
    ]);

    let count = Object.entries(playbackStates.value).filter(
      ([id, st]) => st.isPlaying && !ownedIds.has(id),
    ).length;

    if (mpl && !mpl.paused) count += 1;
    // Each running scene is one item. Two stacked scenes are two things the DM
    // started and two things they may want to stop, so they read as two.
    count += scenes.filter((s) => !s.paused).length;
    return count;
  });

  /**
   * Is anything at all producing sound?
   *
   * Deliberately broader than `playingCount`. A running playlist or scene has no
   * per-sound playback state of its own, and generator layers never create one
   * at all — they fire one-shots directly. Judging "is the board silent?" by
   * `playbackStates` alone therefore reports silence over a playing scene.
   */
  const hasActiveAudio = computed(() => {
    if (playingCount.value > 0) return true;
    const mpl = activeMusicPlaylist.value;
    if (mpl && !mpl.paused) return true;
    return activeAmbientPlaylists.value.some((s) => !s.paused);
  });

  // With the screen locked (CarPlay, pocket), visibilitychange never fires, so
  // an OS suspension of the AudioContext mid-play would otherwise go
  // unresumed — heard as the track dropping 1–3 s chunks, since the element's
  // clock keeps running while the graph's output is muted.
  //
  // Direct output is excluded for the same reason the gate exists at all:
  // nothing audible is going through the graph then, so resuming it would hold
  // the OS audio session open for a context nobody is listening to.
  setAutoResumeGate(() => hasActiveAudio.value && !directOutput.value);

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
      // The shadow half of a gapless pair drives the swap but owns no UI state.
      const logicalId = soundId.endsWith("::loop") ? soundId.slice(0, -6) : soundId;
      if (gaplessLoops.has(logicalId)) {
        maybeSwapLoop(logicalId, soundId, audio);
        if (soundId !== logicalId) return;
      }

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
    stopGaplessLoop(soundId, FADE_OUT_MS);
    fadeAndHalt(soundId, true, FADE_OUT_MS);
  }

  function pause(soundId: string): void {
    stopGaplessLoop(soundId, FADE_OUT_MS);
    fadeAndHalt(soundId, false, FADE_OUT_MS);
  }

  /**
   * Fire a sound from the top even if it is already running.
   *
   * The soundboard idiom for a one-shot: hitting the thunderclap twice should
   * give you two thunderclaps, not a pause. Safe against an in-flight fade-out
   * because play() bumps the generation counter, which discards it.
   */
  function restart(
    soundId: string,
    fileUrl: string,
    category?: SoundCategory,
    gainTrim?: number,
  ): void {
    seek(soundId, 0);
    play(soundId, fileUrl, category, gainTrim);
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

  function setMasterEffect(preset: AudioEffectPreset): void {
    masterEffect.value = preset;
    engine.setMasterEffect(preset);
  }

  /**
   * Level to restore when unmuting. Kept in the store rather than in the view
   * that owns the shortcut, so muting, walking to another screen and unmuting
   * there returns to the level you actually had.
   */
  const preMuteVolume = ref(1);

  function toggleMute(): void {
    if (masterVolume.value > 0) {
      preMuteVolume.value = masterVolume.value;
      setMasterVolume(0);
      return;
    }
    // A mute at zero with nothing remembered would unmute to silence.
    setMasterVolume(preMuteVolume.value > 0 ? preMuteVolume.value : 1);
  }

  /** Nudge the master fader, for the volume shortcuts. */
  function adjustMasterVolume(delta: number): void {
    setMasterVolume(masterVolume.value + delta);
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
    generators.stopAll();
    gaplessLoops.clear();
    clearDucking();
    engine.unduck(0);
    activeMusicPlaylist.value = null;
    activeAmbientPlaylists.value = [];
  }

  /**
   * Sounds that pauseAll silenced, so resumeAll knows what to bring back.
   * Only ones playing in their own right — playlist and scene members are
   * restored by their own playlist, not individually.
   */
  const suspendedByPauseAll = new Set<string>();

  /** Sound IDs currently owned by a running playlist or scene. */
  function playlistOwnedIds(): Set<string> {
    const mpl = activeMusicPlaylist.value;
    return new Set<string>([
      ...activeAmbientPlaylists.value.flatMap((s) => s.soundIds),
      ...(mpl ? mpl.trackSoundIds : []),
    ]);
  }

  /**
   * Silence everything without losing where anything was.
   *
   * The doorbell case: Stop All would cost the DM their place in a playlist and
   * their scene, which is too much to pay for answering the door.
   */
  function pauseAll(): void {
    const owned = playlistOwnedIds();
    suspendedByPauseAll.clear();

    Object.entries(playbackStates.value).forEach(([id, st]) => {
      if (!st.isPlaying || owned.has(id)) return;
      suspendedByPauseAll.add(id);
      pause(id);
    });

    const mpl = activeMusicPlaylist.value;
    if (mpl && !mpl.paused) pauseMusicPlaylist();
    // No id: every running scene pauses, which is what "everything" means.
    pauseAmbientPlaylist();
  }

  function resumeAll(): void {
    suspendedByPauseAll.forEach((id) => {
      const audio = getInstance(id);
      if (!audio) return;
      // Supersede the fade-out that pause() left in flight, or its callback
      // lands after this and pauses the element we just restarted.
      bumpGeneration(id);
      void audio
        .play()
        .then(() => {
          const live = playbackStates.value[id];
          if (live) live.isPlaying = true;
          engine.fadeIn(id, FADE_IN_MS);
        })
        .catch(() => {
          /* autoplay refused — the UI already shows this one stopped */
        });
    });
    suspendedByPauseAll.clear();

    if (activeMusicPlaylist.value?.paused) resumeMusicPlaylist();
    resumeAmbientPlaylist();
  }

  /** One key for "hold on a moment" and "carry on" — see the space binding. */
  function togglePauseAll(): void {
    if (hasActiveAudio.value) pauseAll();
    else resumeAll();
  }

  // ── Gapless looping ─────────────────────────────────────────────────────

  /**
   * Start a looping sound as a gapless pair. The element does NOT use
   * `audio.loop`; instead `maybeSwapLoop` crossfades to a second element just
   * before the first ends, so the wrap is covered rather than exposed.
   *
   * Falls back to plain `audio.loop` when Web Audio is unavailable — without a
   * gain graph there is nothing to crossfade with.
   */
  function startGaplessLoop(
    soundId: string,
    fileUrl: string,
    category: SoundCategory | undefined,
    gainTrim: number | undefined,
  ): void {
    if (!engine.available) {
      getState(soundId).isLooping = true;
      play(soundId, fileUrl, category, gainTrim);
      return;
    }

    const bus = busForCategory(category);
    gaplessLoops.set(soundId, { fileUrl, bus, gainTrim, liveId: soundId, swapping: false });

    // The visible half loops off; the swap handles wrapping.
    getState(soundId).isLooping = false;
    const el = getOrCreate(soundId, fileUrl);
    el.loop = false;
    play(soundId, fileUrl, category, gainTrim);

    // Pre-buffer the partner so its fetch and decode are done well before the
    // wrap, not during it.
    getOrCreate(loopShadowId(soundId), fileUrl);
  }

  /** Is `id` either half of a live gapless pair for `soundId`? */
  function loopHalves(soundId: string): string[] {
    return [soundId, loopShadowId(soundId)];
  }

  /**
   * Called from ontimeupdate. When the audible half is within one crossfade of
   * its end, bring the idle half up from the start while the current one falls.
   */
  function maybeSwapLoop(logicalId: string, playingId: string, audio: HTMLAudioElement): void {
    const loop = gaplessLoops.get(logicalId);
    if (!loop || loop.swapping || loop.liveId !== playingId) return;
    if (!isFinite(audio.duration) || audio.duration <= 0) return;

    const remainingMs = (audio.duration - audio.currentTime) * 1000;
    if (remainingMs > LOOP_CROSSFADE_MS) return;

    const incomingId = playingId === logicalId ? loopShadowId(logicalId) : logicalId;
    const incoming = getOrCreate(incomingId, loop.fileUrl);
    loop.swapping = true;

    // The incoming half needs the same handlers the visible half got from
    // play(): ontimeupdate is what calls this function. Without it the pair
    // swaps exactly once — the shadow plays its length with nobody watching,
    // and a "looping" bed dies on the second pass.
    attachHandlers(incomingId, incoming, loop.bus);
    engine.attach(incomingId, incoming, loop.bus);
    if (loop.gainTrim !== undefined) engine.setSoundTrim(incomingId, loop.gainTrim);

    incoming.loop = false;
    incoming.currentTime = 0;
    const level = playbackStates.value[logicalId];
    engine.setSoundVolume(incomingId, 0, 0);

    void incoming
      .play()
      .then(() => {
        engine.setSoundVolume(incomingId, level === undefined ? DEFAULT_VOLUME : level.volume, LOOP_CROSSFADE_MS);
        loop.liveId = incomingId;
        // Fade the outgoing half out and park it at the start, ready to be the
        // incoming half next time round.
        const gen = bumpGeneration(playingId);
        void engine.fadeOut(playingId, LOOP_CROSSFADE_MS).then(() => {
          if (!isCurrentGeneration(playingId, gen)) return;
          audio.pause();
          audio.currentTime = 0;
        });
        loop.swapping = false;
      })
      .catch(() => {
        // Autoplay refused the second element — fall back to a plain loop so the
        // bed keeps running, seam and all, rather than stopping dead.
        loop.swapping = false;
        audio.loop = true;
      });
  }

  /** Tear down a gapless pair, silencing both halves. */
  function stopGaplessLoop(soundId: string, fadeMs: number): void {
    const loop = gaplessLoops.get(soundId);
    if (!loop) return;
    gaplessLoops.delete(soundId);
    const shadow = loopShadowId(soundId);
    // The shadow has no playbackState of its own, so halt it directly.
    const shadowEl = getInstance(shadow);
    if (shadowEl) {
      const gen = bumpGeneration(shadow);
      void engine.fadeOut(shadow, fadeMs).then(() => {
        if (!isCurrentGeneration(shadow, gen)) return;
        shadowEl.pause();
        shadowEl.currentTime = 0;
      });
    }
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
    setEffect(soundId, mpl.fileUrls[soundId], preset, "music");
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

  /** Live-adjust one layer's level while its scene is running. */
  function setLayerVolume(soundId: string, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    // A sound belongs to at most one running scene — playAmbientPlaylist skips
    // layers another scene already claimed — so the first match is the only one.
    const apl = activeAmbientPlaylists.value.find((s) => s.soundIds.includes(soundId));
    if (apl) apl.layerVolumes[soundId] = clamped;

    // Generators pick a level per firing, so the pool takes the change as a new
    // ceiling rather than touching a currently-audible instance.
    if (generators.setLayerVolume(soundId, clamped)) return;

    getState(soundId).volume = clamped;
    const audio = getInstance(soundId);
    if (audio) applyVolume(soundId, audio, clamped, 120);
  }

  // ── Ambient playlist playback ───────────────────────────────────────────

  /**
   * Start a scene **alongside** whatever else is running.
   *
   * Scenes stack because rooms do: rain over a tavern, a forge under a market.
   * Replacing was never a deliberate design, only the shape a single ref forced.
   *
   * A layer already audible in another scene is skipped rather than started
   * twice — one element per sound, so a second copy would just play over itself
   * at double volume with no way to tell the two apart afterwards.
   */
  function playAmbientPlaylist(
    playlist: { id: string; name: string },
    tracks: PlaylistTrackWithSound[],
  ): void {
    if (tracks.length === 0) return;
    if (activeAmbientPlaylists.value.some((s) => s.playlistId === playlist.id)) return;

    const claimed = new Set(activeAmbientPlaylists.value.flatMap((s) => s.soundIds));
    tracks = tracks.filter((t) => !claimed.has(t.sound.id));
    if (tracks.length === 0) return;

    const soundIds = tracks.map((t) => t.sound.id);
    const fileUrls: Record<string, string> = {};
    const gainTrims: Record<string, number> = {};
    const layerVolumes: Record<string, number> = {};
    const isGenerator: Record<string, boolean> = {};
    tracks.forEach((t) => {
      fileUrls[t.sound.id] = t.sound.file_url;
      gainTrims[t.sound.id] = t.sound.gain_trim;
      layerVolumes[t.sound.id] = t.layer_volume;
      isGenerator[t.sound.id] = t.is_generator;
    });
    activeAmbientPlaylists.value = [
      ...activeAmbientPlaylists.value,
      {
        playlistId: playlist.id,
        playlistName: playlist.name,
        soundIds,
        fileUrls,
        gainTrims,
        layerVolumes,
        generators: isGenerator,
        paused: false,
      },
    ];

    tracks.forEach((t) => {
      if (t.is_generator) {
        generators.start({
          soundId: t.sound.id,
          fileUrl: t.sound.file_url,
          gainTrim: t.sound.gain_trim,
          minIntervalS: t.min_interval_s,
          maxIntervalS: t.max_interval_s,
          minGain: t.min_gain,
          maxGain: t.max_gain,
          panSpread: t.pan_spread,
          layerVolume: t.layer_volume,
        });
        return;
      }

      getState(t.sound.id).volume = t.layer_volume;
      startGaplessLoop(t.sound.id, t.sound.file_url, "ambient", t.sound.gain_trim);
      engine.fadeIn(t.sound.id, AMBIENT_FADE_MS);
    });
  }

  /** The scenes a call applies to: one by id, or every running scene. */
  function scenesMatching(playlistId?: string): AmbientPlaylistRunState[] {
    if (playlistId === undefined) return [...activeAmbientPlaylists.value];
    return activeAmbientPlaylists.value.filter((s) => s.playlistId === playlistId);
  }

  function pauseAmbientPlaylist(playlistId?: string): void {
    scenesMatching(playlistId).forEach((apl) => {
      if (apl.paused) return;
      generators.pause(apl.soundIds);
      apl.soundIds.forEach((id) => pause(id));
      apl.paused = true;
    });
  }

  function resumeAmbientPlaylist(playlistId?: string): void {
    scenesMatching(playlistId).forEach((apl) => {
      if (!apl.paused) return;
      // Generators come back on a fresh interval rather than resuming mid-count,
      // so the scene does not return with every one-shot firing at once.
      generators.resume(apl.soundIds);

      apl.soundIds.forEach((id) => {
        if (apl.generators[id]) return;
        startGaplessLoop(id, apl.fileUrls[id], "ambient", apl.gainTrims[id]);
        engine.fadeIn(id, AMBIENT_FADE_MS);
      });
      apl.paused = false;
    });
  }

  /** Stop one scene, or every scene when no id is given. */
  function stopAmbientPlaylist(playlistId?: string): void {
    const doomed = scenesMatching(playlistId);
    if (doomed.length === 0) return;

    doomed.forEach((apl) => {
      generators.stop(apl.soundIds);
      apl.soundIds.forEach((id) => {
        stopGaplessLoop(id, AMBIENT_FADE_MS);
        fadeAndHalt(id, true, AMBIENT_FADE_MS);
      });
    });

    const gone = new Set(doomed.map((s) => s.playlistId));
    activeAmbientPlaylists.value = activeAmbientPlaylists.value.filter(
      (s) => !gone.has(s.playlistId),
    );
  }

  // ── Playlist dispatch ───────────────────────────────────────────────────
  //
  // Music playlists and ambient scenes are genuinely different mechanisms — one
  // advances through tracks, the other runs layers at once — but every caller
  // picks between them on the same field. Doing that branch once here keeps it
  // out of the UI, where it was repeated four times per surface.

  function playPlaylist(
    playlist: {
      id: string;
      name: string;
      playlist_type: PlaylistType;
      shuffle: boolean;
      repeat: boolean;
    },
    tracks: PlaylistTrackWithSound[],
  ): void {
    if (playlist.playlist_type === "music") playMusicPlaylist(playlist, tracks);
    else playAmbientPlaylist(playlist, tracks);
  }

  // `playlistId` matters only for ambient, where several scenes run at once and
  // a caller almost always means its own. Omitting it targets every scene, which
  // is what a global Stop All wants and what a card never does.
  function stopPlaylist(type: PlaylistType, playlistId?: string): void {
    if (type === "music") stopMusicPlaylist();
    else stopAmbientPlaylist(playlistId);
  }

  function pausePlaylist(type: PlaylistType, playlistId?: string): void {
    if (type === "music") pauseMusicPlaylist();
    else pauseAmbientPlaylist(playlistId);
  }

  function resumePlaylist(type: PlaylistType, playlistId?: string): void {
    if (type === "music") resumeMusicPlaylist();
    else resumeAmbientPlaylist(playlistId);
  }

  /**
   * Which playlist is running in the music slot, which holds one at a time.
   * Scenes stack, so ask `isPlaylistActive` about those instead.
   */
  function activeMusicPlaylistId(): string | null {
    const run = activeMusicPlaylist.value;
    return run === null ? null : run.playlistId;
  }

  /** Is this specific playlist running, whatever its type? */
  function isPlaylistActive(playlistId: string): boolean {
    if (activeMusicPlaylist.value?.playlistId === playlistId) return true;
    return activeAmbientPlaylists.value.some((s) => s.playlistId === playlistId);
  }

  /** Is this specific playlist running but paused? */
  function isPlaylistPaused(playlistId: string): boolean {
    const mpl = activeMusicPlaylist.value;
    if (mpl?.playlistId === playlistId) return mpl.paused;
    const scene = activeAmbientPlaylists.value.find((s) => s.playlistId === playlistId);
    return scene !== undefined && scene.paused;
  }

  // ── Audio effects ─────────────────────────────────────────────────────────

  /**
   * Apply (or remove) a filter effect to a sound with a smooth transition.
   * The element is attached to the graph on first use; the chain is transparent
   * while the preset is "none".
   *
   * `category` must reflect the sound's real bus — a hardcoded bus here would
   * silently move a playing music or effects sound onto the ambient bus (off
   * its own volume fader, and onto the wrong side of ducking) the moment an
   * effect was applied to it.
   */
  function setEffect(
    soundId: string,
    fileUrl: string,
    preset: AudioEffectPreset,
    category?: SoundCategory,
  ): void {
    const audio = getOrCreate(soundId, fileUrl);
    engine.attach(soundId, audio, busForCategory(category));
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
    stopGaplessLoop(soundId, 0);
    loopHalves(soundId).forEach((id) => {
      engine.detach(id);
      destroyAudio(id);
    });
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
  /**
   * Resume after an OS suspension (screen lock, PWA backgrounding, CarPlay
   * handing focus back). Called from useMediaSession on visibilitychange.
   *
   * Historically this only resumed the AudioContext and deliberately did NOT
   * re-play paused elements, because doing so raced with the play() → advance
   * chain and could throw an AbortError that silently killed auto-advance —
   * i.e. the playlist stopped moving and the driver could not fix it.
   *
   * The transition-generation counter added for crossfading is what makes the
   * re-play safe now: the completion path checks it is still current, so a
   * resume that collides with a swap or a fade loses cleanly instead of
   * stopping the wrong element. Only elements the store already believes are
   * playing are touched, so a genuinely paused playlist stays paused.
   */
  function resumeAudioEngine(): void {
    engine.resume();

    const mpl = activeMusicPlaylist.value;
    if (!mpl || mpl.paused) return;

    const soundId = mpl.trackSoundIds[mpl.currentIndex];
    const state = playbackStates.value[soundId];
    if (!state || !state.isPlaying) return;

    const audio = getInstance(soundId);
    // Only act on the specific inconsistency an interruption leaves behind:
    // we think it is playing, the element says otherwise.
    if (!audio || !audio.paused) return;

    const gen = bumpGeneration(soundId);
    void audio.play().catch(() => {
      if (!isCurrentGeneration(soundId, gen)) return;
      // Autoplay refused on the way back — tell the truth rather than leaving
      // the lock screen and CarPlay claiming it is still playing.
      const live = playbackStates.value[soundId];
      if (live) live.isPlaying = false;
    });
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
    activeAudioCount,
    hasActiveAudio,
    activeMusicPlaylist,
    activeAmbientPlaylists,
    soundEffects,
    isCasting,
    masterVolume,
    busVolumes,
    masterEffect,
    directOutput,
    volumeControlAvailable,
    volumeControlNote,
    setDirectOutput,
    getState,
    play,
    restart,
    pause,
    stop,
    seek,
    setVolume,
    setTrim,
    setMasterVolume,
    adjustMasterVolume,
    toggleMute,
    setBusVolume,
    setMasterEffect,
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
    pauseAll,
    resumeAll,
    togglePauseAll,
    playPlaylist,
    stopPlaylist,
    pausePlaylist,
    resumePlaylist,
    activeMusicPlaylistId,
    isPlaylistActive,
    isPlaylistPaused,
    setEffect,
    setMusicPlaylistEffect,
    setLayerVolume,
    retryLoad,
  };
});
