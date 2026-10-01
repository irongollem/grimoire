import { describe, expect, it } from "vitest";
import { VELLUM, VELLUM_LAMPLIGHT } from "./themes.vellum";

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_TEXT = 4.5;

// Tokens that vellum.css and the utilities set as words.
const INKS = [
  "--foreground",
  "--muted-foreground",
  "--primary",
  "--destructive",
  "--live-ink",
  "--tone-success",
  "--tone-info",
  "--tone-arcane",
  "--tone-caution",
] as const;

describe.each([VELLUM, VELLUM_LAMPLIGHT])("$id text contrast", (theme) => {
  it.each(INKS)("%s is readable on the page and on a card", (ink) => {
    for (const surface of ["--background", "--card"]) {
      expect(contrast(theme.vars[ink], theme.vars[surface]), `${ink} on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  // Oxblood words also sit on the festival wash (--secondary) and on a hovered
  // calendar day (--accent).
  it("--live-ink is readable on the washes it is set on", () => {
    for (const surface of ["--secondary", "--accent"]) {
      expect(contrast(theme.vars["--live-ink"], theme.vars[surface]), surface).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

// Why the two tokens exist. Lamplight's oxblood fill is 2.1:1 on the walnut
// ground: right under a button's cream label, unreadable as words. If this ever
// stops holding, the split has become redundant rather than wrong.
describe("oxblood fill and ink", () => {
  it("are one colour on parchment", () => {
    expect(VELLUM.vars["--live-ink"]).toBe(VELLUM.vars["--live"]);
  });

  it("the Lamplight fill is not text-safe, and carries its own label", () => {
    const { vars } = VELLUM_LAMPLIGHT;
    expect(contrast(vars["--live"], vars["--background"])).toBeLessThan(AA_TEXT);
    expect(contrast(vars["--live-foreground"], vars["--live"])).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
