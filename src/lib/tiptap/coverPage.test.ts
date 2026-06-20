import { describe, it, expect } from "vitest";
import { buildFront } from "./coverPage";
import type { CoverPageAttrs } from "./coverPage";

const base: CoverPageAttrs = {
  variant: "front",
  title: "The Frozen Gate",
  subtitle: "A cold welcome",
  partNumber: "I",
  blurb1: "",
  blurb2: "",
  blurb3: "",
  tagline: "",
  productUrl: "",
  backgroundImage: "",
  titleScrim: true,
};

/** Flatten the ProseMirror render spec into a list of (tag, style, src). */
function nodes(spec: unknown, out: { tag: string; style: string; src?: unknown }[] = []) {
  if (!Array.isArray(spec)) return out;
  const [tag, attrs, ...kids] = spec as unknown[];
  let rest: unknown[] = kids;
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    const a = attrs as Record<string, unknown>;
    if (typeof tag === "string") out.push({ tag, style: typeof a.style === "string" ? a.style : "", src: a.src });
  } else {
    rest = [attrs, ...kids];
  }
  for (const k of rest) nodes(k, out);
  return out;
}

function flattenAll(specs: unknown[]) {
  const out: { tag: string; style: string; src?: unknown }[] = [];
  for (const s of specs) nodes(s, out);
  return out;
}

describe("buildFront cover art", () => {
  it("renders the art at full strength (no dimming filter)", () => {
    const all = flattenAll(buildFront({ ...base, backgroundImage: "art.png" }));
    const img = all.find((n) => n.tag === "img" && n.src === "art.png");
    expect(img).toBeTruthy();
    expect(img!.style).not.toContain("opacity:0.55");
    expect(img!.style).not.toContain("filter");
  });

  it("adds the legibility scrim by default when art is set", () => {
    const all = flattenAll(buildFront({ ...base, backgroundImage: "art.png", titleScrim: true }));
    expect(all.some((n) => n.style.includes("linear-gradient"))).toBe(true);
  });

  it("omits the scrim when the author turns it off", () => {
    const all = flattenAll(buildFront({ ...base, backgroundImage: "art.png", titleScrim: false }));
    expect(all.some((n) => n.style.includes("linear-gradient"))).toBe(false);
  });

  it("has no scrim and no art image when there is no background art", () => {
    const all = flattenAll(buildFront({ ...base, backgroundImage: "", titleScrim: true }));
    expect(all.some((n) => n.tag === "img")).toBe(false);
    expect(all.some((n) => n.style.includes("linear-gradient"))).toBe(false);
  });
});
