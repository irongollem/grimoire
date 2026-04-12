// Synthesized dice sounds via Web Audio API — no audio files needed.
import { getAudioContext, primeAudioContext } from "@/lib/audioContext";

export { primeAudioContext as primeDiceAudio };

// ── Sound preferences ───────────────────────────────────────────────────────

const PREF_KEY = "grimoire_dice_sounds";

export function getDiceAudioEnabled(): boolean {
  return localStorage.getItem(PREF_KEY) !== "false"; // default on
}

export function setDiceAudioEnabled(enabled: boolean): void {
  localStorage.setItem(PREF_KEY, String(enabled));
}

// ── Synthesis helpers ────────────────────────────────────────────────────────

// Noise buffers cached by duration key to avoid re-filling on every roll.
const _noiseCache = new Map<number, AudioBuffer>();

function getNoiseBuf(ctx: AudioContext, durationSec: number): AudioBuffer {
  const key = Math.round(durationSec * 1000);
  let buf = _noiseCache.get(key);
  if (!buf) {
    const bufLen = Math.ceil(ctx.sampleRate * durationSec);
    buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    _noiseCache.set(key, buf);
  }
  return buf;
}

function playNoiseBurst(ctx: AudioContext, t: number, durationSec: number, gain: number): void {
  const buf = getNoiseBuf(ctx, durationSec);

  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Band-pass centred at ~3 kHz to approximate the click of dice
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3000;
  bp.Q.value = 1.2;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + durationSec);

  src.connect(bp);
  bp.connect(g);
  g.connect(ctx.destination);
  src.start(t);
  src.stop(t + durationSec);
}

function playTone(
  ctx: AudioContext,
  t: number,
  freq: number,
  durationSec: number,
  gain: number,
  type: OscillatorType = "sine",
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + durationSec);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + durationSec);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Play a dice-roll sound effect.
 *
 * Normal roll  — brief clack (noise burst + low knock)
 * Nat 20 (crit) — ascending chime arpeggio (C5–E5–G5) + shimmer
 * Nat 1 (fumble) — low thud + descending dissonant fall
 */
export function playDiceRollSound(isCrit: boolean, isFumble: boolean): void {
  if (!getDiceAudioEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;

  const t = ctx.currentTime;

  if (isCrit) {
    // Ascending arpeggio: C5-E5-G5 + shimmer noise
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      playTone(ctx, t + i * 0.1, freq, 0.5, 0.22, "sine");
    });
    // Shimmer: high-pitched noise
    playNoiseBurst(ctx, t + 0.05, 0.25, 0.08);
    // Soft low knock
    playTone(ctx, t, 120, 0.15, 0.18, "sine");
  } else if (isFumble) {
    // Low thud + descending groan
    playTone(ctx, t, 100, 0.3, 0.3, "triangle");
    playNoiseBurst(ctx, t, 0.15, 0.12);
    // Descending: 220 → 80 Hz
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.5);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  } else {
    // Normal: quick noise burst + knock
    playNoiseBurst(ctx, t, 0.12, 0.18);
    playTone(ctx, t, 160, 0.1, 0.12, "triangle");
  }
}
