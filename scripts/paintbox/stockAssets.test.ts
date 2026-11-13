import { describe, expect, it } from "vitest";
import { alphaFromLuminance, makeSeamless, markBounds, normalise, removeTone, resizeTile, seamMargin } from "./stockAssets";

describe("stockAssets", () => {
  it("paper white is no paint and black is full paint", () => {
    // Fails on: the off-white paper (about 245) counting as faint paint over the whole tip.
    expect(alphaFromLuminance(245)).toBe(0);
    expect(alphaFromLuminance(255)).toBe(0);
    expect(alphaFromLuminance(0)).toBe(255);
  });

  it("bounds hug the mark with a margin, clamped to the image", () => {
    // Fails on: a crop that cuts the mark or runs off the image.
    const a = new Uint8Array(10 * 10);
    a[5 * 10 + 5] = 255;
    expect(markBounds(a, 10, 10, 8, 2)).toEqual({ left: 3, top: 3, width: 5, height: 5 });
    a[0] = 255;
    expect(markBounds(a, 10, 10, 8, 2)).toEqual({ left: 0, top: 0, width: 8, height: 8 });
    expect(markBounds(new Uint8Array(100), 10, 10)).toBeNull();
  });

  const noiseRamp = (n: number): Float32Array => {
    const src = new Float32Array(n * n);
    let seed = 7;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        // Noise on a ramp in both directions, so the source's own wrap edges jump by 60.
        src[y * n + x] = (seed / 4294967296) * 20 + 60 * (y / n) + 60 * (x / n);
      }
    }
    return src;
  };

  it("a seamless tile has no step along either seam row or column", () => {
    // Fails on: a wrap seam, or the shifted copy's own seam showing as a line.
    const n = 128;
    const out = makeSeamless(noiseRamp(n), n);
    const w = n - seamMargin(n);
    let worstRow = 0;
    let worstCol = 0;
    for (let i = 0; i < w; i++) {
      let r0 = 0;
      let r1 = 0;
      let c0 = 0;
      let c1 = 0;
      for (let k = 0; k < w; k++) {
        r0 += out[i * w + k];
        r1 += out[((i + 1) % w) * w + k];
        c0 += out[k * w + i];
        c1 += out[k * w + ((i + 1) % w)];
      }
      worstRow = Math.max(worstRow, Math.abs(r1 - r0) / w);
      worstCol = Math.max(worstCol, Math.abs(c1 - c0) / w);
    }
    expect(worstRow).toBeLessThan(6);
    expect(worstCol).toBeLessThan(6);
  });

  it("a seamless tile does not repeat itself at half a tile", () => {
    // Fails on: a half-shift cross-fade, which makes the tile a grid of copies of itself.
    const n = 128;
    const noise = new Float32Array(n * n);
    let seed = 11;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      noise[i] = (seed / 4294967296) * 100;
    }
    const out = makeSeamless(noise, n);
    const w = Math.round(Math.sqrt(out.length));
    const correlation = (dx: number, dy: number): number => {
      let mean = 0;
      for (const v of out) mean += v;
      mean /= out.length;
      let num = 0;
      let den = 0;
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const a = out[y * w + x] - mean;
          num += a * (out[((y + dy) % w) * w + ((x + dx) % w)] - mean);
          den += a * a;
        }
      }
      return num / den;
    };
    // Noise matches itself only at no shift. A half-shift cross-fade makes the half-tile shift match almost fully.
    expect(correlation(w >> 1, w >> 1)).toBeLessThan(0.3);
    expect(correlation(13, 29)).toBeLessThan(0.3);
  });

  it("normalise stretches to the full range", () => {
    // Fails on: a low-contrast grain that barely bites.
    const out = normalise(Float32Array.from([10, 20, 30]));
    expect([out[0], out[2]]).toEqual([0, 255]);
  });

  it("tone removal keeps the fine tooth and drops the large-scale tone", () => {
    // Fails on: dropping the wide blur, so stains and mottling become tooth and the tooth is swamped.
    const n = 64;
    const src = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) src[y * n + x] = 100 * Math.sin((2 * Math.PI * x) / n) + ((x + y) % 2) * 20;
    }
    const out = removeTone(src, n, 8);
    let hi = 0;
    let lo = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if ((x + y) % 2) hi += out[y * n + x];
      else lo += out[y * n + x];
    }
    // The tooth (a checker) separates the two halves widely; the tone alone would leave them equal.
    expect((hi - lo) / (n * n / 2)).toBeGreaterThan(40);
  });

  it("resizing a tile wraps at the edges and keeps a flat tile flat", () => {
    // Fails on: a clamped resize, which draws a line where the tile meets itself.
    const flat = resizeTile(new Float32Array(16).fill(100), 4, 8);
    expect(Math.max(...flat.map((v) => Math.abs(v - 100)))).toBeLessThan(1e-3);
    // The first column leans towards the last one (30), which sits just left of it when wrapped; clamped, it would stay near 0.
    const ramp = Float32Array.from({ length: 16 }, (_, i) => (i % 4) * 10);
    const big = resizeTile(ramp, 4, 8);
    expect(big[0]).toBeGreaterThan(5);
  });
});
