// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderFurniture, buildFurnitureElement, furniturePlacement } from "./renderFurniture";
import { createFurnitureItem } from "./model";
import { WATERCOLOR_ASSETS } from "@/data/watercolorAssets";

/**
 * Build N fake Paged.js pages of chapter "c1" (as the book layout marks them);
 * page `blockPage` (1-based) contains `blockId`.
 */
function makeContainer(n: number, blockId?: string, blockPage = 1): HTMLElement {
  const c = document.createElement("div");
  c.innerHTML = Array.from({ length: n }, (_, i) => {
    const block = blockId && i + 1 === blockPage ? `<p data-block-id="${blockId}">x</p>` : "<p>x</p>";
    return `<div class="pagedjs_page" data-chapter-id="c1" data-chapter-page="${i + 1}"><div class="pagedjs_pagebox"><div class="pagedjs_area">${block}</div></div></div>`;
  }).join("");
  return c;
}

function box(c: HTMLElement, page: number): HTMLElement {
  return Array.from(c.querySelectorAll<HTMLElement>(".pagedjs_pagebox"))[page - 1];
}

describe("renderFurniture", () => {
  it("places a page-anchored item on the right page", () => {
    const c = makeContainer(3);
    const item = createFurnitureItem("watercolor", { type: "page", chapterId: "c1", page: 2 });
    renderFurniture(c, [item]);
    expect(box(c, 1).querySelector(".sc-furniture")).toBeNull();
    expect(box(c, 2).querySelector(".sc-furniture--watercolor")).toBeTruthy();
    expect(box(c, 3).querySelector(".sc-furniture")).toBeNull();
  });

  it("reads a page anchor as a page within its chapter, not a position in the book", () => {
    // Chapter b's page 1 is the fourth physical page, after a blank: never the first of the book.
    const c = document.createElement("div");
    const page = (attrs: string) =>
      `<div class="pagedjs_page" ${attrs}><div class="pagedjs_pagebox"></div></div>`;
    c.innerHTML =
      page('data-chapter-id="a" data-chapter-page="1"') +
      page('data-chapter-id="a" data-chapter-page="2"') +
      page('data-chapter-id="a" data-blank-page=""') +
      page('data-chapter-id="b" data-chapter-page="1"');
    renderFurniture(c, [createFurnitureItem("art", { type: "page", chapterId: "b", page: 1 })]);
    const boxes = Array.from(c.querySelectorAll(".pagedjs_pagebox"));
    expect(boxes.map((b) => b.querySelector(".sc-furniture") !== null)).toEqual([false, false, false, true]);
  });

  it("draws nothing for a chapter that is not in the book", () => {
    const c = makeContainer(2);
    renderFurniture(c, [createFurnitureItem("art", { type: "page", chapterId: "gone", page: 1 })]);
    expect(c.querySelectorAll(".sc-furniture")).toHaveLength(0);
  });

  it("places a block-anchored item on the page containing the block", () => {
    const c = makeContainer(3, "blk-1", 3);
    const item = createFurnitureItem("art", { type: "block", blockId: "blk-1" });
    renderFurniture(c, [item]);
    expect(box(c, 3).querySelector(".sc-furniture--art")).toBeTruthy();
  });

  it("a page anchor past the chapter's end draws on its last page", () => {
    const c = makeContainer(2);
    renderFurniture(c, [createFurnitureItem("art", { type: "page", chapterId: "c1", page: 5 })]);
    expect(box(c, 1).querySelector(".sc-furniture")).toBeNull();
    expect(box(c, 2).querySelector(".sc-furniture--art")).toBeTruthy();
  });

  it("skips items whose anchor can't be resolved", () => {
    const c = makeContainer(2);
    renderFurniture(c, [
      createFurnitureItem("watercolor", { type: "page", chapterId: "other", page: 1 }),
      createFurnitureItem("art", { type: "block", blockId: "missing" }),
    ]);
    expect(c.querySelectorAll(".sc-furniture")).toHaveLength(0);
  });

  it("paints the watercolor as a tinted mask positioned by percentage", () => {
    const c = makeContainer(1);
    const item = createFurnitureItem("watercolor", { type: "page", chapterId: "c1", page: 1 }, {
      x: 12, y: 34, width: 40, props: { variant: 5, opacity: 50, color: "#7d1c1c" },
    });
    renderFurniture(c, [item]);
    const el = box(c, 1).querySelector<HTMLElement>(".sc-furniture--watercolor")!;
    const style = el.getAttribute("style") ?? "";
    // Variant 5 → the 5th asset, painted via mask (no <img>); tint via background.
    expect(style).toContain(WATERCOLOR_ASSETS[4].file);
    expect(style).toContain("mask");
    expect(style).toContain("#7d1c1c");
    expect(el.style.left).toBe("12%");
    expect(el.style.top).toBe("34%");
    expect(el.style.width).toBe("40%");
    expect(el.style.opacity).toBe("0.5");
  });

  it("renders a page-spanning watermark with its text", () => {
    const c = makeContainer(1);
    renderFurniture(c, [createFurnitureItem("watermark", { type: "page", chapterId: "c1", page: 1 }, { props: { text: "PLAYTEST" } })]);
    const wm = box(c, 1).querySelector(".sc-furniture--watermark")!;
    expect(wm.textContent).toBe("PLAYTEST");
  });

  it("renders an artist credit in the chosen corner", () => {
    const c = makeContainer(1);
    renderFurniture(c, [createFurnitureItem("artistCredit", { type: "page", chapterId: "c1", page: 1 }, { props: { artistName: "Jane", position: "top-left" } })]);
    const cr = box(c, 1).querySelector<HTMLElement>(".sc-furniture--artistCredit")!;
    expect(cr.textContent).toBe("Jane");
    expect(cr.style.top).toBe("0.5rem");
    expect(cr.style.left).toBe("0.75rem");
  });

  it('layers "under" before body content and "over" after', () => {
    const c = makeContainer(1);
    const under = createFurnitureItem("watercolor", { type: "page", chapterId: "c1", page: 1 }, { z: "under" });
    const over = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 }, { z: "over" });
    renderFurniture(c, [under, over]);
    const children = Array.from(box(c, 1).children);
    const underIdx = children.findIndex((e) => e.classList.contains("sc-furniture--watercolor"));
    const overIdx = children.findIndex((e) => e.classList.contains("sc-furniture--art"));
    const areaIdx = children.findIndex((e) => e.classList.contains("pagedjs_area"));
    expect(underIdx).toBeLessThan(areaIdx); // under is behind the content
    expect(overIdx).toBeGreaterThan(areaIdx); // over is above it
  });

  it("an artist credit with no position sits bottom-right", () => {
    const c = makeContainer(1);
    renderFurniture(c, [createFurnitureItem("artistCredit", { type: "page", chapterId: "c1", page: 1 }, { props: { artistName: "Jane" } })]);
    const cr = box(c, 1).querySelector<HTMLElement>(".sc-furniture--artistCredit")!;
    expect(cr.style.bottom).toBe("0.5rem");
    expect(cr.style.right).toBe("0.75rem");
  });

  describe("interactive (the editor preview)", () => {
    it("lets clicks reach the item, stacks it above the page content, and outlines only the selected one", () => {
      const c = makeContainer(1);
      const under = createFurnitureItem("watercolor", { type: "page", chapterId: "c1", page: 1 }, { z: "under" });
      const over = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 }, { z: "over" });
      renderFurniture(c, [under, over], { interactive: true, selectedId: over.id });
      const underEl = box(c, 1).querySelector<HTMLElement>(".sc-furniture--watercolor")!;
      const overEl = box(c, 1).querySelector<HTMLElement>(".sc-furniture--art")!;
      expect(underEl.style.pointerEvents).toBe("auto");
      expect(overEl.style.pointerEvents).toBe("auto");
      // An interactive "under" item is lifted out from behind the body so it can be grabbed,
      // yet still sits below an "over" one.
      expect(Number(underEl.style.zIndex)).toBeGreaterThan(0);
      expect(Number(overEl.style.zIndex)).toBeGreaterThan(Number(underEl.style.zIndex));
      expect(overEl.getAttribute("style")).toContain("outline");
      expect(underEl.getAttribute("style")).not.toContain("outline");
    });

    it("a watermark is grabbed by its text, not by the page-wide wrapper", () => {
      const c = makeContainer(1);
      renderFurniture(c, [createFurnitureItem("watermark", { type: "page", chapterId: "c1", page: 1 })], { interactive: true });
      const wrap = box(c, 1).querySelector<HTMLElement>(".sc-furniture--watermark")!;
      expect(wrap.style.pointerEvents).toBe("none");
      expect(wrap.querySelector<HTMLElement>("span")!.style.pointerEvents).toBe("auto");
    });

    it("the printed render never takes pointer events", () => {
      const c = makeContainer(1);
      renderFurniture(c, [createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 })]);
      expect(box(c, 1).querySelector<HTMLElement>(".sc-furniture--art")!.style.pointerEvents).toBe("none");
    });
  });

  it("art behind the text is muted so text over it stays readable", () => {
    const under = buildFurnitureElement(createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 }, { z: "under", props: { src: "/a.png", opacity: 40 } }));
    expect(under.style.opacity).toBe("0.4");
    expect(under.style.mixBlendMode).toBe("multiply");
    const dflt = buildFurnitureElement(createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 }, { z: "under", props: { src: "/a.png" } }));
    expect(dflt.style.opacity).toBe("0.4");
  });

  it("art in front of the text is shown at full strength", () => {
    const over = buildFurnitureElement(createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 }, { z: "over", props: { src: "/a.png", opacity: 40 } }));
    expect(over.style.opacity).toBe("");
    expect(over.style.mixBlendMode).toBe("");
  });

  it("is idempotent — re-render replaces, does not stack", () => {
    const c = makeContainer(1);
    const item = createFurnitureItem("watermark", { type: "page", chapterId: "c1", page: 1 });
    renderFurniture(c, [item]);
    renderFurniture(c, [item]);
    expect(c.querySelectorAll(".sc-furniture")).toHaveLength(1);
  });

  it("no-ops when there are no pages", () => {
    const c = document.createElement("div");
    expect(() => renderFurniture(c, [createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 })])).not.toThrow();
  });
});

describe("corner-pinned art", () => {
  const anchor = { type: "page", chapterId: "c1", page: 1 } as const;

  it("a bottom-right corner item is placed from right and bottom, so widening it grows it leftwards and upwards", () => {
    const item = { ...createFurnitureItem("art", anchor, { x: 0, y: 0, width: 30 }), corner: "bottom-right" as const };
    const el = buildFurnitureElement(item);
    expect([el.style.right, el.style.bottom, el.style.left, el.style.top]).toEqual(["0%", "0%", "", ""]);
  });

  it("a top-left corner item keeps left/top, and a watercolour is cornered too", () => {
    const item = { ...createFurnitureItem("watercolor", anchor, { x: 2, y: 3 }), corner: "top-left" as const };
    const el = buildFurnitureElement(item);
    expect([el.style.left, el.style.top, el.style.right]).toEqual(["2%", "3%", ""]);
  });

  it("a watermark ignores the corner", () => {
    const item = { ...createFurnitureItem("watermark", anchor), corner: "top-right" as const };
    expect(buildFurnitureElement(item).style.right).toBe("");
  });

  it("finds the page an item is drawn on and the first block on the preview's copy of it", () => {
    const root = makeContainer(2, "blk", 2);
    renderFurniture(root, [createFurnitureItem("art", { type: "page", chapterId: "c1", page: 2 })]);
    const id = root.querySelector<HTMLElement>("[data-furniture-id]")!.dataset.furnitureId!;
    expect(furniturePlacement(id, root)).toEqual({ chapterId: "c1", page: 2, firstBlockId: "blk", heightPct: null });
  });

  it("answers null when nothing is laid out, so the inspector can disable its controls", () => {
    expect(furniturePlacement("nope", document.createElement("div"))).toBeNull();
  });
});

describe("a picture that follows its paragraph", () => {
  const rect = (top: number, height = 0) =>
    ({ x: 0, y: top, top, left: 0, right: 0, bottom: top + height, width: 0, height, toJSON() {} }) as DOMRect;

  /** Page `blockPage` holds the paragraph `blk`, whose top is `blockTop` px down a 1000px page box. */
  function laidOut(blockPage: number, blockTop: number): HTMLElement {
    const c = makeContainer(3, "blk", blockPage);
    for (const b of Array.from(c.querySelectorAll<HTMLElement>(".pagedjs_pagebox"))) b.getBoundingClientRect = () => rect(0, 1000);
    c.querySelector<HTMLElement>("[data-block-id]")!.getBoundingClientRect = () => rect(blockTop, 20);
    return c;
  }
  const item = () => createFurnitureItem("art", { type: "block", blockId: "blk" }, { x: 10, y: 5, width: 30 });

  it("a paragraph moving to the next page takes its picture with it to the same place beside it", () => {
    const before = laidOut(2, 300);
    const after = laidOut(3, 100);
    const it1 = item();
    renderFurniture(before, [it1]);
    renderFurniture(after, [it1]);
    // Same offset below the paragraph, whichever page and height it lands at.
    expect(box(before, 2).querySelector<HTMLElement>(".sc-furniture")!.style.top).toBe("35%");
    expect(box(after, 3).querySelector<HTMLElement>(".sc-furniture")!.style.top).toBe("15%");
  });

  it("tells the drag code where the paragraph's top is, so it can write an offset", () => {
    const c = laidOut(1, 300);
    renderFurniture(c, [item()]);
    expect(box(c, 1).querySelector<HTMLElement>(".sc-furniture")!.dataset.anchorTop).toBe("30");
  });

  it("a picture never leaves the page when its paragraph sits at the foot", () => {
    const c = laidOut(1, 950);
    const heights = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("pagedjs_pagebox") ? 1000 : 200;
    });
    renderFurniture(c, [item()]);
    heights.mockRestore();
    // 95% + 5% would put its top at 100%; it is held to 100 - its 20% height.
    expect(box(c, 1).querySelector<HTMLElement>(".sc-furniture")!.style.top).toBe("80%");
  });

  it("a page-anchored or cornered picture keeps its own page coordinates", () => {
    const c = laidOut(1, 300);
    const onPage = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 }, { x: 10, y: 5 });
    const cornered = { ...item(), corner: "top-left" as const, x: 0, y: 0 };
    renderFurniture(c, [onPage, cornered]);
    for (const el of Array.from(box(c, 1).querySelectorAll<HTMLElement>(".sc-furniture"))) expect(el.dataset.anchorTop).toBeUndefined();
    expect(box(c, 1).querySelector<HTMLElement>(`[data-furniture-id="${onPage.id}"]`)!.style.top).toBe("5%");
  });
});

describe("a treated art picture", () => {
  const art = (props: Record<string, string>) => {
    const item = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 });
    return buildFurnitureElement({ ...item, props: { ...item.props, src: "https://cdn/bake.webp", ...props } });
  };

  it("carries its recipe on the img so print can redraw it from the original", () => {
    const recipe = JSON.stringify({ v: 1, seed: 1, steps: [] });
    const img = art({ original: "https://cdn/orig.webp", illuminate: recipe, bakedFor: "h1" });
    expect(img.getAttribute("src")).toBe("https://cdn/bake.webp");
    expect(img.getAttribute("data-original")).toBe("https://cdn/orig.webp");
    expect(img.getAttribute("data-illuminate")).toBe(recipe);
    expect(img.getAttribute("data-baked-for")).toBe("h1");
  });

  it("carries no recipe attributes when the picture was never treated", () => {
    const img = art({});
    expect(img.hasAttribute("data-original")).toBe(false);
    expect(img.hasAttribute("data-illuminate")).toBe(false);
  });
});
