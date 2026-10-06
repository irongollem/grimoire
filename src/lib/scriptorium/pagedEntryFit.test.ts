// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { ENTRY_ART_FLOOR_PX, ENTRY_SPLIT_CLASS, fitEntryArt } from "./pagedEntryFit";

/**
 * jsdom has no layout, so each test builds an entry whose geometry follows
 * from its art's max-height the way the page does: the entry ends `rest` px
 * below the art, the art is as tall as its cap allows, and an optional zoom
 * scales every client rect the way the preview's Fit zoom does.
 */
function entryOnPage(opts: { natural: number; rest: number; zoom?: number; withArt?: boolean }) {
  const zoom = opts.zoom ?? 1;
  const wrapper = document.createElement("div");
  wrapper.innerHTML =
    `<div class="sc-statblock-entry"><div class="sc-statblock-entry-block"></div>` +
    `<div class="sc-statblock-entry-aside">` +
    (opts.withArt === false ? "" : `<img class="sc-entity-art sc-entity-art--cutout" src="x.webp">`) +
    `<div class="sc-statblock-entry-lore"><p>Lore.</p></div></div></div>`;
  const entry = wrapper.querySelector<HTMLElement>(".sc-statblock-entry")!;
  const art = wrapper.querySelector<HTMLImageElement>("img");

  const artHeight = () => {
    if (!art) return 0;
    const cap = parseFloat(art.style.maxHeight);
    return Number.isNaN(cap) ? opts.natural : Math.min(opts.natural, cap);
  };
  if (art) {
    Object.defineProperty(art, "offsetHeight", { get: artHeight });
    art.getBoundingClientRect = () => ({ height: artHeight() * zoom }) as DOMRect;
  }
  entry.getBoundingClientRect = () => ({ bottom: (opts.rest + artHeight()) * zoom, right: 600 * zoom }) as DOMRect;
  return { wrapper, entry, art, artHeight };
}

/** A page box whose right edge sits clear of every mocked rect. */
function page(bottom: number, right = 700) {
  return { bottom, right };
}

/** jsdom's getComputedStyle does not follow an inline margin set later, so
 *  the entry's computed bottom margin is read from its inline style here. */
function computedMarginFromInline() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const style = real(el);
    const inline = (el as HTMLElement).style?.marginBottom;
    return inline ? ({ ...style, marginBottom: inline } as CSSStyleDeclaration) : style;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fitEntryArt", () => {
  it("leaves an entry that fits its page alone", () => {
    const { wrapper, entry, art } = entryOnPage({ natural: 200, rest: 600 });
    fitEntryArt(wrapper, page(1000));
    expect(art!.style.maxHeight).toBe("");
    expect(entry.classList.contains(ENTRY_SPLIT_CLASS)).toBe(false);
  });

  it("gives the art the tallest height that ends the entry on the page (the Caramel Crusher, #915)", () => {
    // A 772px band and its heading left 160px; the cutout wanted 256px.
    const { wrapper, entry, artHeight } = entryOnPage({ natural: 256, rest: 854 });
    fitEntryArt(wrapper, page(1014));
    expect(artHeight()).toBe(160);
    expect(entry.getBoundingClientRect().bottom).toBeLessThanOrEqual(1014);
    expect(entry.classList.contains(ENTRY_SPLIT_CLASS)).toBe(false);
  });

  it("measures through the preview's zoom", () => {
    const zoom = 0.375;
    const { wrapper, artHeight } = entryOnPage({ natural: 256, rest: 854, zoom });
    fitEntryArt(wrapper, page(1014 * zoom, 700 * zoom));
    // The half-pixel tolerance is in screen px, about one CSS px at this zoom.
    expect(artHeight()).toBeGreaterThanOrEqual(160);
    expect(artHeight()).toBeLessThanOrEqual(161);
  });

  it("measures each height, because lore beside a shorter figure runs longer", () => {
    // Wrapped lore: every 10px the art gives up adds 6px of lore under it, so
    // subtracting the overflow once leaves it too tall.
    const wrapper = document.createElement("div");
    wrapper.innerHTML =
      `<div class="sc-statblock-entry"><img class="sc-entity-art" src="x.webp"></div>`;
    const entry = wrapper.querySelector<HTMLElement>(".sc-statblock-entry")!;
    const art = wrapper.querySelector<HTMLImageElement>("img")!;
    const h = () => (art.style.maxHeight ? Math.min(256, parseFloat(art.style.maxHeight)) : 256);
    Object.defineProperty(art, "offsetHeight", { get: h });
    entry.getBoundingClientRect = () => ({ bottom: 800 + h() + (256 - h()) * 0.6, right: 600 }) as DOMRect;
    fitEntryArt(wrapper, page(1014));
    expect(entry.getBoundingClientRect().bottom).toBeLessThanOrEqual(1014.5);
    // One subtraction would stop at 256 - 54 = 202, still 32px over.
    expect(h()).toBe(152);
  });

  it("stops at the floor and lets the entry split rather than lose its tail", () => {
    const { wrapper, entry, artHeight } = entryOnPage({ natural: 256, rest: 980 });
    fitEntryArt(wrapper, page(1014));
    expect(artHeight()).toBe(ENTRY_ART_FLOOR_PX);
    expect(entry.classList.contains(ENTRY_SPLIT_CLASS)).toBe(true);
  });

  it("drops the bottom margin of an entry that reaches the page bottom, before touching its art", () => {
    // The margin pushed the Crusher's column wrapper off the page and Chrome
    // painted the whole entry in an off-page column: an empty page (#915).
    computedMarginFromInline();
    const { wrapper, entry, art } = entryOnPage({ natural: 150, rest: 850 });
    entry.style.marginBottom = "18px";
    // Border box ends at 1000; the margin box at 1018, past the 1014 page.
    fitEntryArt(wrapper, page(1014));
    expect(entry.style.marginBottom).toBe("0px");
    expect(art!.style.maxHeight).toBe("");
  });

  it("drops the margin first, then shrinks the art only as far as the border box needs", () => {
    computedMarginFromInline();
    const { wrapper, entry, artHeight } = entryOnPage({ natural: 256, rest: 854 });
    entry.style.marginBottom = "18px";
    fitEntryArt(wrapper, page(1014));
    expect(entry.style.marginBottom).toBe("0px");
    expect(artHeight()).toBe(160);
  });

  it("treats a wrapper spilled into an off-page column as not fitting (the Crusher's empty page, #915)", () => {
    // The entry's own rect fits; its column wrapper reaches past the page's
    // right edge until the art is 160px or less, as measured in the booklet.
    const wrapper = document.createElement("div");
    wrapper.innerHTML =
      `<div class="phb-two-col"><div class="sc-statblock-entry">` +
      `<img class="sc-entity-art" src="x.webp"></div></div>`;
    const col = wrapper.querySelector<HTMLElement>(".phb-two-col")!;
    const entry = wrapper.querySelector<HTMLElement>(".sc-statblock-entry")!;
    const art = wrapper.querySelector<HTMLImageElement>("img")!;
    const h = () => (art.style.maxHeight ? Math.min(256, parseFloat(art.style.maxHeight)) : 256);
    Object.defineProperty(art, "offsetHeight", { get: h });
    entry.getBoundingClientRect = () => ({ bottom: 900, right: 658 }) as DOMRect;
    col.getBoundingClientRect = () => ({ bottom: 900, right: h() > 160 ? 2451 : 658 }) as DOMRect;
    fitEntryArt(wrapper, page(1014, 658));
    expect(h()).toBe(160);
    expect(entry.classList.contains(ENTRY_SPLIT_CLASS)).toBe(false);
  });

  it("lets an entry with no art to shrink split when it overflows", () => {
    const { wrapper, entry } = entryOnPage({ natural: 0, rest: 1100, withArt: false });
    fitEntryArt(wrapper, page(1014));
    expect(entry.classList.contains(ENTRY_SPLIT_CLASS)).toBe(true);
  });
});
