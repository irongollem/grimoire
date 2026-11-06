import { defineStore } from "pinia";
import { ref, computed, reactive } from "vue";
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
  bumpGeneration,
  isCurrentGeneration,
  forgetGeneration,
  busForCategory,
  loopShadowId,
} from "@/lib/audio/soundTransport";
import { type PlayOptions, type PlayMeta, resolvePlayOptions, setRate } from "@/lib/audio/playOptions";
import { createSolo, logicalSoundId } from "@/lib/audio/soloDim";
import { createGaplessLoops } from "@/lib/audio/gaplessLoop";

export type { PlayOptions };

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

const DEFAULT_VOLUME = 0.8;
// ─────────────────────────────────────────────────────────────────────────

export const useSoundboardStore = defineStore("soundboard", () => {
  const engine = getAudioEngine();

  // Scene layers that fire one-shots at random intervals rather than looping.
  // Lives outside the store because it is timers and randomness rather than
  // reactive state — see src/lib/audio/sceneGenerators.ts.
  const generators = createSceneGeneratorPool({ engine, getAudio: getOrCreate });

  // Per-sound playback state (serializable only)
  const playbackStates = ref<Record<string, SoundPlaybackState>>({});

  // Gapless pairs. Closures, because the store's helpers below are declared after this.
  const loops = createGaplessLoops({
    engine,
    getOrCreate: (id, url) => getOrCreate(id, url),
    attachHandlers: (id, el) => attachHandlers(id, el),
    getLevel: (id) => {
      const st = playbackStates.value[id];
      return st === undefined ? undefined : st.volume;
    },
    applyDim: (id, ms) => solo.applyDim(id, ms),
  });

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
  /** A preset per bus: "the music is through a door" while the rest of the room is dry. */
  const busEffects = ref<Record<AudioBus, AudioEffectPreset>>({ music: "none", ambient: "none", effects: "none" });

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
      : "Direct output is on and this device reserves volume for its hardware controls. Use the car or device dial.",
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
    engine.setHush(hushedRef.value);
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
      // No graph to compose the per-play gain and solo dim in, so fold them in here.
      const meta = playMeta.get(soundId);
      const playGain = meta === undefined ? 1 : meta.playGain;
      audio.volume = Math.min(1, volume * playGain * solo.dimFor(soundId));
    }
  }

  /** soundId → options of its latest play. Plain map: not UI state. */
  const playMeta = new Map<string, PlayMeta>();

  /**
   * Sounds asked to play whose file has not started yet. isPlaying only turns
   * true once play() resolves, so without this a stop in that gap (a quick
   * Gate tap, a lane-mate taking over) would find nothing to stop.
   */
  const startingIds = reactive(new Set<string>());

  function isStarting(soundId: string): boolean {
    return startingIds.has(soundId);
  }

  /**
   * What ran out by itself since it last started: a sound id, or `playlist:<id>`
   * for a music playlist that played its last track. Lets a listener tell a
   * track that finished from one the DM stopped (#1136's music takeover rule).
   */
  const finishedKeys = reactive(new Set<string>());

  function finishedByItself(soundId: string): boolean {
    return finishedKeys.has(soundId);
  }

  function playlistFinishedByItself(playlistId: string): boolean {
    return finishedKeys.has(`playlist:${playlistId}`);
  }

  /**
   * Start a sound. `category` is required in practice: omitting it routes to the
   * ambient bus, so every call site names it.
   */
  function play(
    soundId: string,
    fileUrl: string,
    category?: SoundCategory,
    gainTrim?: number,
    opts?: PlayOptions,
  ): void {
    if (opts !== undefined && opts.loop === true) {
      startGaplessLoop(soundId, fileUrl, category, gainTrim, opts);
      return;
    }
    playElement(soundId, fileUrl, category, gainTrim, opts);
  }

  function playElement(
    soundId: string,
    fileUrl: string,
    category: SoundCategory | undefined,
    gainTrim: number | undefined,
    opts: PlayOptions | undefined,
  ): void {
    const audio = getOrCreate(soundId, fileUrl);
    const state = getState(soundId);
    const bus = busForCategory(category);
    const { playGain, rate } = resolvePlayOptions(opts);

    engine.attach(soundId, audio, bus);
    if (gainTrim !== undefined) engine.setSoundTrim(soundId, gainTrim);
    // Always set, so one press's velocity never leaks into the next play.
    playMeta.set(soundId, { fileUrl, bus, gainTrim, playGain, rate, title: opts?.title });
    engine.setSoundPlayGain(soundId, playGain);
    setRate(audio, rate);
    // A sound that starts under a solo comes up already dimmed, not at full level.
    solo.applyDim(soundId, 0);

    audio.loop = state.isLooping;
    attachHandlers(soundId, audio);

    // A new play supersedes any in-flight fade-out for this sound, and a stop
    // that lands before the file starts supersedes this play in turn.
    const gen = bumpGeneration(soundId);

    if (isCasting.value) {
      // Cast device is the output; keep the UI truthful about it playing.
      state.isPlaying = true;
      solo.noteStart(soundId);
      return;
    }

    // Start silent so fadeIn has somewhere to come from.
    applyVolume(soundId, audio, state.volume, 0);

    startingIds.add(soundId);
    finishedKeys.delete(soundId);
    void audio
      .play()
      .then(() => {
        // Stopped while the file was still loading (a quick tap on a Gate pad),
        // or played again. Marking it playing or fading it in now would leave a
        // sound running that nobody holds; the stop's own halt pauses it, still
        // silent, and a newer play owns the state.
        if (!isCurrentGeneration(soundId, gen)) return;
        startingIds.delete(soundId);
        const live = playbackStates.value[soundId];
        if (live) live.isPlaying = true;
        solo.noteStart(soundId);
        if (opts !== undefined && opts.fadeInMs !== undefined) {
          // An asked-for fade must be audible, so it climbs from silence.
          engine.fadeIn(soundId, opts.fadeInMs, true);
        } else {
          engine.fadeIn(soundId, FADE_IN_MS);
        }
      })
      .catch(() => {
        // A newer play owns the state now.
        if (!isCurrentGeneration(soundId, gen)) return;
        startingIds.delete(soundId);
        // Autoplay blocked (or the element was torn down mid-start). Previously
        // isPlaying was set unconditionally before this point, so the UI showed
        // a playing sound while the room heard silence. Tell the truth instead.
        const live = playbackStates.value[soundId];
        if (live) live.isPlaying = false;
      });
  }

  function attachHandlers(soundId: string, audio: HTMLAudioElement): void {
    audio.ontimeupdate = () => {
      // The shadow half of a gapless pair drives the swap but owns no UI state.
      const logicalId = logicalSoundId(soundId);
      if (loops.has(logicalId)) {
        loops.maybeSwap(logicalId, soundId, audio);
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
        if (remainingMs <= CROSSFADE_MS) advanceMusicPlaylist(1, CROSSFADE_MS, true);
      }
    };

    audio.onended = () => {
      // A gapless half running out while its partner carries the bed is the
      // wrap, not the end: the sound is still playing.
      const loop = loops.get(logicalSoundId(soundId));
      if (loop !== undefined && (loop.swapping || loop.liveId !== soundId)) return;
      finishedKeys.add(soundId);
      const s = playbackStates.value[soundId];
      if (s) {
        s.isPlaying = false;
        s.currentTime = 0;
      }
      solo.checkAlive();

      // Fallback advance for streams whose duration never resolves, so
      // ontimeupdate's early crossfade never got a chance to fire.
      const mpl = activeMusicPlaylist.value;
      if (mpl && mpl.trackSoundIds[mpl.currentIndex] === soundId) {
        advanceMusicPlaylist(1, 0, true);
      }
    };
  }

  /**
   * Ramp a sound to silence, then pause it. Returns immediately — callers stay
   * synchronous, matching the previous hard-cut signatures.
   */
  function fadeAndHalt(soundId: string, rewind: boolean, fadeMs: number): void {
    const audio = getInstance(soundId);

    const st = playbackStates.value[soundId];
    if (st) {
      st.isPlaying = false;
      if (rewind) st.currentTime = 0;
    }
    startingIds.delete(soundId);
    solo.checkAlive();
    if (!audio) return;

    // The gain stays where the fade left it, at silence. pause() is not
    // sample-accurate: the element goes on feeding the graph for a moment (long
    // enough to hear on iOS Safari), so putting the gain back to full here played
    // that last fraction of a second loud. The next play sets its own level
    // (applyVolume in playElement), and Resume all fades back in from here.
    const halt = (): void => {
      audio.pause();
      if (rewind) audio.currentTime = 0;
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
    fadeOut(soundId, FADE_OUT_MS);
  }

  /** Fade a sound to silence over `ms`, then stop and rewind it. A gapless loop ends with it. */
  function fadeOut(soundId: string, ms: number): void {
    loops.stop(soundId, ms);
    fadeAndHalt(soundId, true, ms);
  }

  function pause(soundId: string): void {
    loops.stop(soundId, FADE_OUT_MS);
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
    opts?: PlayOptions,
  ): void {
    seek(soundId, 0);
    play(soundId, fileUrl, category, gainTrim, opts);
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

  /** Colour every sound on one bus, between the sounds' own effects and the master's. */
  function setBusEffect(bus: AudioBus, preset: AudioEffectPreset): void {
    busEffects.value = { ...busEffects.value, [bus]: preset };
    engine.setBusEffect(bus, preset);
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

  /** Is the sound set to loop, whether by the plain flag or as a gapless pair? */
  function isLooping(soundId: string): boolean {
    return loops.has(soundId) || getState(soundId).isLooping;
  }

  /**
   * Turn looping on or off. A sound that is playing switches in place: on
   * converts it to a gapless pair without a restart, off lets the take finish
   * its current pass (no gap, no restart). A silent sound just gets the flag.
   */
  function setLooping(soundId: string, on: boolean): void {
    const state = getState(soundId);
    const audio = getInstance(soundId);

    if (on) {
      if (loops.has(soundId)) return;
      const meta = playMeta.get(soundId);
      // A playlist track advances off its own end, so it keeps the plain flag.
      if (engine.available && audio && state.isPlaying && meta !== undefined && !playlistOwnedIds().has(soundId)) {
        loops.adopt(soundId, meta);
        state.isLooping = false;
        audio.loop = false;
        return;
      }
      state.isLooping = true;
      if (audio) audio.loop = true;
      return;
    }

    loops.dissolve(soundId);
    state.isLooping = false;
    if (audio) audio.loop = false;
  }

  function toggleLoop(soundId: string): void {
    setLooping(soundId, !isLooping(soundId));
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
    startingIds.clear();
    generators.stopAll();
    loops.clear();
    activeMusicPlaylist.value = null;
    activeAmbientPlaylists.value = [];
    suspendedByPauseAll.clear();
    pausedAllActive.value = false;
    solo.setSolo(null);
  }

  /**
   * Sounds that pauseAll silenced, so resumeAll knows what to bring back.
   * Only ones playing in their own right — playlist and scene members are
   * restored by their own playlist, not individually.
   */
  const suspendedByPauseAll = reactive(new Set<string>());
  /** Set when pauseAll paused something; cleared by resumeAll and any stop. */
  const pausedAllActive = ref(false);
  const isPausedAll = computed(
    () =>
      pausedAllActive.value &&
      (suspendedByPauseAll.size > 0 ||
        activeMusicPlaylist.value?.paused === true ||
        activeAmbientPlaylists.value.some((s) => s.paused)),
  );

  /** Sound IDs currently owned by a running playlist or scene. */
  function playlistOwnedIds(): Set<string> {
    const mpl = activeMusicPlaylist.value;
    return new Set<string>([
      ...activeAmbientPlaylists.value.flatMap((s) => s.soundIds),
      ...(mpl ? mpl.trackSoundIds : []),
    ]);
  }

  /**
   * The sounds playing on their own (pads, not a playlist's or scene's layers),
   * with the bus each rides and the name its press gave it. What the phone's
   * Now Playing names when no music playlist is running (useMediaSession).
   */
  const loosePlaying = computed(() => {
    const owned = playlistOwnedIds();
    return Object.entries(playbackStates.value)
      .filter(([id, st]) => st.isPlaying && !owned.has(id))
      .map(([id]) => {
        const meta = playMeta.get(id);
        return { bus: meta?.bus ?? ("ambient" as AudioBus), title: meta?.title };
      });
  });

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
      // Still loading counts, or it would start under the pause.
      if ((!st.isPlaying && !startingIds.has(id)) || owned.has(id)) return;
      suspendedByPauseAll.add(id);
      pause(id);
    });

    const mpl = activeMusicPlaylist.value;
    if (mpl && !mpl.paused) pauseMusicPlaylist();
    // No id: every running scene pauses, which is what "everything" means.
    pauseAmbientPlaylist();
    pausedAllActive.value = true;
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
    pausedAllActive.value = false;
  }

  /** One key for "hold on a moment" and "carry on" — see the space binding. */
  function togglePauseAll(): void {
    if (hasActiveAudio.value) pauseAll();
    else resumeAll();
  }

  /**
   * Fade everything out over `ms` and end it: loose sounds, the music slot and
   * every scene. Unlike pauseAll nothing is kept, so there is no place to come
   * back to. Safe on an empty board.
   */
  function fadeOutAll(ms: number): void {
    // Still loading counts: it would start a moment after "everything" ended.
    const ids = new Set<string>(startingIds);
    Object.entries(playbackStates.value).forEach(([id, st]) => {
      if (st.isPlaying) ids.add(id);
    });
    const scenes = activeAmbientPlaylists.value;
    scenes.forEach((s) => s.soundIds.forEach((id) => ids.add(id)));

    ids.forEach((id) => fadeOut(id, ms));
    generators.stop(scenes.flatMap((s) => s.soundIds));

    activeMusicPlaylist.value = null;
    activeAmbientPlaylists.value = [];
    suspendedByPauseAll.clear();
    pausedAllActive.value = false;
    // Last, so the fading sounds are already marked as fading when the dim lifts.
    solo.setSolo(null);
  }

  // ── Hush ────────────────────────────────────────────────────────────────

  const hushedRef = ref(false);
  const hushed = computed(() => hushedRef.value);

  /** Drop the whole mix to a fraction of its level, independent of master and mute. */
  function setHush(on: boolean): void {
    hushedRef.value = on;
    engine.setHush(on);
  }

  // ── Solo ────────────────────────────────────────────────────────────────

  const soloIdsRef = ref<readonly string[] | null>(null);
  const soloIds = computed(() => soloIdsRef.value);

  function isAlive(id: string): boolean {
    const st = playbackStates.value[id];
    if (st !== undefined && st.isPlaying) return true;
    // Generator layers have no playback state; they are alive while their scene runs.
    return activeAmbientPlaylists.value.some((s) => !s.paused && s.soundIds.includes(id));
  }

  function knownIds(): Set<string> {
    const ids = new Set<string>(Object.keys(playbackStates.value));
    activeAmbientPlaylists.value.forEach((s) => s.soundIds.forEach((id) => ids.add(id)));
    loops.ids().forEach((id) => ids.add(loopShadowId(id)));
    return ids;
  }

  const solo = createSolo({ engine, ids: soloIdsRef, isAlive, knownIds });
  const setSolo = solo.setSolo;

  // ── Gapless looping ─────────────────────────────────────────────────────

  /**
   * Start a looping sound as a gapless pair (see lib/audio/gaplessLoop.ts).
   * Falls back to plain `audio.loop` when Web Audio is unavailable — without a
   * gain graph there is nothing to crossfade with.
   */
  function startGaplessLoop(
    soundId: string,
    fileUrl: string,
    category: SoundCategory | undefined,
    gainTrim: number | undefined,
    opts?: PlayOptions,
  ): void {
    if (!engine.available) {
      getState(soundId).isLooping = true;
      playElement(soundId, fileUrl, category, gainTrim, opts);
      return;
    }

    // Looping an already-looping sound again must not leave the old pair's partner running.
    if (loops.has(soundId)) loops.stop(soundId, 0);

    const { playGain, rate } = resolvePlayOptions(opts);
    loops.register(soundId, {
      fileUrl, bus: busForCategory(category), gainTrim, playGain, rate, liveId: soundId, swapping: false,
    });

    // The visible half loops off; the swap handles wrapping.
    getState(soundId).isLooping = false;
    const el = getOrCreate(soundId, fileUrl);
    el.loop = false;
    playElement(soundId, fileUrl, category, gainTrim, opts);
    loops.prebuffer(soundId, fileUrl);
  }

  // ── Music playlist playback ─────────────────────────────────────────────

  function playMusicPlaylist(
    playlist: { id: string; name: string; shuffle: boolean; repeat: boolean },
    tracks: PlaylistTrackWithSound[],
  ): void {
    finishedKeys.delete(`playlist:${playlist.id}`);
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
  /** `byItself`: the track ran out, rather than the DM skipping. */
  function advanceMusicPlaylist(delta: number, fadeMs: number, byItself = false): void {
    const mpl = activeMusicPlaylist.value;
    if (!mpl) return;

    const outgoingId = mpl.trackSoundIds[mpl.currentIndex];
    const nextIndex = mpl.currentIndex + delta;

    if (nextIndex >= mpl.trackSoundIds.length) {
      if (!mpl.repeat) {
        if (byItself) finishedKeys.add(`playlist:${mpl.playlistId}`);
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
        // Generators fire later through their own elements; the engine remembers the dim for them.
        solo.applyDim(t.sound.id, 0);
        solo.noteStart(t.sound.id);
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
    solo.checkAlive();
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
        loops.stop(id, AMBIENT_FADE_MS);
        fadeAndHalt(id, true, AMBIENT_FADE_MS);
      });
    });

    const gone = new Set(doomed.map((s) => s.playlistId));
    activeAmbientPlaylists.value = activeAmbientPlaylists.value.filter(
      (s) => !gone.has(s.playlistId),
    );
    solo.checkAlive();
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
   * its own volume fader) the moment an
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
    loops.stop(soundId, 0);
    [soundId, loopShadowId(soundId)].forEach((id) => {
      engine.detach(id);
      destroyAudio(id);
    });
    bumpGeneration(soundId);
    startingIds.delete(soundId);
    engine.detach(soundId);
    destroyAudio(soundId);
    clearRetried(soundId);
    forgetGeneration(soundId);
    delete playbackStates.value[soundId];
    delete soundEffects.value[soundId];
    playMeta.delete(soundId);
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

  /**
   * Eagerly create the Audio element so the browser starts buffering the file
   * before the DM hits play. Idempotent — safe to call on every card mount.
   */
  function warmup(soundId: string, fileUrl: string): void {
    getOrCreate(soundId, fileUrl);
  }

  return {
    playbackStates,
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
    busEffects,
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
    setBusEffect,
    toggleLoop,
    setLooping,
    isLooping,
    isStarting,
    finishedByItself,
    playlistFinishedByItself,
    fadeOut,
    fadeOutAll,
    hushed,
    setHush,
    soloIds,
    setSolo,
    isPausedAll,
    loosePlaying,
    stopAll,
    releaseSound,
    pauseForCast,
    resumeAudioEngine,
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
