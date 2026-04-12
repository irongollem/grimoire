// Singleton — browsers cap concurrent AudioContext instances.

let _ctx: AudioContext | null = null;

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
  return _ctx;
}

export function primeAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") void ctx.resume();
}
