import { describe, expect, it } from "vitest";
import { encodeWav, trimSilence } from "./wav";

const RATE = 1000;

/** `ms` of a square wave at `amp`, which is exactly `amp` RMS. */
function tone(ms: number, amp = 8000): Int16Array {
  const out = new Int16Array((RATE * ms) / 1000);
  for (let i = 0; i < out.length; i++) out[i] = i % 2 ? amp : -amp;
  return out;
}
function quiet(ms: number, amp = 0): Int16Array {
  return new Int16Array((RATE * ms) / 1000).fill(amp);
}
function join(...parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

describe("trimSilence", () => {
  it("cuts a long silent lead and tail down to the words plus the pad", () => {
    const out = trimSilence(join(quiet(1000), tone(500), quiet(1000)), RATE, { padMs: 100 });
    expect(out.length).toBe(100 + 500 + 100);
  });

  it("keeps a pad before the first word so its consonant is not clipped", () => {
    const out = trimSilence(join(quiet(1000), tone(500), quiet(1000)), RATE, { padMs: 100 });
    expect(Array.from(out.slice(0, 100)).every((s) => s === 0)).toBe(true);
    expect(out[100]).not.toBe(0);
  });

  it("does not run the pad past the ends of a take that starts on the word", () => {
    const out = trimSilence(join(tone(500), quiet(1000)), RATE, { padMs: 200 });
    expect(out.length).toBe(500 + 200);
  });

  it("keeps a take with only room noise whole, so the speaker hears the problem", () => {
    const noise = quiet(2000, 5); // about -76 dBFS
    expect(trimSilence(noise, RATE).length).toBe(noise.length);
  });

  it("keeps quiet words that sit above the threshold", () => {
    const whisper = tone(300, 400); // about -38 dBFS
    const out = trimSilence(join(quiet(500), whisper, quiet(500)), RATE, { padMs: 0 });
    expect(out.length).toBe(300);
  });
});

describe("encodeWav", () => {
  const samples = new Int16Array([0, 1000, -1000, 32767, -32768]);
  const wav = encodeWav(samples, 48000);
  const view = new DataView(wav.buffer);

  it("the data chunk length matches the samples, or players stop early", () => {
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(wav.length).toBe(44 + samples.length * 2);
  });

  it("the RIFF size covers everything after its own field, or players reject the file", () => {
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
  });

  it("states the real sample rate, or the take plays at the wrong pitch and speed", () => {
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(96000);
  });

  it("declares 16-bit mono PCM", () => {
    expect([view.getUint16(20, true), view.getUint16(22, true), view.getUint16(34, true)]).toEqual([1, 1, 16]);
  });

  it("stores samples little-endian and signed", () => {
    expect(view.getInt16(44 + 2 * 2, true)).toBe(-1000);
    expect(view.getInt16(44 + 4 * 2, true)).toBe(-32768);
  });
});
