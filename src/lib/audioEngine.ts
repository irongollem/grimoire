// Web Audio bus-graph engine for the soundboard.
//
// Replaces the "every sound builds its own private chain straight to
// destination" approach with a proper bus graph:
//
//   MediaElementAudioSource → BiquadFilter → soundGain → busGain → masterGain → destination
//
// This gives us a master volume fader, per-bus (music/ambient/effects)
// volume, and ducking (attenuate music+ambient while an effect one-shot
// plays) — none of which are possible when every sound routes straight to
// ctx.destination.
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

import { getAudioContext } from "@/lib/audioContext";
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
  /** Apply (or clear, via "none") a lowpass-filter preset to a sound. */
  setEffect(soundId: string, preset: AudioEffectPreset, rampMs?: number): void;
  /** Resume a suspended AudioContext (e.g. after OS/PWA backgrounding). */
  resume(): void;
}

// ── Effect presets (ported from soundboard.ts EFFECT_PARAMS) ──────────────

interface FilterTarget {
  frequency: number; // lowpass cutoff (Hz)
  Q: number;         // resonance
  gain: number;       // linear gain multiplier contributed by the effect — < 1 = quieter
}

const EFFECT_PARAMS: Record<Exclude<AudioEffectPreset, "none">, FilterTarget> = {
  through_door: { frequency: 700,  Q: 1.2, gain: 0.50 }, // wood: muffled, slight resonance
  through_wall: { frequency: 220,  Q: 0.8, gain: 0.25 }, // stone: very muffled, barely there
  distant:      { frequency: 1800, Q: 0.5, gain: 0.35 }, // air: loses sparkle, much quieter
  underwater:   { frequency: 150,  Q: 3.5, gain: 0.40 }, // water: heavy, resonant
  cave:         { frequency: 900,  Q: 2.5, gain: 0.65 }, // stone: hollow, resonant, highs cut
  sewer:        { frequency: 500,  Q: 2.2, gain: 0.55 }, // wet stone tunnel: more muffled, resonant
};

// Fully open — passes all frequencies, no gain reduction. Matches EFFECT_RAMP_S's
// "none" target in the old store.
const OPEN_FILTER: FilterTarget = { frequency: 22000, Q: 0.7071, gain: 1.0 };

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
  buses: Record<AudioBus, GainNode>;
}

let graph: BusGraph | null = null;

// Remembers each ducked bus's gain from just before duck() ran, so unduck()
// restores exactly (and so a duck() while already ducked doesn't compound).
let preDuckGains: Partial<Record<AudioBus, number>> | null = null;

function ensureGraph(ctx: AudioContext): BusGraph {
  if (graph && graph.ctx === ctx) return graph;

  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  const buses: Record<AudioBus, GainNode> = {
    music: ctx.createGain(),
    ambient: ctx.createGain(),
    effects: ctx.createGain(),
  };
  (Object.keys(buses) as AudioBus[]).forEach((bus) => {
    buses[bus].gain.value = 1;
    buses[bus].connect(master);
  });

  graph = { ctx, master, buses };
  return graph;
}

function teardownChain(chain: SoundChain): void {
  // MediaElementAudioSourceNode is intentionally left connected to nothing but
  // NOT recreated — it stays cached in sourceNodes for a possible re-attach.
  try { chain.source.disconnect(); } catch { /* already disconnected */ }
  try { chain.filter.disconnect(); } catch { /* already disconnected */ }
  try { chain.soundGain.disconnect(); } catch { /* already disconnected */ }
}

function buildChain(ctx: AudioContext, busGraph: BusGraph, soundId: string, el: HTMLAudioElement, bus: AudioBus): void {
  let source = sourceNodes.get(el);
  if (!source) {
    source = ctx.createMediaElementSource(el);
    sourceNodes.set(el, source);
  }

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = OPEN_FILTER.frequency;
  filter.Q.value = OPEN_FILTER.Q;

  const soundGain = ctx.createGain();
  soundGain.gain.value = 1; // transparent until setSoundVolume/setSoundTrim/setEffect say otherwise

  source.connect(filter);
  filter.connect(soundGain);
  soundGain.connect(busGraph.buses[bus]);

  chains.set(soundId, { el, source, filter, soundGain, bus, volume: 1, trim: 1, effectGain: 1 });
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
        existing.soundGain.connect(busGraph.buses[bus]);
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

function setEffect(soundId: string, preset: AudioEffectPreset, rampMs = EFFECT_RAMP_MS_DEFAULT): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const chain = chains.get(soundId);
  if (!chain) return;

  const target = preset === "none" ? OPEN_FILTER : EFFECT_PARAMS[preset];

  scheduleLinear(chain.filter.frequency, ctx, target.frequency, rampMs);
  scheduleLinear(chain.filter.Q, ctx, target.Q, rampMs);

  chain.effectGain = target.gain;
  scheduleLinear(chain.soundGain.gain, ctx, chain.volume * chain.trim * chain.effectGain, rampMs);
}

function resume(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
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
      resume,
    };
  }
  return engineSingleton;
}
