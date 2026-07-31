import { onMounted, onUnmounted } from "vue";
import { getAudioContext, primeAudioContext } from "@/lib/audio/audioContext";

export function useTurnChime() {
  onMounted(() => {
    window.addEventListener("pointerdown", primeAudioContext, { passive: true });
    window.addEventListener("keydown", primeAudioContext, { passive: true });
  });
  onUnmounted(() => {
    window.removeEventListener("pointerdown", primeAudioContext);
    window.removeEventListener("keydown", primeAudioContext);
  });

  function playTurnChime() {
    const ctx = getAudioContext();
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
