// Direct-output mode: playback that never touches the Web Audio graph.
//
// WHY THIS EXISTS
//
// WebKit bug 221334 — "Audio passed through WebAudio is delayed and glitchy on
// Safari" (https://bugs.webkit.org/show_bug.cgi?id=221334) — is open and
// unresolved. The fault is in `AudioSourceProviderAVFObjC::process()`, the
// bridge that feeds an <audio> element into a Web Audio graph: its write-ahead
// buffer is sized once, on the paused→playing transition, and never
// re-adjusted afterwards. Play on the built-in speaker and it is sized right;
// the same stream over a high-latency wireless route (CarPlay, Bluetooth
// headsets) underruns continuously and drops out every couple of seconds.
//
// It is route-dependent, so it cannot be detected from JS — the web has no way
// to ask what the current output device is. And it cannot be tuned around
// either: latencyHint (0/15/100 ms) and ScriptProcessor buffer sizes from 256
// up to 16K were all tried in the wild with no improvement.
//
// The only thing that works is to not use that code path. So this module
// mirrors the engine's volume/fade/duck surface while driving
// `HTMLAudioElement.volume` directly, leaving the element on the platform's own
// media pipeline where the bug does not live.
//
// WHAT IT COSTS
//
// On iOS, `volume` is not settable at all — Apple: "the audio level is always
// under the user's physical control. The volume property is not settable in
// JavaScript. Reading the volume property always returns 1." So on an iPhone
// this mode gives up every fader, fade, crossfade and duck; the device's own
// volume control is the only one left. Elsewhere (desktop, Android) `volume`
// works and only the graph-only features — filters, reverb, stereo pan — are
// lost.
//
// That is why this is an explicit opt-in and not a silent iOS default: it is
// the right trade for a music playlist over CarPlay and the wrong one for a
// DM running atmosphere at the table.

import type { AudioBus } from "@/lib/audioEngine";

/** How often a JS volume ramp steps. Fine enough to be inaudible, coarse enough to be cheap. */
const RAMP_INTERVAL_MS = 25;

interface DirectChain {
  el: HTMLAudioElement;
  bus: AudioBus;
  /** 0–1 user volume, last value passed to setSoundVolume. */
  volume: number;
  /** Linear loudness-normalisation multiplier, last value passed to setSoundTrim. */
  trim: number;
  /** Handle of an in-flight ramp, so a new one can cancel it. */
  timer: ReturnType<typeof setInterval> | null;
}

const chains = new Map<string, DirectChain>();

// The graph's gain nodes have no counterpart here, so bus and master levels
// live as plain numbers and fold into each element's own volume instead.
const busVolumes: Record<AudioBus, number> = { music: 1, ambient: 1, effects: 1 };
let masterVolume = 1;

/** Mirrors the engine's duck bookkeeping: remembers pre-duck levels so unduck restores exactly. */
let preDuckGains: Partial<Record<AudioBus, number>> | null = null;
const DUCKED_BUSES: readonly AudioBus[] = ["music", "ambient"];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ── Platform probe ──────────────────────────────────────────────────────────

let volumeSettable: boolean | null = null;

/**
 * Whether this platform honours writes to `HTMLAudioElement.volume`.
 *
 * Probed rather than sniffed from the user agent: the question is precisely
 * "does assigning volume do anything", and that is directly answerable. iOS
 * accepts the assignment silently and keeps reporting 1.
 *
 * The UI needs this to stay honest — a master fader that moves and changes
 * nothing is worse than one that is visibly unavailable.
 */
export function isVolumeSettable(): boolean {
  if (volumeSettable !== null) return volumeSettable;
  try {
    const probe = new Audio();
    probe.volume = 0.5;
    volumeSettable = Math.abs(probe.volume - 0.5) < 0.01;
  } catch {
    volumeSettable = false;
  }
  return volumeSettable;
}

// ── Level application ───────────────────────────────────────────────────────

/** The level this chain should be sitting at right now, with bus and master folded in. */
function targetLevel(chain: DirectChain): number {
  return clamp01(chain.volume * chain.trim * busVolumes[chain.bus] * masterVolume);
}

function cancelRamp(chain: DirectChain): void {
  if (chain.timer === null) return;
  clearInterval(chain.timer);
  chain.timer = null;
}

/**
 * Move a chain to `target` over `rampMs`, cancelling any ramp already running.
 *
 * Linear in amplitude rather than perceptual, unlike the engine's exponential
 * gain ramps. A setInterval stepping an element's volume is already the coarse
 * option; the extra maths would not survive the step size.
 */
function ramp(chain: DirectChain, target: number, rampMs: number): Promise<void> {
  cancelRamp(chain);

  // Nothing to ramp — the assignment is ignored by the platform, so land on the
  // value and let callers carry on immediately rather than waiting out a fade
  // that will never be audible.
  if (!isVolumeSettable() || rampMs <= 0) {
    chain.el.volume = target;
    return Promise.resolve();
  }

  const from = chain.el.volume;
  const delta = target - from;
  if (delta === 0) return Promise.resolve();

  const started = performance.now();
  return new Promise((resolve) => {
    chain.timer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / rampMs);
      chain.el.volume = clamp01(from + delta * progress);
      if (progress >= 1) {
        cancelRamp(chain);
        resolve();
      }
    }, RAMP_INTERVAL_MS);
  });
}

/** Re-apply the current target to every chain on `bus` — used after a bus/master change. */
function reapply(rampMs: number, bus?: AudioBus): void {
  chains.forEach((chain) => {
    if (bus !== undefined && chain.bus !== bus) return;
    void ramp(chain, targetLevel(chain), rampMs);
  });
}

// ── Public surface (mirrors the engine's) ───────────────────────────────────

export function attach(soundId: string, el: HTMLAudioElement, bus: AudioBus): void {
  const existing = chains.get(soundId);
  if (existing && existing.el === el) {
    existing.bus = bus;
    return;
  }
  if (existing) cancelRamp(existing);
  chains.set(soundId, { el, bus, volume: 1, trim: 1, timer: null });
}

export function detach(soundId: string): void {
  const chain = chains.get(soundId);
  if (!chain) return;
  cancelRamp(chain);
  chains.delete(soundId);
}

export function setSoundVolume(soundId: string, volume: number, rampMs = 0): void {
  const chain = chains.get(soundId);
  if (!chain) return;
  chain.volume = clamp01(volume);
  void ramp(chain, targetLevel(chain), rampMs);
}

export function setSoundTrim(soundId: string, trim: number): void {
  const chain = chains.get(soundId);
  if (!chain) return;
  chain.trim = Math.max(0, trim);
  void ramp(chain, targetLevel(chain), 0);
}

export function setBusVolume(bus: AudioBus, volume: number, rampMs = 0): void {
  busVolumes[bus] = clamp01(volume);
  reapply(rampMs, bus);
}

export function setMasterVolume(volume: number, rampMs = 0): void {
  masterVolume = clamp01(volume);
  reapply(rampMs);
}

export function fadeIn(soundId: string, ms: number): void {
  const chain = chains.get(soundId);
  if (!chain) return;
  // Start from silence so the ramp has somewhere to come from, exactly as the
  // graph's fadeIn does by ramping its gain node up from its current value.
  if (isVolumeSettable()) chain.el.volume = 0;
  void ramp(chain, targetLevel(chain), ms);
}

export function fadeOut(soundId: string, ms: number): Promise<void> {
  const chain = chains.get(soundId);
  if (!chain) return Promise.resolve();
  // Resolves immediately where volume is not settable, which matters more than
  // it looks: the caller pauses the element once this settles, and waiting out
  // a silent 1.5s "crossfade" would leave both tracks audible at full level
  // over each other. Resolving now turns it into a clean cut instead.
  return ramp(chain, 0, ms);
}

export function duck(attackMs: number, depth: number): void {
  if (!preDuckGains) {
    preDuckGains = {};
    for (const bus of DUCKED_BUSES) preDuckGains[bus] = busVolumes[bus];
  }
  for (const bus of DUCKED_BUSES) {
    const base = preDuckGains[bus] ?? busVolumes[bus];
    busVolumes[bus] = clamp01(base * clamp01(depth));
    reapply(attackMs, bus);
  }
}

export function unduck(releaseMs: number): void {
  if (!preDuckGains) return;
  for (const bus of DUCKED_BUSES) {
    const base = preDuckGains[bus];
    if (base === undefined) continue;
    busVolumes[bus] = base;
    reapply(releaseMs, bus);
  }
  preDuckGains = null;
}

/** Drop every chain and cancel every ramp — used when switching output mode. */
export function reset(): void {
  chains.forEach(cancelRamp);
  chains.clear();
  preDuckGains = null;
}
