import { onMounted, onUnmounted } from "vue";

let _audioCtx: AudioContext | null = null;

function primeAudioCtx() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    if (!_audioCtx) _audioCtx = new Ctor();
    if (_audioCtx.state === "suspended") void _audioCtx.resume();
  } catch { /* unsupported */ }
}

export function useTurnChime() {
  onMounted(() => {
    window.addEventListener("pointerdown", primeAudioCtx, { passive: true });
    window.addEventListener("keydown", primeAudioCtx, { passive: true });
  });
  onUnmounted(() => {
    window.removeEventListener("pointerdown", primeAudioCtx);
    window.removeEventListener("keydown", primeAudioCtx);
  });

  function playTurnChime() {
    const ctx = _audioCtx;
    if (!ctx || ctx.state !== "running") return;
    try {
      // Two-note ascending chime: C5 → G5
      [523.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    } catch { /* silently skip */ }
  }

  return { playTurnChime };
}
