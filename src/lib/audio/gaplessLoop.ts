import type { AudioBus, AudioEngine } from "@/lib/audio/audioEngine";
import { type PlayMeta, setRate } from "@/lib/audio/playOptions";
import { bumpGeneration, getInstance, isCurrentGeneration, loopShadowId } from "@/lib/audio/soundTransport";

/** Overlap used to hide the seam when a looping bed wraps around. */
const LOOP_CROSSFADE_MS = 700;
/** Short overlap used to hand a gapless loop's audible half back to the main element. */
const LOOP_HANDOFF_MS = 150;
const DEFAULT_VOLUME = 0.8;

/**
 * A looping sound played as two alternating elements, so the wrap is covered by
 * a crossfade rather than exposed as a gap. `liveId` is whichever half is
 * currently audible; the other is idle and pre-buffered.
 */
export interface GaplessLoop {
  fileUrl: string;
  bus: AudioBus;
  gainTrim: number | undefined;
  /** Per-play level and rate, carried to the partner element on every swap. */
  playGain: number;
  rate: number;
  liveId: string;
  swapping: boolean;
}

export interface GaplessLoopDeps {
  engine: AudioEngine;
  getOrCreate: (soundId: string, fileUrl: string) => HTMLAudioElement;
  /** The play() handlers (time updates call back into maybeSwap); the partner needs them too. */
  attachHandlers: (soundId: string, audio: HTMLAudioElement) => void;
  /** The logical sound's UI volume, or undefined when it has no playback state. */
  getLevel: (logicalId: string) => number | undefined;
  /** Re-apply the solo dim to an element id (the partner must sound like the half it replaces). */
  applyDim: (id: string, rampMs: number) => void;
}

/**
 * Gapless looping: ids → pair state, plus the swap/hand-off mechanics. The store
 * keeps the reactive flags; this keeps the elements honest.
 */
export function createGaplessLoops(deps: GaplessLoopDeps) {
  const { engine, getOrCreate, attachHandlers, getLevel, applyDim } = deps;
  /** Logical soundId → its pair state. Non-reactive; the UI only ever sees the logical id. */
  const loops = new Map<string, GaplessLoop>();

  function levelOf(logicalId: string): number {
    const v = getLevel(logicalId);
    return v === undefined ? DEFAULT_VOLUME : v;
  }

  function register(soundId: string, loop: GaplessLoop): void {
    loops.set(soundId, loop);
  }

  /** Pre-buffer the partner so its fetch and decode are done well before the wrap, not during it. */
  function prebuffer(soundId: string, fileUrl: string): void {
    getOrCreate(loopShadowId(soundId), fileUrl);
  }

  /** Convert an already-playing sound into a pair, from what its last play used. */
  function adopt(soundId: string, meta: PlayMeta): void {
    register(soundId, {
      fileUrl: meta.fileUrl, bus: meta.bus, gainTrim: meta.gainTrim,
      playGain: meta.playGain, rate: meta.rate, liveId: soundId, swapping: false,
    });
    prebuffer(soundId, meta.fileUrl);
  }

  /**
   * Called from ontimeupdate. When the audible half is within one crossfade of
   * its end, bring the idle half up from the start while the current one falls.
   */
  function maybeSwap(logicalId: string, playingId: string, audio: HTMLAudioElement): void {
    const loop = loops.get(logicalId);
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
    attachHandlers(incomingId, incoming);
    engine.attach(incomingId, incoming, loop.bus);
    if (loop.gainTrim !== undefined) engine.setSoundTrim(incomingId, loop.gainTrim);
    // The partner must sound like the half it replaces: same press level, rate and solo dim.
    engine.setSoundPlayGain(incomingId, loop.playGain);
    setRate(incoming, loop.rate);
    applyDim(incomingId, 0);

    incoming.loop = false;
    incoming.currentTime = 0;
    const level = getLevel(logicalId);
    engine.setSoundVolume(incomingId, 0, 0);

    void incoming
      .play()
      .then(() => {
        engine.setSoundVolume(incomingId, level === undefined ? DEFAULT_VOLUME : level, LOOP_CROSSFADE_MS);
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
        // Looping was switched off while the swap was in flight.
        if (loops.get(logicalId) !== loop) release(logicalId, loop);
      })
      .catch(() => {
        // Autoplay refused the second element — fall back to a plain loop so the
        // bed keeps running, seam and all, rather than stopping dead.
        loop.swapping = false;
        audio.loop = loops.get(logicalId) === loop;
      });
  }

  /** Fade a half out and park it at the start, unless a newer play claimed it. */
  function retire(id: string, el: HTMLAudioElement, fadeMs: number): void {
    const gen = bumpGeneration(id);
    void engine.fadeOut(id, fadeMs).then(() => {
      if (!isCurrentGeneration(id, gen)) return;
      el.pause();
      el.currentTime = 0;
    });
  }

  /**
   * After a gapless pair is dissolved, make sure exactly the main element is
   * left to finish. If the partner is the audible half, hand over to the main
   * element at the same position with a short overlap; otherwise just retire
   * the idle partner.
   */
  function release(logicalId: string, loop: GaplessLoop): void {
    const shadowId = loopShadowId(logicalId);
    const shadowEl = getInstance(shadowId);
    const main = getInstance(logicalId);

    if (loop.liveId === logicalId || !shadowEl || !main) {
      if (shadowEl) retire(shadowId, shadowEl, LOOP_HANDOFF_MS);
      return;
    }

    main.loop = false;
    main.currentTime = shadowEl.currentTime;
    engine.setSoundVolume(logicalId, 0, 0);
    void main
      .play()
      .then(() => {
        engine.setSoundVolume(logicalId, levelOf(logicalId), LOOP_HANDOFF_MS);
        retire(shadowId, shadowEl, LOOP_HANDOFF_MS);
      })
      .catch(() => {
        // The main element refused; the partner keeps playing out its pass.
        engine.setSoundVolume(logicalId, 0, 0);
      });
  }

  /** Looping was switched off: forget the pair and let the main element finish its pass. */
  function dissolve(soundId: string): void {
    const loop = loops.get(soundId);
    if (!loop) return;
    loops.delete(soundId);
    // Mid-swap the audible half is not settled yet; the swap finishes the job.
    if (!loop.swapping) release(soundId, loop);
  }

  /** Tear down a gapless pair, silencing both halves. */
  function stop(soundId: string, fadeMs: number): void {
    if (!loops.delete(soundId)) return;
    const shadow = loopShadowId(soundId);
    // The shadow has no playbackState of its own, so halt it directly.
    const shadowEl = getInstance(shadow);
    if (shadowEl) retire(shadow, shadowEl, fadeMs);
  }

  return {
    has: (soundId: string): boolean => loops.has(soundId),
    get: (soundId: string): GaplessLoop | undefined => loops.get(soundId),
    ids: (): string[] => [...loops.keys()],
    clear: (): void => loops.clear(),
    register,
    prebuffer,
    adopt,
    maybeSwap,
    dissolve,
    stop,
  };
}

export type GaplessLoops = ReturnType<typeof createGaplessLoops>;
