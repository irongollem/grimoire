// Singleton — browsers cap concurrent AudioContext instances.

let _ctx: AudioContext | null = null;
let _autoResumeGate: (() => boolean) | null = null;

// iOS suspends the context on OS interruptions (screen lock power management,
// Siri, a navigation prompt, an audio-route blip) and reports a non-standard
// "interrupted" state while it does. Every HTMLAudioElement is routed through
// the graph, and an element's clock keeps running while the context's output
// is muted — so each unresumed suspension window is HEARD as a dropped chunk
// of audio, the track jumping ahead when output returns. With the screen
// locked (CarPlay in the pocket), visibilitychange never fires, making this
// statechange hook the ONLY resume path. Gated on "is anything audible?" so
// an idle page never holds the OS audio session open by resuming a context
// nobody is listening to.
function handleStateChange(): void {
  if (!_ctx) return;
  const state = _ctx.state as AudioContextState | "interrupted";
  if (state === "running" || state === "closed") return;
  if (_autoResumeGate?.()) void _ctx.resume().catch(() => {});
}

export function getAudioContext(): AudioContext | null {
  if (_ctx) return _ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    _ctx = new Ctor();
  } catch {
    return null;
  }
  _ctx.addEventListener("statechange", handleStateChange);
  return _ctx;
}

/** Register the "is anything audible?" predicate consulted by the auto-resume above. */
export function setAutoResumeGate(gate: () => boolean): void {
  _autoResumeGate = gate;
}

export function primeAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") void ctx.resume();
}

/** Resume after an interruption without creating audio during page navigation. */
export function resumeExistingAudioContext(): void {
  if (_ctx?.state === "suspended") void _ctx.resume();
}
