// Element registry and transition bookkeeping for the soundboard.
//
// Split out of `stores/soundboard.ts`, which owns Pinia state and orchestration
// while this module owns the non-reactive plumbing underneath it:
//
//   - the HTMLAudioElement instances themselves
//   - which sounds currently hold the effects-bus duck
//   - the generation counter that keeps a stale fade-out from stopping a sound
//     that has already restarted
//   - category → bus mapping
//
// None of this can live in reactive state: Vue's Proxy wrapper breaks the
// browser audio pipeline (volume/loop mutations silently dropped, play() calls
// failing unpredictably), so the elements stay in a plain Map at module scope.

import type { SoundCategory } from "@/types/sound.types";
import type { AudioBus } from "@/lib/audio/audioEngine";

const audioInstances = new Map<string, HTMLAudioElement>();

/** Sound IDs already retried once after a load error. Freesound CDN 502s are usually transient. */
const retriedIds = new Set<string>();

/**
 * Sound IDs currently holding the effects-bus duck. Set membership IS the
 * refcount, so overlapping one-shots don't un-duck each other prematurely and
 * a double-release is a no-op.
 */
const duckingSounds = new Set<string>();

/**
 * Bumped whenever a sound starts a fade-out. A fade-out completion callback
 * only acts if its generation is still current — otherwise a stop() quickly
 * followed by a play() would let the stale callback pause the freshly started
 * element. This is the race that makes naive crossfading eat tracks.
 */
const transitionGen = new Map<string, number>();

export function getInstance(soundId: string): HTMLAudioElement | undefined {
  return audioInstances.get(soundId);
}

export function setInstance(soundId: string, el: HTMLAudioElement): void {
  audioInstances.set(soundId, el);
}

export function forEachInstance(
  fn: (el: HTMLAudioElement, soundId: string) => void,
): void {
  audioInstances.forEach(fn);
}

export function makeAudio(fileUrl: string): HTMLAudioElement {
  const audio = new Audio();
  // crossOrigin must be set BEFORE src so the browser fetches with CORS headers.
  // Required for the Web Audio API (MediaElementAudioSourceNode) to read audio
  // data from cross-origin URLs (Supabase Storage, Freesound CDN, etc.).
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  audio.src = fileUrl;
  return audio;
}

export function destroyAudio(soundId: string): void {
  const el = audioInstances.get(soundId);
  if (!el) return;
  el.pause();
  el.src = "";
  audioInstances.delete(soundId);
}

// ── Retry bookkeeping ──────────────────────────────────────────────────────

export function hasRetried(soundId: string): boolean {
  return retriedIds.has(soundId);
}

export function markRetried(soundId: string): void {
  retriedIds.add(soundId);
}

export function clearRetried(soundId: string): void {
  retriedIds.delete(soundId);
}

// ── Duck refcounting ───────────────────────────────────────────────────────

/** Returns true when this acquisition took the count from 0 to 1, i.e. the caller should duck. */
export function acquireDuck(soundId: string): boolean {
  if (duckingSounds.has(soundId)) return false;
  duckingSounds.add(soundId);
  return duckingSounds.size === 1;
}

/** Returns true when this release emptied the set, i.e. the caller should un-duck. */
export function releaseDuck(soundId: string): boolean {
  if (!duckingSounds.delete(soundId)) return false;
  return duckingSounds.size === 0;
}

export function clearDucking(): void {
  duckingSounds.clear();
}

// ── Transition generations ─────────────────────────────────────────────────

export function bumpGeneration(soundId: string): number {
  const prev = transitionGen.get(soundId);
  const next = (prev === undefined ? 0 : prev) + 1;
  transitionGen.set(soundId, next);
  return next;
}

export function isCurrentGeneration(soundId: string, gen: number): boolean {
  return transitionGen.get(soundId) === gen;
}

export function forgetGeneration(soundId: string): void {
  transitionGen.delete(soundId);
}

// ── Routing ────────────────────────────────────────────────────────────────

/**
 * Which bus a sound is summed through. Only an explicit "effects" category
 * triggers ducking, so an uncategorised sound can never accidentally duck the
 * music bed under itself.
 */
export function busForCategory(category: SoundCategory | undefined): AudioBus {
  if (category === "music") return "music";
  if (category === "effects") return "effects";
  return "ambient";
}

// ── Gapless looping ────────────────────────────────────────────────────────
//
// `audio.loop` is not gapless in any browser: every cycle of an ambience bed
// has an audible click or gap. The fix is to keep a second element for the same
// file and crossfade between them just before the first reaches its end, so the
// seam is covered by an overlap instead of exposed.
//
// Buffer-based looping (AudioBufferSourceNode with loop=true) would be sample
// accurate, but a three-minute stereo bed decodes to roughly 70 MB and ambient
// scenes layer several at once — precisely where gapless matters most.

/** Engine/element key for a looping sound's second element. */
export function loopShadowId(soundId: string): string {
  return `${soundId}::loop`;
}

/** True for the shadow half of a gapless pair, which must stay out of the UI. */
export function isLoopShadowId(id: string): boolean {
  return id.endsWith("::loop");
}
