/*
 * Colour conversions for the colour panel (#1181): hex text, RGB bytes and the hue/saturation/value the
 * square and strip are drawn in. Pure, so a round trip is tested in Node.
 */
import type { Rgb } from "../engine/types";

export interface Hsv {
  /** 0 to 360. */
  h: number;
  /** 0 to 1. */
  s: number;
  /** 0 to 1. */
  v: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const byte = (n: number) => Math.round(clamp(n, 0, 255));

/** `#rrggbb`, lower case. */
export function rgbToHex(c: Rgb): string {
  const h = (n: number) => byte(n).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** Accepts `#abc`, `abc`, `#aabbcc` and `aabbcc`; anything else (wrong length, non-hex) is null, never black. */
export function parseHex(text: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}

export function rgbToHsv(c: Rgb): Hsv {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb(c: Hsv): Rgb {
  const h = (((c.h % 360) + 360) % 360) / 60;
  const s = clamp(c.s, 0, 1);
  const v = clamp(c.v, 0, 1);
  const f = (n: number) => {
    const k = (n + h) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: byte(f(5) * 255), g: byte(f(3) * 255), b: byte(f(1) * 255) };
}

export function sameColour(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}
