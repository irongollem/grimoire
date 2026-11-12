// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({ applySteps: vi.fn(), loaded: [] as string[] }));
vi.mock("@/scriptorium/illuminator/lib/applySteps", () => ({ applySteps: mocks.applySteps }));
vi.mock("@/scriptorium/illuminator/lib/loadImage", () => ({
  loadDomImage: async (url: string) => {
    mocks.loaded.push(url);
    return { naturalWidth: 400, naturalHeight: 200 };
  },
}));

import { createFurnitureItem } from "@/scriptorium/lib/furniture/model";
import { buildFurnitureElement } from "@/scriptorium/lib/furniture/renderFurniture";
import { compactPrintImages, fitCroppedArt, fitCroppedPictures, needsCompacting, printPixelSize, printRecipe, PRINT_PPI } from "./printImages";

describe("printPixelSize", () => {
  it("resamples to 300 ppi of the printed size", () => {
    // 220 CSS px is 2.29 inches, so 688 pixels at 300 ppi.
    expect(printPixelSize({ width: 1024, height: 1536 }, { width: 220, height: 330 })).toEqual({
      width: 688,
      height: 1031,
    });
    expect(PRINT_PPI).toBe(300);
  });

  it("never upscales a picture smaller than print size", () => {
    expect(printPixelSize({ width: 400, height: 600 }, { width: 794, height: 1123 })).toEqual({
      width: 400,
      height: 600,
    });
  });

  it("is at least one pixel on each side, however small the printed box", () => {
    // A 100000 x 1 strip in a box 0.01px tall scales by 0.03125: 3125 wide, and 0.03 tall rounds to 0.
    expect(printPixelSize({ width: 100000, height: 1 }, { width: 1, height: 0.01 })).toEqual({ width: 3125, height: 1 });
    expect(printPixelSize({ width: 1, height: 100000 }, { width: 0.01, height: 1 })).toEqual({ width: 1, height: 3125 });
  });

  it("keeps enough pixels to fill a cropped cover box on its tighter axis", () => {
    // A tall picture covering a wide box is cropped top and bottom: its width
    // decides the size it needs.
    const size = printPixelSize({ width: 3000, height: 6000 }, { width: 600, height: 300 });
    expect(size.width).toBe(1875);
    expect(size.height).toBe(3750);
  });
});

describe("needsCompacting", () => {
  const natural = { width: 1024, height: 1536 };

  it("redraws a WebP even at print size, since the print pipeline stores it losslessly", () => {
    expect(needsCompacting("https://cdn.example/art.webp", natural, natural)).toBe(true);
  });

  it("leaves a JPEG already at print size untouched", () => {
    expect(needsCompacting("https://cdn.example/art.jpeg", natural, natural)).toBe(false);
    expect(needsCompacting("https://cdn.example/art.JPG?v=2", natural, natural)).toBe(false);
  });

  it("treats a JPEG data URI like a JPEG file", () => {
    expect(needsCompacting("data:image/jpeg;base64,AAAA", natural, natural)).toBe(false);
  });

  it("does not mistake a file whose name merely contains .jpg for a JPEG", () => {
    expect(needsCompacting("https://cdn.example/art.jpg.webp", natural, natural)).toBe(true);
  });

  it("shrinks a JPEG larger than print size", () => {
    expect(needsCompacting("https://cdn.example/art.jpg", natural, { width: 688, height: 1031 })).toBe(true);
  });
});

const RECIPE = JSON.stringify({ v: 1, seed: 1, steps: [{ type: "mask", url: "https://cdn/m.png" }] });

function treatedImg(attrs: Record<string, string>): HTMLImageElement {
  const img = document.createElement("img");
  img.setAttribute("src", "https://cdn/stale-bake.webp");
  for (const [k, v] of Object.entries(attrs)) img.setAttribute(k, v);
  return img;
}

describe("printRecipe", () => {
  it("needs both the original and a recipe with steps", () => {
    expect(printRecipe(treatedImg({ "data-original": "https://cdn/o.webp", "data-illuminate": RECIPE }))?.base).toBe("https://cdn/o.webp");
    expect(printRecipe(treatedImg({ "data-illuminate": RECIPE }))).toBeNull();
    expect(printRecipe(treatedImg({ "data-original": "o" }))).toBeNull();
    expect(printRecipe(treatedImg({ "data-original": "o", "data-illuminate": JSON.stringify({ v: 1, seed: 1, steps: [] }) }))).toBeNull();
    expect(printRecipe(treatedImg({ "data-original": "o", "data-illuminate": "{oops" }))).toBeNull();
  });
});

describe("printRecipe with an AI result", () => {
  // Bug: print redrew the original and the paid-for AI picture never reached the PDF.
  it("prints over the AI output, not the original", () => {
    const ai = JSON.stringify({ v: 1, seed: 1, steps: [{ type: "ai", action: "ink", output: "https://cdn/ai.webp" }] });
    expect(printRecipe(treatedImg({ "data-original": "https://cdn/o.webp", "data-illuminate": ai }))?.base).toBe("https://cdn/ai.webp");
  });
});

describe("compactPrintImages with a recipe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.applySteps.mockReset();
    mocks.loaded.length = 0;
  });

  function stubCanvas() {
    const ctx = {
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 0]) }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as RenderingContext);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation((type?: string) => `data:${type};stub`);
    return ctx;
  }

  function mount(img: HTMLImageElement, box = { width: 100, height: 50 }): HTMLElement {
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue(box as DOMRect);
    Object.defineProperty(img, "currentSrc", { value: img.getAttribute("src") });
    const root = document.createElement("div");
    root.appendChild(img);
    return root;
  }

  it("redraws from the original and applies the recipe, never reading the possibly stale bake", async () => {
    stubCanvas();
    const img = treatedImg({ "data-original": "https://cdn/o.webp", "data-illuminate": RECIPE, "data-baked-for": "old" });
    await compactPrintImages(mount(img));
    expect(mocks.loaded).toEqual(["https://cdn/o.webp"]);
    expect(mocks.applySteps).toHaveBeenCalledTimes(1);
    const [, w, h, settings, , opts] = mocks.applySteps.mock.calls[0];
    // 100 x 50 CSS px at 300 ppi is 313 x 156 of the original's 400 x 200.
    expect([w, h]).toEqual([313, 156]);
    expect(settings.steps[0]).toMatchObject({ type: "mask" });
    expect(opts).toEqual({ sourceWidth: 400 });
    expect(img.src).toContain("data:image/png");
  });

  // Fails on: print redrawing the whole picture into a box the shape of the crop, or sizing it from the uncropped picture.
  it("prints the kept part of a cropped picture at its size, the other steps working on it", async () => {
    const ctx = stubCanvas();
    const cropped = JSON.stringify({ v: 1, seed: 1, steps: [{ type: "crop", x: 0.5, y: 0, w: 0.5, h: 1 }, { type: "mask", url: "https://cdn/m.png" }] });
    await compactPrintImages(mount(treatedImg({ "data-original": "https://cdn/o.webp", "data-illuminate": cropped }), { width: 400, height: 400 }));
    // The 400 x 200 original keeps its right half: 200 x 200, which is below print size for a 400 px box.
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 200, 0, 200, 200, 0, 0, 200, 200);
    const [, w, h, , , opts] = mocks.applySteps.mock.calls[0];
    expect([w, h]).toEqual([200, 200]);
    expect(opts).toEqual({ sourceWidth: 200 });
  });

  it("loads the AI output as the picture to redraw when the recipe has one", async () => {
    stubCanvas();
    const ai = JSON.stringify({ v: 1, seed: 1, steps: [{ type: "ai", action: "cutout", output: "https://cdn/ai.webp" }] });
    await compactPrintImages(mount(treatedImg({ "data-original": "https://cdn/o.webp", "data-illuminate": ai })));
    expect(mocks.loaded).toEqual(["https://cdn/ai.webp"]);
  });

  it("applies the recipe even to a JPEG original already at print size, which an untreated one would skip", async () => {
    stubCanvas();
    // Not yet baked: src is still the JPEG original.
    const img = treatedImg({ src: "https://cdn/o.jpg", "data-original": "https://cdn/o.jpg", "data-illuminate": RECIPE });
    await compactPrintImages(mount(img, { width: 2000, height: 1000 }));
    expect(mocks.applySteps).toHaveBeenCalledTimes(1);
  });

  it("leaves an untreated picture on the normal path with no recipe applied", async () => {
    stubCanvas();
    const img = treatedImg({});
    await compactPrintImages(mount(img));
    expect(mocks.loaded).toEqual(["https://cdn/stale-bake.webp"]);
    expect(mocks.applySteps).not.toHaveBeenCalled();
  });
});

describe("cropped pictures are given their shape before layout", () => {
  const cropped = JSON.stringify({ v: 1, seed: 1, steps: [{ type: "crop", x: 0.5, y: 0, w: 0.5, h: 1 }] });

  // Fails on: layout measuring a stale bake's box (the 400 x 200 original here, 2:1) while print redraws the
  // square crop into it, which would stretch the picture. The mocked picture is 400 x 200, its crop 200 x 200.
  it("sets the crop's aspect on a recipe picture in the chapter html, keeping its width", async () => {
    const html = `<p>x</p><img src="https://cdn/stale.webp" style="float:right;width:200px" data-original="https://cdn/o.webp" data-illuminate='${cropped}'>`;
    const out = await fitCroppedPictures(html);
    const img = new DOMParser().parseFromString(out, "text/html").querySelector("img")!;
    expect(img.style.aspectRatio).toBe("1 / 1");
    expect(img.style.width).toBe("200px");
    expect(img.style.height).toBe("auto");
  });

  // Fails on: re-serialising every chapter's html, or touching pictures that do not crop.
  it("leaves html with no cropped picture exactly as it was", async () => {
    const plain = `<p>a <b>b</b></p><img src="x.webp" data-original="o" data-illuminate='${RECIPE}'>`;
    expect(await fitCroppedPictures(plain)).toBe(plain);
    // The word "crop" in the text must not make an uncropped picture take a new box.
    const word = `<p>a crop of wheat</p><img src="x.webp" data-original="o" data-illuminate='${RECIPE}'>`;
    expect(await fitCroppedPictures(word)).toBe(word);
    expect(await fitCroppedPictures("<p>no pictures</p>")).toBe("<p>no pictures</p>");
  });

  // Fails on: art on a page being laid out at the stale bake's shape.
  it("gives cropped art its aspect, drawn by the furniture render, and leaves other items alone", async () => {
    const art = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 }, { props: { src: "s", original: "https://cdn/o.webp", illuminate: cropped } });
    const plain = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 }, { props: { src: "s" } });
    const [fitted, same] = await fitCroppedArt([art, plain]);
    expect(fitted.props.aspect).toBe(1);
    expect(same).toBe(plain);
    expect(buildFurnitureElement(fitted).style.aspectRatio).toBe("1 / 1");
    expect(buildFurnitureElement(plain).style.aspectRatio).toBe("");
  });
});
