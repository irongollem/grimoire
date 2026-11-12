import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fillsPage } from "@/scriptorium/lib/furniture/model";
import { artBlend } from "@/scriptorium/lib/furniture/blend";
import { MAX_BAKE_EDGE } from "@/scriptorium/illuminator/lib/renderBake";
import { LOOK_PAGE_COLOURS, PAGE_PAINTING_PLACEMENT, pagePaintingPaper, pagePaintingProps, pagePaintingRecipe, pagePaintingSize } from "./pagePainting";
import { sheetPresets } from "./newSheet";
import type { PageFurnitureItem } from "@/scriptorium/types";

describe("pagePaintingPaper", () => {
  // Fails on: the book's own paper being ignored, so a painting is made on a different grain than the page under it.
  it("is the book's paper when it has one, whatever the look", () => {
    expect(pagePaintingPaper("kraft", "grimoire")).toBe("kraft");
  });

  // Fails on: the nearest-colour search picking a paper whose colour is far from the look's page (the wrong grain).
  it("picks the stock paper closest to the look's page colour, and none when the look is unknown", () => {
    expect(pagePaintingPaper(null, "grimoire")).toBe("cold-press");
    expect(pagePaintingPaper(null, "onednd2024")).toBe("hot-press");
    expect(pagePaintingPaper(null, "phb2014")).toBe("cold-press");
    expect(pagePaintingPaper(null, "letter")).toBe("laid");
    expect(pagePaintingPaper(null, "notice")).toBe("laid");
    // No look known (the panel outside an editor): no paper rather than a guess.
    expect(pagePaintingPaper(null, null)).toBeNull();
  });
});

describe("pagePaintingSize", () => {
  // Fails on: a painting not matching Blank sheet's Full page (blurry in print) or outgrowing the bake cap.
  it("is the Full page size, inside the bake cap", () => {
    const size = pagePaintingSize(1 / 1.414);
    const full = sheetPresets(1 / 1.414)[0]!;
    expect(size).toEqual({ width: full.width, height: full.height });
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(MAX_BAKE_EDGE);
  });
});

describe("the page painting item", () => {
  const recipe = pagePaintingRecipe("laid", { width: 100, height: 140 }, 4);
  const item: PageFurnitureItem = {
    id: "a",
    kind: "art",
    anchor: { type: "page", chapterId: "c", page: 1 },
    ...PAGE_PAINTING_PLACEMENT,
    props: { src: "s.webp", ...pagePaintingProps("s.webp", recipe, "hash") },
  } as PageFurnitureItem;

  // Fails on: the painting being a floating picture in front of the text, or muted to the 40% art behind text gets.
  it("fills the page, sits behind the text, prints into the paper and is shown as painted", () => {
    expect(fillsPage(item)).toBe(true);
    expect(item.z).toBe("under");
    expect(artBlend(item)).toBe("paper");
    expect(item.props.opacity).toBe(100);
    expect(item.props.painting).toBe(1);
  });

  // Fails on: a painting that is not an empty paint step on the paper (it would not count as unpainted for Cancel).
  it("starts as one empty paint step on the paper at the page's size", () => {
    expect(recipe.steps).toEqual([{ type: "paint", width: 100, height: 140, paper: "laid", layers: [] }]);
  });
});

describe("LOOK_PAGE_COLOURS", () => {
  // Fails on: a look's page colour changed in its stylesheet but not in this copy (Node cannot read a CSS custom
  // property), so a page painting on that look would pick its paper from a colour the page no longer has.
  it("matches each look's own --sc-page-bg", () => {
    const styles = join(import.meta.dirname, "../../styles");
    for (const [theme, colour] of Object.entries(LOOK_PAGE_COLOURS)) {
      const css = readFileSync(join(styles, `theme-${theme}.css`), "utf8");
      const first = /--sc-page-bg:\s*(#[0-9a-fA-F]{3,6})\s*;/.exec(css);
      expect(first?.[1].toLowerCase(), theme).toBe(colour);
    }
  });
});
