/**
 * The pure audio half of the voice-over recorder (voice.ts): trimming a take
 * and wrapping it as a WAV the assembler can read. No I/O here, so it is
 * testable without a microphone.
 */

export interface TrimOptions {
  /** Windows quieter than this (dBFS, RMS) count as silence. */
  thresholdDb?: number;
  /** Silence kept before the first word and after the last, so consonants are not clipped. */
  padMs?: number;
}

/** Length of the loudness window, in ms: loudness is judged per window, not per sample, so one zero crossing is not silence. */
const WINDOW_MS = 10;

/**
 * Cuts leading and trailing silence, keeping `padMs` of room on each side.
 * A take with no window above the threshold comes back whole: the speaker
 * should hear that the mic was dead, not receive an empty file.
 */
export function trimSilence(samples: Int16Array, rate: number, opts: TrimOptions = {}): Int16Array {
  const { thresholdDb = -45, padMs = 120 } = opts;
  const win = Math.max(1, Math.round((rate * WINDOW_MS) / 1000));
  const limit = 32768 * 10 ** (thresholdDb / 20);
  const limitSq = limit * limit;

  const loud = (start: number): boolean => {
    const end = Math.min(samples.length, start + win);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    return end > start && sum / (end - start) > limitSq;
  };

  let first = -1;
  for (let i = 0; i < samples.length; i += win) {
    if (loud(i)) { first = i; break; }
  }
  if (first === -1) return samples;
  let last = first;
  for (let i = Math.floor((samples.length - 1) / win) * win; i >= first; i -= win) {
    if (loud(i)) { last = Math.min(samples.length, i + win); break; }
  }

  const pad = Math.round((rate * padMs) / 1000);
  return samples.slice(Math.max(0, first - pad), Math.min(samples.length, last + pad));
}

/** PCM 16-bit mono RIFF/WAVE. */
export function encodeWav(samples: Int16Array, rate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const tag = (at: number, s: string) => { for (let i = 0; i < 4; i++) out[at + i] = s.charCodeAt(i); };
  tag(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);
  return out;
}
