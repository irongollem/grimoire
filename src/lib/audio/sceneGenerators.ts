import type { AudioEngine } from "@/lib/audio/audioEngine";

/**
 * Scene layers that fire one-shots at random intervals rather than looping.
 *
 * This is the mechanic that separates a scene from a stack of loops. Three
 * looping files are the same three files every time and players start hearing
 * the seam; a mug that clatters somewhere on the left every forty-odd seconds,
 * never at quite the same level or from quite the same place, reads as a room.
 *
 * Kept out of the soundboard store because none of it is reactive state — it is
 * timers and randomness, which the store cannot exercise in a test but a pool
 * with an injected clock and RNG can.
 */

export interface SceneGeneratorConfig {
  soundId: string;
  fileUrl: string;
  gainTrim: number | undefined;
  minIntervalS: number;
  maxIntervalS: number;
  minGain: number;
  maxGain: number;
  /** Stereo spread: 0 = always centred, 1 = anywhere across the field. */
  panSpread: number;
  /** Level of the owning layer, folded into every firing. */
  layerVolume: number;
}

interface RunningGenerator extends SceneGeneratorConfig {
  timer: ReturnType<typeof setTimeout> | null;
}

export interface SceneGeneratorDeps {
  engine: Pick<AudioEngine, "attach" | "setSoundTrim" | "setPan" | "setSoundVolume">;
  /** Hand back the element for this sound, creating and registering it if absent. */
  getAudio: (soundId: string, fileUrl: string) => HTMLAudioElement;
  /**
   * Source of randomness, in [0, 1). Injectable so a test can pin firing
   * intervals and levels instead of waiting on chance.
   */
  random?: () => number;
}

export interface SceneGeneratorPool {
  /**
   * Register a layer and schedule its first firing. Deliberately does not fire
   * immediately — a scene where every one-shot lands the instant you press play
   * announces itself as a machine.
   */
  start(config: SceneGeneratorConfig): void;
  /** Reschedule layers that were paused, without firing them all at once. */
  resume(soundIds: string[]): void;
  /** Silence layers but keep their config, so resume can restart them. */
  pause(soundIds: string[]): void;
  /** Silence and forget layers — the scene is over. */
  stop(soundIds: string[]): void;
  stopAll(): void;
  has(soundId: string): boolean;
  /**
   * Change the ceiling a layer's firings are drawn against.
   * Returns false when the sound is not a generator, so the caller knows to
   * fall back to ordinary per-sound volume.
   */
  setLayerVolume(soundId: string, volume: number): boolean;
  activeIds(): string[];
}

/** Uniform draw in [min, max]. */
function drawBetween(random: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return min + random() * (max - min);
}

export function createSceneGeneratorPool(deps: SceneGeneratorDeps): SceneGeneratorPool {
  const { engine, getAudio } = deps;
  const random = deps.random ?? Math.random;
  const running = new Map<string, RunningGenerator>();

  function schedule(gen: RunningGenerator): void {
    if (gen.timer !== null) clearTimeout(gen.timer);
    const delayMs = drawBetween(random, gen.minIntervalS, gen.maxIntervalS) * 1000;
    gen.timer = setTimeout(() => fire(gen), delayMs);
  }

  /**
   * Fire one instance, then schedule the next at a fresh random interval. Every
   * firing varies level and stereo position, which is what makes a generator
   * read as a room rather than a repeating cue.
   */
  function fire(gen: RunningGenerator): void {
    const audio = getAudio(gen.soundId, gen.fileUrl);
    engine.attach(gen.soundId, audio, "ambient");
    if (gen.gainTrim !== undefined) engine.setSoundTrim(gen.soundId, gen.gainTrim);

    const level = drawBetween(random, gen.minGain, gen.maxGain) * gen.layerVolume;
    engine.setPan(gen.soundId, drawBetween(random, -gen.panSpread, gen.panSpread));
    engine.setSoundVolume(gen.soundId, level, 0);

    audio.loop = false;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      /* a refused one-shot should not kill the schedule — the next one may work */
    });

    schedule(gen);
  }

  function clearTimer(gen: RunningGenerator): void {
    if (gen.timer === null) return;
    clearTimeout(gen.timer);
    gen.timer = null;
  }

  return {
    start(config) {
      const existing = running.get(config.soundId);
      // Re-starting a live layer must not leave the old timer orphaned, or the
      // sound fires on two schedules at once for the rest of the scene.
      if (existing) clearTimer(existing);
      const gen: RunningGenerator = { ...config, timer: null };
      running.set(config.soundId, gen);
      schedule(gen);
    },

    resume(soundIds) {
      soundIds.forEach((id) => {
        const gen = running.get(id);
        if (gen) schedule(gen);
      });
    },

    pause(soundIds) {
      soundIds.forEach((id) => {
        const gen = running.get(id);
        if (gen) clearTimer(gen);
      });
    },

    stop(soundIds) {
      soundIds.forEach((id) => {
        const gen = running.get(id);
        if (!gen) return;
        clearTimer(gen);
        running.delete(id);
      });
    },

    stopAll() {
      running.forEach(clearTimer);
      running.clear();
    },

    has(soundId) {
      return running.has(soundId);
    },

    setLayerVolume(soundId, volume) {
      const gen = running.get(soundId);
      if (!gen) return false;
      gen.layerVolume = Math.max(0, Math.min(1, volume));
      return true;
    },

    activeIds() {
      return [...running.keys()];
    },
  };
}
