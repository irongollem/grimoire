// Web Audio bus-graph engine for the soundboard.
//
// Replaces the "every sound builds its own private chain straight to
// destination" approach with a proper bus graph:
//
//   source → filter → soundGain → busFilter → busGain → masterFilter → masterGain → destination
//                        └→ reverbSend ─┐
//   masterFilter →  masterSend ─────────┴→ convolver → reverbReturn → masterGain
//
// This gives us a master volume fader, per-bus (music/ambient/effects) volume,
// ducking (attenuate music+ambient while an effect one-shot plays), and effects
// at any of the three levels — none of which are possible when every sound
// routes straight to ctx.destination.
//
// Effects exist at sound, bus and master level because they answer different
// questions. Per-sound is "that bard is behind a door". Master is "the party is
// in a cave", where everything audible should be in the cave — applying that to
// one track while the music bed stays dry is acoustically backwards.
//
// Consumes the shared AudioContext singleton from `audioContext.ts` rather
// than owning its own — that module already null-safes environments without
// Web Audio (or where construction throws), and this engine mirrors that:
// every public method is a safe no-op when `getAudioContext()` returns null.
//
// State (bus graph, per-sound chains) lives at module scope, not inside a
// class instance — same pattern as the `effectChains` Map this replaces in
// soundboard.ts. `getAudioEngine()` just hands back a stable object of
// bound functions; there is only ever one graph per page.

import { getAudioContext, resumeExistingAudioContext } from "@/lib/audioContext";
import type { AudioEffectPreset } from "@/types/sound.types";

export type AudioBus = "music" | "ambient" | "effects";

export interface AudioEngine {
  /** False when Web Audio is unavailable (no AudioContext) — every other method is then a safe no-op. */
  readonly available: boolean;
  /** Build (or idempotently reuse) a sound's chain and route it into `bus`. */
  attach(soundId: string, el: HTMLAudioElement, bus: AudioBus): void;
  /** Disconnect and forget a sound's chain. Safe to call even if never attached. */
  detach(soundId: string): void;
  /** Ramp a sound's user-volume gain (composes multiplicatively with trim and any active effect). */
  setSoundVolume(soundId: string, volume: number, rampMs?: number): void;
  /** Set a sound's loudness-normalisation offset (linear multiplier, unclamped above 1). Applied instantly. */
  setSoundTrim(soundId: string, trim: number): void;
  /** Ramp a bus's gain (0–1). */
  setBusVolume(bus: AudioBus, volume: number, rampMs?: number): void;
  /** Ramp the master gain (0–1). */
  setMasterVolume(volume: number, rampMs?: number): void;
  /** Ramp a sound in from silence to its current configured volume. */
  fadeIn(soundId: string, ms: number): void;
  /** Ramp a sound down to true silence. Resolves once the ramp has finished, so callers can safely pause/stop after. */
  fadeOut(soundId: string, ms: number): Promise<void>;
  /** Attenuate the music + ambient buses (NOT effects) — fast attack for an effect one-shot. */
  duck(attackMs?: number, depth?: number): void;
  /** Restore whatever duck() attenuated, with a slower release. */
  unduck(releaseMs?: number): void;
  /** Apply (or clear, via "none") a preset to a single sound — the local case, e.g. one bard heard through a door. */
  setEffect(soundId: string, preset: AudioEffectPreset, rampMs?: number): void;
  /** Apply a preset to a whole bus, colouring every sound routed through it. */
  setBusEffect(bus: AudioBus, preset: AudioEffectPreset, rampMs?: number): void;
  /**
   * Apply a preset to the entire mix. This is the "the party just walked into a
   * cave" case: everything audible should be in the cave, not just whichever
   * track happens to be selected.
   */
  setMasterEffect(preset: AudioEffectPreset, rampMs?: number): void;
  /**
   * Place a sound in the stereo field. -1 hard left, 0 centre, 1 hard right.
   * Used by scene generators, where a one-shot arriving from a different spot
   * each time is most of what stops ambience sounding like a loop.
   */
  setPan(soundId: string, pan: number): void;
  /** Resume a suspended AudioContext (e.g. after OS/PWA backgrounding). */
  resume(): void;
}

// ── Effect presets (ported from soundboard.ts EFFECT_PARAMS) ──────────────

interface FilterTarget {
  frequency: number; // lowpass cutoff (Hz)
  Q: number;         // resonance
  gain: number;       // linear gain multiplier contributed by the effect — < 1 = quieter
  /**
   * How much of this signal is fed to the shared reverb, 0–1.
   *
   * Occlusion presets (door, wall, distance) are about something being *blocked*,
   * so they stay dry. Spaces are defined by their reflections, so cave and sewer
   * send heavily — a lowpass alone makes a cave sound merely muffled, which is
   * the wrong instinct entirely.
   */
  send: number;
  /** Reverb tail length in seconds, used when this preset drives the shared convolver. */
  decay: number;
}

const EFFECT_PARAMS: Record<Exclude<AudioEffectPreset, "none">, FilterTarget> = {
  through_door: { frequency: 700,  Q: 1.2, gain: 0.50, send: 0.05, decay: 0.6 }, // wood: muffled, slight resonance
  through_wall: { frequency: 220,  Q: 0.8, gain: 0.25, send: 0.03, decay: 0.5 }, // stone: very muffled, barely there
  distant:      { frequency: 1800, Q: 0.5, gain: 0.35, send: 0.25, decay: 1.4 }, // air: loses sparkle, some space
  underwater:   { frequency: 150,  Q: 3.5, gain: 0.40, send: 0.15, decay: 1.0 }, // water: heavy, resonant, damped
  cave:         { frequency: 900,  Q: 2.5, gain: 0.65, send: 0.55, decay: 3.2 }, // stone: long, diffuse tail
  sewer:        { frequency: 500,  Q: 2.2, gain: 0.55, send: 0.45, decay: 1.6 }, // wet tunnel: tighter, slappier
};

// Fully open — passes all frequencies, no gain reduction, fully dry.
const OPEN_FILTER: FilterTarget = { frequency: 22000, Q: 0.7071, gain: 1.0, send: 0, decay: 1.5 };

const EFFECT_RAMP_MS_DEFAULT = 500;

const DEFAULT_DUCK_DEPTH = 0.25;        // ducked buses drop to 25% of their pre-duck gain
const DEFAULT_DUCK_ATTACK_MS = 80;      // fast attack
const DEFAULT_DUCK_RELEASE_MS = 400;    // slower release
const DUCKED_BUSES: readonly AudioBus[] = ["music", "ambient"]; // effects bus is never ducked

// Below this, treat a gain value as "silent" for ramp-shape purposes.
// exponentialRampToValueAtTime can neither approach nor leave true zero —
// see scheduleGain() below for the classic bug this avoids.
const SILENCE_FLOOR = 0.0001;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ── Ramp scheduling helpers ─────────────────────────────────────────────────
//
// Two variants, both using the anchor-before-ramp pattern (cancelScheduledValues
// + setValueAtTime at the current value, then ramp) so repeated calls mid-ramp
// never produce a discontinuity/click:
//
// - scheduleLinear: always linear. Used for setEffect's filter frequency/Q/gain,
//   mirroring the original store implementation exactly (those aren't loudness
//   fades to/from silence, so there's no zero-target hazard to design around).
// - scheduleGain: exponential when both endpoints are comfortably non-zero
//   (matches perceived loudness better than linear), falling back to linear
//   whenever silence is involved on either end. exponentialRampToValueAtTime
//   throws if asked to ramp to/from 0 — that's the "classic bug" this avoids,
//   and it's why fades to silence (fadeOut, duck to 0, etc.) always end up
//   linear here and reach a true 0 rather than stalling at some epsilon.

function scheduleLinear(param: AudioParam, ctx: AudioContext, target: number, rampMs: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  const rampS = Math.max(rampMs, 0) / 1000;
  if (rampS <= 0) {
    param.setValueAtTime(target, now);
    return;
  }
  param.linearRampToValueAtTime(target, now + rampS);
}

function scheduleGain(param: AudioParam, ctx: AudioContext, target: number, rampMs: number): void {
  const now = ctx.currentTime;
  const current = param.value;
  param.cancelScheduledValues(now);
  param.setValueAtTime(current, now);

  const clampedTarget = Math.max(0, target);
  const rampS = Math.max(rampMs, 0) / 1000;
  if (rampS <= 0) {
    param.setValueAtTime(clampedTarget, now);
    return;
  }

  const canUseExponential = current > SILENCE_FLOOR && clampedTarget > SILENCE_FLOOR;
  if (canUseExponential) {
    param.exponentialRampToValueAtTime(clampedTarget, now + rampS);
  } else {
    param.linearRampToValueAtTime(clampedTarget, now + rampS);
  }
}

function waitMs(ms: number): Promise<void> {
  const clamped = Math.max(ms, 0);
  if (clamped <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, clamped));
}

// ── Per-sound chain state ──────────────────────────────────────────────────

interface SoundChain {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  filter: BiquadFilterNode;
  soundGain: GainNode;
  /** Tap off soundGain into the shared convolver. Silent unless a preset asks for reverb. */
  reverbSend: GainNode;
  /** Stereo placement. Null where StereoPannerNode is unavailable. */
  panner: StereoPannerNode | null;
  bus: AudioBus;
  volume: number;     // 0–1 user volume, last value passed to setSoundVolume
  trim: number;        // linear multiplier, last value passed to setSoundTrim (default 1)
  effectGain: number; // linear multiplier contributed by the active effect preset (default 1)
}

// createMediaElementSource() may only ever be called once per HTMLAudioElement
// for the lifetime of that element — calling it twice throws. Cache by element
// identity (not soundId) so detach() → attach() on the SAME element reuses the
// existing source node instead of trying to recreate it.
const sourceNodes = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

const chains = new Map<string, SoundChain>();

interface BusGraph {
  ctx: AudioContext;
  master: GainNode;
  /** Sits ahead of master gain, so a master effect colours the whole mix. */
  masterFilter: BiquadFilterNode;
  buses: Record<AudioBus, GainNode>;
  /** One per bus, ahead of the bus gain — sounds connect here, not to the gain. */
  busFilters: Record<AudioBus, BiquadFilterNode>;
  /** Shared reverb. One convolver for the page, fed by per-sound and master sends. */
  convolver: ConvolverNode;
  /** Convolver output level into master. */
  reverbReturn: GainNode;
  /** Master-level reverb send, tapped off masterFilter. */
  masterSend: GainNode;
}

/**
 * Build an impulse response procedurally: exponentially-decaying stereo noise,
 * lightly darkened over time so the tail loses highs the way a real room does.
 *
 * Generated rather than shipped as audio files on purpose. Bundling third-party
 * IRs would drag in licensing questions this project is careful about elsewhere,
 * and for "does the cave sound like a cave" a synthetic tail is entirely
 * convincing.
 */
function buildImpulseResponse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    // One-pole lowpass state, so later reflections are darker than early ones.
    let last = 0;
    for (let i = 0; i < length; i++) {
      const progress = i / length;
      const decay = Math.pow(1 - progress, 2.5);
      const white = Math.random() * 2 - 1;
      // Damping rises with progress: the tail gets progressively duller.
      const damp = 0.2 + progress * 0.6;
      last = white * (1 - damp) + last * damp;
      data[i] = last * decay;
    }
  }
  return buffer;
}

// Cache IRs by decay length — regenerating on every setEffect would be wasteful
// and audibly glitchy.
const impulseCache = new Map<number, AudioBuffer>();

function getImpulseResponse(ctx: AudioContext, seconds: number): AudioBuffer {
  const key = Math.round(seconds * 10) / 10;
  const cached = impulseCache.get(key);
  if (cached) return cached;
  const built = buildImpulseResponse(ctx, key);
  impulseCache.set(key, built);
  return built;
}

let graph: BusGraph | null = null;

// Remembers each ducked bus's gain from just before duck() ran, so unduck()
// restores exactly (and so a duck() while already ducked doesn't compound).
let preDuckGains: Partial<Record<AudioBus, number>> | null = null;

function openFilter(ctx: AudioContext): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = OPEN_FILTER.frequency;
  filter.Q.value = OPEN_FILTER.Q;
  return filter;
}

function ensureGraph(ctx: AudioContext): BusGraph {
  if (graph && graph.ctx === ctx) return graph;

  // sound → busFilter → busGain → masterFilter → masterGain → destination
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  const masterFilter = openFilter(ctx);
  masterFilter.connect(master);

  const buses: Record<AudioBus, GainNode> = {
    music: ctx.createGain(),
    ambient: ctx.createGain(),
    effects: ctx.createGain(),
  };
  const busFilters: Record<AudioBus, BiquadFilterNode> = {
    music: openFilter(ctx),
    ambient: openFilter(ctx),
    effects: openFilter(ctx),
  };
  (Object.keys(buses) as AudioBus[]).forEach((bus) => {
    buses[bus].gain.value = 1;
    busFilters[bus].connect(buses[bus]);
    buses[bus].connect(masterFilter);
  });

  // Shared reverb. Returns into master gain rather than master filter, so the
  // tail isn't filtered a second time on its way out.
  const convolver = ctx.createConvolver();
  convolver.buffer = getImpulseResponse(ctx, OPEN_FILTER.decay);

  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 1;
  convolver.connect(reverbReturn);
  reverbReturn.connect(master);

  const masterSend = ctx.createGain();
  masterSend.gain.value = 0; // dry until a master effect asks otherwise
  masterFilter.connect(masterSend);
  masterSend.connect(convolver);

  graph = { ctx, master, masterFilter, buses, busFilters, convolver, reverbReturn, masterSend };
  return graph;
}

function teardownChain(chain: SoundChain): void {
  // MediaElementAudioSourceNode is intentionally left connected to nothing but
  // NOT recreated — it stays cached in sourceNodes for a possible re-attach.
  try { chain.source.disconnect(); } catch { /* already disconnected */ }
  try { chain.filter.disconnect(); } catch { /* already disconnected */ }
  try { chain.soundGain.disconnect(); } catch { /* already disconnected */ }
  try { chain.reverbSend.disconnect(); } catch { /* already disconnected */ }
  if (chain.panner) {
    try { chain.panner.disconnect(); } catch { /* already disconnected */ }
  }
}

function buildChain(ctx: AudioContext, busGraph: BusGraph, soundId: string, el: HTMLAudioElement, bus: AudioBus): void {
  let source = sourceNodes.get(el);
  if (!source) {
    source = ctx.createMediaElementSource(el);
    sourceNodes.set(el, source);
  }

  const filter = openFilter(ctx);

  const soundGain = ctx.createGain();
  soundGain.gain.value = 1; // transparent until setSoundVolume/setSoundTrim/setEffect say otherwise

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0; // dry until a preset says otherwise

  // StereoPannerNode is near-universal but not guaranteed; without it the sound
  // simply stays centred rather than failing to play.
  const panner = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;

  source.connect(filter);
  filter.connect(soundGain);
  if (panner) {
    soundGain.connect(panner);
    panner.connect(busGraph.busFilters[bus]);
  } else {
    soundGain.connect(busGraph.busFilters[bus]);
  }
  soundGain.connect(reverbSend);
  reverbSend.connect(busGraph.convolver);

  chains.set(soundId, { el, source, filter, soundGain, reverbSend, panner, bus, volume: 1, trim: 1, effectGain: 1 });
}

// ── Public API ──────────────────────────────────────────────────────────────

function attach(soundId: string, el: HTMLAudioElement, bus: AudioBus): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const busGraph = ensureGraph(ctx);

  const existing = chains.get(soundId);
  if (existing) {
    if (existing.el === el) {
      // Already wired — just make sure the bus routing matches the request.
      if (existing.bus !== bus) {
        existing.soundGain.disconnect();
        if (existing.panner) {
          existing.panner.disconnect();
          existing.soundGain.connect(existing.panner);
          existing.panner.connect(busGraph.busFilters[bus]);
        } else {
          existing.soundGain.connect(busGraph.busFilters[bus]);
        }
        existing.soundGain.connect(existing.reverbSend);
        existing.bus = bus;
      }
      return;
    }
    // Element identity changed under the same soundId (e.g. the store rebuilt
    // the <audio> element after a load-error retry) — tear down the stale
    // chain and rebuild fresh against the new element.
    teardownChain(existing);
    chains.delete(soundId);
  }

  buildChain(ctx, busGraph, soundId, el, bus);
}

function detach(soundId: string): void {
  const chain = chains.get(soundId);
  if (!chain) return;
  teardownChain(chain);
  chains.delete(soundId);
}

function setSoundVolume(soundId: string, volume: number, rampMs = 0): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const chain = chains.get(soundId);
  if (!chain) return;
  chain.volume = clamp01(volume);
  scheduleGain(chain.soundGain.gain, ctx, chain.volume * chain.trim * chain.effectGain, rampMs);
}

function setSoundTrim(soundId: string, trim: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const chain = chains.get(soundId);
  if (!chain) return;
  chain.trim = Math.max(0, trim);
  scheduleGain(chain.soundGain.gain, ctx, chain.volume * chain.trim * chain.effectGain, 0);
}

function setBusVolume(bus: AudioBus, volume: number, rampMs = 0): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const busGraph = ensureGraph(ctx);
  scheduleGain(busGraph.buses[bus].gain, ctx, clamp01(volume), rampMs);
}

function setMasterVolume(volume: number, rampMs = 0): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const busGraph = ensureGraph(ctx);
  scheduleGain(busGraph.master.gain, ctx, clamp01(volume), rampMs);
}

function fadeIn(soundId: string, ms: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const chain = chains.get(soundId);
  if (!chain) return;
  scheduleGain(chain.soundGain.gain, ctx, chain.volume * chain.trim * chain.effectGain, ms);
}

function fadeOut(soundId: string, ms: number): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return Promise.resolve();
  const chain = chains.get(soundId);
  if (!chain) return Promise.resolve();
  scheduleGain(chain.soundGain.gain, ctx, 0, ms);
  return waitMs(ms);
}

function duck(attackMs = DEFAULT_DUCK_ATTACK_MS, depth = DEFAULT_DUCK_DEPTH): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const busGraph = ensureGraph(ctx);
  const clampedDepth = clamp01(depth);

  if (!preDuckGains) {
    preDuckGains = {};
    for (const bus of DUCKED_BUSES) preDuckGains[bus] = busGraph.buses[bus].gain.value;
  }

  for (const bus of DUCKED_BUSES) {
    const base = preDuckGains[bus] ?? busGraph.buses[bus].gain.value;
    scheduleGain(busGraph.buses[bus].gain, ctx, base * clampedDepth, attackMs);
  }
}

function unduck(releaseMs = DEFAULT_DUCK_RELEASE_MS): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const busGraph = ensureGraph(ctx);
  if (!preDuckGains) return; // nothing to restore

  for (const bus of DUCKED_BUSES) {
    const base = preDuckGains[bus];
    if (base !== undefined) scheduleGain(busGraph.buses[bus].gain, ctx, base, releaseMs);
  }
  preDuckGains = null;
}

/**
 * Point the shared convolver at a tail of the requested length.
 *
 * One convolver serves the whole page, so the last preset to ask wins. In
 * practice presets that actually send meaningfully (cave, sewer, distant) are
 * spaces the party is *in*, and you are only in one space at a time.
 */
function setReverbDecay(ctx: AudioContext, busGraph: BusGraph, seconds: number): void {
  const wanted = getImpulseResponse(ctx, seconds);
  if (busGraph.convolver.buffer !== wanted) busGraph.convolver.buffer = wanted;
}

function setEffect(soundId: string, preset: AudioEffectPreset, rampMs = EFFECT_RAMP_MS_DEFAULT): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const chain = chains.get(soundId);
  if (!chain) return;
  const busGraph = ensureGraph(ctx);

  const target = preset === "none" ? OPEN_FILTER : EFFECT_PARAMS[preset];

  scheduleLinear(chain.filter.frequency, ctx, target.frequency, rampMs);
  scheduleLinear(chain.filter.Q, ctx, target.Q, rampMs);

  chain.effectGain = target.gain;
  scheduleLinear(chain.soundGain.gain, ctx, chain.volume * chain.trim * chain.effectGain, rampMs);

  if (target.send > 0) setReverbDecay(ctx, busGraph, target.decay);
  scheduleGain(chain.reverbSend.gain, ctx, target.send, rampMs);
}

function setBusEffect(bus: AudioBus, preset: AudioEffectPreset, rampMs = EFFECT_RAMP_MS_DEFAULT): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const busGraph = ensureGraph(ctx);
  const target = preset === "none" ? OPEN_FILTER : EFFECT_PARAMS[preset];

  scheduleLinear(busGraph.busFilters[bus].frequency, ctx, target.frequency, rampMs);
  scheduleLinear(busGraph.busFilters[bus].Q, ctx, target.Q, rampMs);
}

function setMasterEffect(preset: AudioEffectPreset, rampMs = EFFECT_RAMP_MS_DEFAULT): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const busGraph = ensureGraph(ctx);
  const target = preset === "none" ? OPEN_FILTER : EFFECT_PARAMS[preset];

  scheduleLinear(busGraph.masterFilter.frequency, ctx, target.frequency, rampMs);
  scheduleLinear(busGraph.masterFilter.Q, ctx, target.Q, rampMs);

  // Master reverb is what makes "we are all in a cave now" land: the whole mix
  // picks up the space, not just whichever track had an effect selected.
  if (target.send > 0) setReverbDecay(ctx, busGraph, target.decay);
  scheduleGain(busGraph.masterSend.gain, ctx, target.send, rampMs);
}

function setPan(soundId: string, pan: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const chain = chains.get(soundId);
  if (!chain || !chain.panner) return;
  const clamped = Math.max(-1, Math.min(1, pan));
  chain.panner.pan.cancelScheduledValues(ctx.currentTime);
  chain.panner.pan.setValueAtTime(clamped, ctx.currentTime);
}

function resume(): void {
  resumeExistingAudioContext();
}

let engineSingleton: AudioEngine | null = null;

/** The one bus-graph engine for the page. Every method is a safe no-op when Web Audio is unavailable. */
export function getAudioEngine(): AudioEngine {
  if (!engineSingleton) {
    engineSingleton = {
      get available() {
        return getAudioContext() !== null;
      },
      attach,
      detach,
      setSoundVolume,
      setSoundTrim,
      setBusVolume,
      setMasterVolume,
      fadeIn,
      fadeOut,
      duck,
      unduck,
      setEffect,
      setBusEffect,
      setMasterEffect,
      setPan,
      resume,
    };
  }
  return engineSingleton;
}
