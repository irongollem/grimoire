import { describe, it, expect } from "vitest";
import { renderFurniture } from "./renderFurniture";
import { createFurnitureItem } from "./model";
import { WATERCOLOR_ASSETS } from "./watercolorAssets";

/** Build N fake Paged.js pages; page `blockPage` (1-based) contains `blockId`. */
function makeContainer(n: number, blockId?: string, blockPage = 1): HTMLElement {
  const c = document.createElement("div");
  c.innerHTML = Array.from({ length: n }, (_, i) => {
    const block = blockId && i + 1 === blockPage ? `<p data-block-id="${blockId}">x</p>` : "<p>x</p>";
    return `<div class="pagedjs_page"><div class="pagedjs_pagebox"><div class="pagedjs_area">${block}</div></div></div>`;
  }).join("");
  return c;
}

function box(c: HTMLElement, page: number): HTMLElement {
  return Array.from(c.querySelectorAll<HTMLElement>(".pagedjs_pagebox"))[page - 1];
}

describe("renderFurniture", () => {
  it("places a page-anchored item on the right page", () => {
    const c = makeContainer(3);
    const item = createFurnitureItem("watercolor", { type: "page", page: 2 });
    renderFurniture(c, [item]);
    expect(box(c, 1).querySelector(".sc-furniture")).toBeNull();
    expect(box(c, 2).querySelector(".sc-furniture--watercolor")).toBeTruthy();
    expect(box(c, 3).querySelector(".sc-furniture")).toBeNull();
  });

  it("places a block-anchored item on the page containing the block", () => {
    const c = makeContainer(3, "blk-1", 3);
    const item = createFurnitureItem("art", { type: "block", blockId: "blk-1" });
    renderFurniture(c, [item]);
    expect(box(c, 3).querySelector(".sc-furniture--art")).toBeTruthy();
  });

  it("skips items whose anchor can't be resolved", () => {
    const c = makeContainer(2);
    renderFurniture(c, [
      createFurnitureItem("watercolor", { type: "page", page: 9 }),
      createFurnitureItem("art", { type: "block", blockId: "missing" }),
    ]);
    expect(c.querySelectorAll(".sc-furniture")).toHaveLength(0);
  });

  it("paints the watercolor as a tinted mask positioned by percentage", () => {
    const c = makeContainer(1);
    const item = createFurnitureItem("watercolor", { type: "page", page: 1 }, {
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
    renderFurniture(c, [createFurnitureItem("watermark", { type: "page", page: 1 }, { props: { text: "PLAYTEST" } })]);
    const wm = box(c, 1).querySelector(".sc-furniture--watermark")!;
    expect(wm.textContent).toBe("PLAYTEST");
  });

  it("renders an artist credit in the chosen corner", () => {
    const c = makeContainer(1);
    renderFurniture(c, [createFurnitureItem("artistCredit", { type: "page", page: 1 }, { props: { artistName: "Jane", position: "top-left" } })]);
    const cr = box(c, 1).querySelector<HTMLElement>(".sc-furniture--artistCredit")!;
    expect(cr.textContent).toBe("Jane");
    expect(cr.style.top).toBe("0.5rem");
    expect(cr.style.left).toBe("0.75rem");
  });

  it('layers "under" before body content and "over" after', () => {
    const c = makeContainer(1);
    const under = createFurnitureItem("watercolor", { type: "page", page: 1 }, { z: "under" });
    const over = createFurnitureItem("art", { type: "page", page: 1 }, { z: "over" });
    renderFurniture(c, [under, over]);
    const children = Array.from(box(c, 1).children);
    const underIdx = children.findIndex((e) => e.classList.contains("sc-furniture--watercolor"));
    const overIdx = children.findIndex((e) => e.classList.contains("sc-furniture--art"));
    const areaIdx = children.findIndex((e) => e.classList.contains("pagedjs_area"));
    expect(underIdx).toBeLessThan(areaIdx); // under is behind the content
    expect(overIdx).toBeGreaterThan(areaIdx); // over is above it
  });

  it("is idempotent — re-render replaces, does not stack", () => {
    const c = makeContainer(1);
    const item = createFurnitureItem("watermark", { type: "page", page: 1 });
    renderFurniture(c, [item]);
    renderFurniture(c, [item]);
    expect(c.querySelectorAll(".sc-furniture")).toHaveLength(1);
  });

  it("no-ops when there are no pages", () => {
    const c = document.createElement("div");
    expect(() => renderFurniture(c, [createFurnitureItem("art", { type: "page", page: 1 })])).not.toThrow();
  });
});
