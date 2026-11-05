// Singleton — browsers cap concurrent AudioContext instances.

let _ctx: AudioContext | null = null;
let _autoResumeGate: (() => boolean) | null = null;

// iOS suspends the context on OS interruptions (screen lock power management,
// Siri, a navigation prompt, an audio-route blip) and reports a non-standard
// "interrupted" state while it does. Every HTMLAudioElement is routed through
// the graph, and an element's clock keeps running while the context's output
// is muted, so an unresumed suspension is HEARD as a dropped chunk of audio.
// With the screen locked (CarPlay in the pocket), visibilitychange never fires,
// so this statechange hook is the only resume path. Gated on "is anything
// audible?" so an idle page never holds the OS audio session open.
//
// Two limits keep it from fighting the OS, which is what broke CarPlay: every
// resume re-activates the audio session, CarPlay and Bluetooth renegotiate
// the link on each activation, and the renegotiation interrupts the context
// again. Resuming on every statechange turned that into a loop heard as the
// car reconnecting every couple of seconds, which kept going while the page
// lived in the background and so broke the next app's audio too.
//
// - "interrupted" is left alone. The OS holds the session; WebKit returns the
//   context to running (or to "suspended") itself when the interruption ends.
// - A context suspended again soon after an automatic resume is the OS taking
//   it back, so the hook stops until something explicit resumes it (a tap, or
//   the page becoming visible).
const REPEAT_SUSPENSION_MS = 10_000;
let _lastAutoResumeAt: number | null = null;
let _autoResumeHalted = false;

function handleStateChange(): void {
  if (!_ctx) return;
  if (_ctx.state !== "suspended") return;
  if (_autoResumeHalted || !_autoResumeGate?.()) return;
  const now = Date.now();
  if (_lastAutoResumeAt !== null && now - _lastAutoResumeAt < REPEAT_SUSPENSION_MS) {
    _autoResumeHalted = true;
    return;
  }
  _lastAutoResumeAt = now;
  void _ctx.resume().catch(() => {});
}

/** An explicit resume (a gesture, the page coming back) re-arms the automatic one. */
function rearmAutoResume(): void {
  _autoResumeHalted = false;
  _lastAutoResumeAt = null;
}

/** A tap or key press is the user's say-so: re-arm, and bring back a context that should be heard. */
function handleGesture(): void {
  rearmAutoResume();
  if (_ctx?.state === "suspended" && _autoResumeGate?.()) void _ctx.resume().catch(() => {});
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
  window.addEventListener("pointerdown", handleGesture, { passive: true });
  window.addEventListener("keydown", handleGesture, { passive: true });
  return _ctx;
}

/** Register the "is anything audible?" predicate consulted by the auto-resume above. */
export function setAutoResumeGate(gate: () => boolean): void {
  _autoResumeGate = gate;
}

export function primeAudioContext(): void {
  const ctx = getAudioContext();
  rearmAutoResume();
  if (ctx?.state === "suspended") void ctx.resume();
}

/** Resume after an interruption without creating audio during page navigation. */
export function resumeExistingAudioContext(): void {
  rearmAutoResume();
  if (_ctx?.state === "suspended") void _ctx.resume();
}
