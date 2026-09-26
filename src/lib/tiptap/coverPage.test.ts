import { describe, it, expect } from "vitest";
import { buildFront, buildBack } from "./coverPage";
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

describe("buildFront title stack (#915 story 6)", () => {
  it("has no filled title-plate bar", () => {
    // The old design's bottom bar was a full-width solid-colour strip
    // (margin bleeding to the cover's own edges) carrying the subtitle/
    // tagline — a "plate" that collided with the book's own chapter-heading
    // background (see the .sc-cover h1 reset in theme-base.css) and either
    // overflowed or went invisible depending on theme. That bar's
    // distinctive edge-bleed margin is gone from every element now.
    const all = flattenAll(buildFront({ ...base, backgroundImage: "art.png" }));
    expect(all.some((n) => n.style.includes("margin:0 -2.5rem -2.5rem"))).toBe(false);
  });

  it("renders the tagline as a top series line when set", () => {
    const all = flattenAll(buildFront({ ...base, tagline: "An Unofficial Homebrew Supplement" }));
    const tagline = all.find((n) => n.tag === "p" && n.style.includes("top:"));
    expect(tagline).toBeTruthy();
  });

  it("omits the tagline element entirely when empty", () => {
    const all = flattenAll(buildFront({ ...base, tagline: "" }));
    expect(all.some((n) => n.style.includes("letter-spacing:0.25em"))).toBe(false);
  });

  it("puts the subtitle before the title so it reads as the brand line above it", () => {
    const spec = buildFront(base);
    const html = JSON.stringify(spec);
    expect(html.indexOf(base.subtitle)).toBeLessThan(html.indexOf(base.title));
  });
});

describe("buildBack cover art strip", () => {
  it("shows the art strip at full strength when art is set", () => {
    const strip = flattenAll(buildBack({ ...base, variant: "back", backgroundImage: "art.png" }))
      .find((n) => n.style.includes("background-image"));
    expect(strip).toBeTruthy();
    expect(strip!.style).not.toContain("opacity:0.75");
  });

  it("keeps the soft accent placeholder dim when there is no art", () => {
    const strip = flattenAll(buildBack({ ...base, variant: "back", backgroundImage: "" }))[0];
    expect(strip.style).toContain("opacity:0.75");
  });
});
