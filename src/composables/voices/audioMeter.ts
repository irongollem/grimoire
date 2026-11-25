// How loud a playing clip is, many times a second, so Ooru's beak can open on syllables and close in pauses
// (maintainer, 25 Nov 2026). Shared by the two players that speak as Ooru: replies (`useClipQueue`) and the greeting
// (`useAudioToggle`).
//
// Routing an <audio> through Web Audio sends its sound only through the graph. If the graph's context is not running
// (iOS before a tap, a page that never had a gesture), the clip would go silent. So a clip is metered only once the
// context is known to be running; otherwise it plays as it always did and nobody gets a level (the avatar then falls
// back to its loop). `primeAudioMeter` is called from a click, where a browser lets the context start.

type Ctor = typeof AudioContext;

let context: AudioContext | null = null;
const routed = new WeakSet<HTMLMediaElement>();

function contextCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Starts (or wakes) the shared audio context. Call it from a click: that is when a browser allows it. */
export function primeAudioMeter(): void {
  const Make = contextCtor();
  if (Make === null) return;
  try {
    context ??= new Make();
    if (context.state !== "running") void context.resume().catch(() => undefined);
  } catch {
    context = null;
  }
}

/** How long a just-pressed context may take to start before a clip plays unmeasured. */
const WAKE_MS = 300;

/**
 * Meters a playing clip: `onLevel` hears its loudness (0 to about 1, smoothed: quick to open, slower to close) on every
 * animation frame until the clip ends or the returned stop is called, which also hands 0. Answers null, and leaves the
 * clip as it is, when Web Audio is missing or the context is not running. A context made by the press that started
 * the clip is still starting for a moment (seen in the dev catalogue: a cached clip played before it ran), so it is
 * given `WAKE_MS` to start before the clip is left unmeasured.
 */
export async function meterAudio(el: HTMLMediaElement, onLevel: (level: number) => void): Promise<(() => void) | null> {
  if (context === null || routed.has(el)) return null;
  if (context.state !== "running") {
    const ctx = context;
    await Promise.race([ctx.resume().catch(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, WAKE_MS))]);
    if (ctx.state !== "running" || routed.has(el)) return null;
  }
  let analyser: AnalyserNode;
  try {
    const source = context.createMediaElementSource(el);
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyser.connect(context.destination);
    routed.add(el);
  } catch {
    return null;
  }
  const samples = new Float32Array(analyser.fftSize);
  let level = 0;
  let frame = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const rms = Math.sqrt(sum / samples.length);
    level = smoothLevel(level, rms);
    onLevel(level);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    onLevel(0);
  };
  el.addEventListener("ended", stop, { once: true });
  el.addEventListener("pause", stop, { once: true });
  return stop;
}

/** Quick to rise and slower to fall, so a beak opens on a syllable at once and does not flutter shut inside a word. */
export function smoothLevel(previous: number, next: number): number {
  return next > previous ? previous + (next - previous) * 0.6 : previous + (next - previous) * 0.25;
}

export type Beak = "closed" | "half" | "open";

/**
 * The beak for a loudness, with a little hysteresis so it does not flicker at a threshold: it opens a step at a
 * higher level than it closes it again. Levels are speech RMS: about 0.02 is room tone, 0.1 and up a spoken syllable.
 */
export function beakFor(level: number, previous: Beak): Beak {
  const opensHalf = previous === "closed" ? 0.035 : 0.025;
  const opensFull = previous === "open" ? 0.09 : 0.12;
  if (level >= opensFull) return "open";
  if (level >= opensHalf) return "half";
  return "closed";
}
