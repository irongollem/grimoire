// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dressPage as realDressPage, MARK_ASSETS, type Dressing } from "./dressing";
import { buildDressingLayer, dressingCss, DRESSING_CLASS, markStyle } from "./dressingLayer";

const mocks = vi.hoisted(() => ({ dressPage: vi.fn() }));
vi.mock("@/scriptorium/dressing/dressing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dressing")>();
  mocks.dressPage.mockImplementation(actual.dressPage);
  return { ...actual, dressPage: mocks.dressPage };
});

const FULL: Dressing = {
  v: 1,
  seed: 9,
  stain: { on: true, strength: 0.6 },
  wash: { on: true, strength: 0.5 },
  corners: { on: true, strength: 0.8 },
};

beforeEach(() => {
  document.head.querySelectorAll("style").forEach((s) => s.remove());
  mocks.dressPage.mockClear();
});

describe("buildDressingLayer", () => {
  it("turns exactly the marks dressPage places into elements, in its order", () => {
    // Fails on: a renderer's own placement drifting from the one function every renderer shares.
    const layer = buildDressingLayer(FULL, 3, "text", { aspect: 1.5, handout: false })!;
    expect(mocks.dressPage).toHaveBeenCalledWith(FULL, 3, "text", { aspect: 1.5, handout: false });
    const placed = realDressPage(FULL, 3, "text", { aspect: 1.5, handout: false });
    expect([...layer.children].map((c) => (c as HTMLElement).dataset.mark)).toEqual(placed.map((m) => m.asset));
    expect(layer.className).toBe(DRESSING_CLASS);
    expect(layer.getAttribute("aria-hidden")).toBe("true");
  });

  it("is null for a page with no marks, and leaves the document alone", () => {
    expect(buildDressingLayer(FULL, 1, "cover")).toBeNull();
    expect(buildDressingLayer(null, 3, "text")).toBeNull();
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("names each mask picture once, in a stylesheet, not on every mark", () => {
    // Fails on: a mask url on every mark, which the PDF would repeat as a data: URI on every page (some 700 KB each).
    const layer = buildDressingLayer(FULL, 3, "text")!;
    expect(layer.outerHTML).not.toContain("url(");
    buildDressingLayer(FULL, 5, "text");
    expect(document.head.querySelectorAll("#sc-dressing-style")).toHaveLength(1);
    expect(document.head.querySelector("#sc-dressing-style")?.textContent).toBe(dressingCss());
  });
});

describe("dressingCss", () => {
  it("gives every mark picture its mask, and keeps the layer out of the pointer's way", () => {
    const css = dressingCss();
    for (const { path } of Object.values(MARK_ASSETS)) expect(css).toContain(`mask-image:url(${path})`);
    expect(css).toMatch(/\.sc-dressing\{[^}]*pointer-events:none/);
    expect(css).toContain("background-color:var(--sc-ink");
  });
});

describe("markStyle", () => {
  const mark = { asset: "stain-ring", left: 10, top: 60.12345, width: 36, height: 27, rotate: -2.5, flipX: true, flipY: false, opacity: 0.4 } as const;
  it("places by percentage, turns and flips about the centre, and sets the strength", () => {
    const style = markStyle(mark);
    expect(style).toContain("left:10%");
    expect(style).toContain("top:60.123%");
    expect(style).toContain("transform:rotate(-2.5deg) scale(-1,1)");
    expect(style).toContain("opacity:0.4");
  });
  it("sets no transform for an upright, unflipped mark", () => {
    expect(markStyle({ ...mark, rotate: 0, flipX: false })).not.toContain("transform");
  });
});
