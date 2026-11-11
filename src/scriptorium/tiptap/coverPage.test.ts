// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/core";
import { buildFront, buildBack, buildCoverInner, coverShade } from "./coverPage";
import type { CoverPageAttrs } from "./coverPage";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";

const EXT = createScriptoriumExtensions();

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
  titlePlace: "bottom",
  shade: "dusk",
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
    const all = flattenAll(buildFront({ ...base, backgroundImage: "art.png" }));
    expect(all.some((n) => n.style.includes("linear-gradient"))).toBe(true);
  });

  it("omits the shade when the author chooses None", () => {
    const all = flattenAll(buildFront({ ...base, backgroundImage: "art.png", shade: "none" }));
    expect(all.some((n) => n.style.includes("linear-gradient"))).toBe(false);
  });

  it("has no scrim and no art image when there is no background art", () => {
    const all = flattenAll(buildFront({ ...base, backgroundImage: "" }));
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
    expect(strip.style).not.toContain("background-image");
  });
});

// #915 story 6 round 2: an empty tagline must render nothing, never invented
// boilerplate — this was "AN UNOFFICIAL GRIMOIRE SUPPLEMENT" appearing on
// every front cover that had never set its own tagline.
describe("cover tagline — no invented text", () => {
  it("the node schema defaults a front cover with no tagline set to no tagline text at all", () => {
    // A front cover inserted with no `tagline` override (frontCoverTemplate
    // doesn't set one) used to fall back to the node's own schema default,
    // "An unofficial Grimoire supplement" — printed on every such cover
    // whether or not the DM ever typed a tagline.
    const html = generateHTML(
      { type: "doc", content: [{ type: "coverPage", attrs: { variant: "front" } }] },
      EXT,
    );
    expect(html).not.toContain("An unofficial Grimoire supplement");
    // buildFront omits the tagline <p> entirely when tagline is falsy — its
    // distinctive style (letter-spacing:0.25em) shouldn't appear at all.
    expect(html).not.toContain("letter-spacing:0.25em");
  });

  it("buildBack's bottom bar prints an empty tagline as nothing, never a fallback phrase", () => {
    const all = flattenAll(buildBack({ ...base, variant: "back", tagline: "" }));
    const html = JSON.stringify(all);
    expect(html).not.toContain("An Unofficial Supplement");
  });

  it("buildBack's bottom bar still prints a set tagline", () => {
    const spec = buildBack({ ...base, variant: "back", tagline: "A Late in the Kind Country side-trip" });
    expect(JSON.stringify(spec)).toContain("A Late in the Kind Country side-trip");
  });
});

describe("cover attributes survive storage", () => {
  it("reads a cover with no stored variant as a front cover", () => {
    const json = generateJSON('<div data-type="coverPage"></div>', EXT);
    expect(json.content?.[0]?.attrs?.variant).toBe("front");
    expect(generateHTML({ type: "doc", content: [{ type: "coverPage", attrs: { variant: undefined } }] }, EXT)).toContain(
      "sc-cover--front",
    );
  });
});

describe("cover art image opt-out from the generic paged image cap (#915 story 6 round 2)", () => {
  it("classes the front and inside cover's art image sc-cover-art", () => {
    const front = generateHTML(
      { type: "doc", content: [{ type: "coverPage", attrs: { variant: "front", backgroundImage: "art.png" } }] },
      EXT,
    );
    const inside = generateHTML(
      { type: "doc", content: [{ type: "coverPage", attrs: { variant: "inside", backgroundImage: "art.png" } }] },
      EXT,
    );
    expect(front).toContain('class="sc-cover-art"');
    expect(inside).toContain('class="sc-cover-art"');
  });
});

// The cover's shade and title place replaced the on/off scrim switch (#1176 frame 05).
describe("cover shade", () => {
  // Fails on: a stored cover that has no shade attr (or a bad one) drawing no shade.
  it("draws a cover with no valid shade as dusk, and parses one as dusk", () => {
    expect(coverShade({ shade: "neon" as never })).toBe("dusk");
    const json = generateJSON('<div data-type="coverPage"></div>', EXT);
    expect(json.content?.[0]?.attrs?.shade).toBe("dusk");
  });

  // Fails on: Dusk rendering a different gradient than the cover printed before the shade existed.
  it("keeps the dusk-at-the-bottom look the covers always had", () => {
    const all = flattenAll(buildFront({ ...base, backgroundImage: "art.png" }));
    const shade = all.find((n) => n.style.includes("linear-gradient"));
    expect(shade?.style).toContain("linear-gradient(to top,rgba(0,0,0,0.68) 0%,rgba(0,0,0,0.3) 28%,rgba(0,0,0,0) 55%)");
  });

  // Fails on: the title place being ignored, or the shade not following it.
  it("sets the title and its shade where the writer put them", () => {
    const top = flattenAll(buildFront({ ...base, backgroundImage: "art.png", titlePlace: "top" }));
    expect(top.some((n) => n.style.includes("justify-content:flex-start"))).toBe(true);
    expect(top.find((n) => n.style.includes("linear-gradient"))?.style).toContain("to bottom");
    const middle = flattenAll(buildFront({ ...base, backgroundImage: "art.png", titlePlace: "middle" }));
    expect(middle.some((n) => n.style.includes("justify-content:center"))).toBe(true);
  });

  // Fails on: ink-coloured type kept off a parchment shade (pale type on pale paper), or dark type left on dusk.
  it("sets the title in ink on a parchment shade and light on dusk", () => {
    const paper = flattenAll(buildFront({ ...base, backgroundImage: "art.png", shade: "parchment" }));
    expect(paper.find((n) => n.tag === "h1")?.style).toContain("color:var(--sc-ink,#1a1a1a)");
    const dusk = flattenAll(buildFront({ ...base, backgroundImage: "art.png" }));
    expect(dusk.find((n) => n.tag === "h1")?.style).toContain("var(--sc-accent-contrast");
  });

  // Fails on: a chosen shade being lost in a trip through HTML.
  it("keeps a chosen shade through HTML", () => {
    const html = generateHTML(
      { type: "doc", content: [{ type: "coverPage", attrs: { variant: "front", shade: "parchment" } }] },
      EXT,
    );
    expect(generateJSON(html, EXT).content?.[0]?.attrs).toMatchObject({ shade: "parchment" });
  });
});

describe("cover fields (the words typed on the cover)", () => {
  // Fails on: the printed cover carrying editor-only markers, or the editor's cover missing the words it edits.
  it("marks the words as fields only when the editor draws the cover", () => {
    const printed = JSON.stringify(buildCoverInner("front", { ...base, backgroundImage: "art.png" }));
    expect(printed).not.toContain("data-field");
    const editing = JSON.stringify(buildCoverInner("front", { ...base, backgroundImage: "art.png" }, true));
    expect(editing).toContain('"data-field":"title"');
    expect(editing).toContain('"data-field":"subtitle"');
  });

  // Fails on: an empty series line being impossible to click into on the editor's cover, or printing as an empty line.
  it("keeps an empty series line to type into in the editor and prints nothing for it", () => {
    expect(JSON.stringify(buildFront({ ...base, tagline: "" }))).not.toContain("letter-spacing:0.25em");
    expect(JSON.stringify(buildFront({ ...base, tagline: "" }, true))).toContain('"data-field":"tagline"');
  });

  // Fails on: a back cover missing a field the panel's dialog had (blurbs, link).
  it("a back cover has every word as a field", () => {
    const fields = JSON.stringify(buildCoverInner("back", { ...base, variant: "back" }, true));
    for (const f of ["subtitle", "blurb1", "blurb2", "blurb3", "tagline", "productUrl"]) expect(fields).toContain(`"data-field":"${f}"`);
    const part = JSON.stringify(buildCoverInner("part", { ...base, variant: "part" }, true));
    expect(part).toContain('"data-field":"partNumber"');
  });
});
