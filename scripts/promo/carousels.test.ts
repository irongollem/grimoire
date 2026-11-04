import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCarousel, isCarousel, jpegSize, postCarousel, slideFiles } from "./carousels";

let root: string;
const CAPTION = "Steal this monster.\n\n#dnd #ttrpg";

/** The start of a JPEG: SOI, an APP0 segment, then a baseline SOF0 carrying the size. */
function jpeg(width: number, height: number): Buffer {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

function post(slides: Array<[number, number] | "png">) {
  const dir = join(root, "steal", "slides");
  mkdirSync(dir, { recursive: true });
  slides.forEach((s, i) => writeFileSync(join(dir, `slide-${i + 1}.jpg`), s === "png" ? Buffer.from([0x89, 0x50, 0x4e, 0x47]) : jpeg(s[0], s[1])));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "promo-carousel-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("checkCarousel", () => {
  it("passes same-sized JPEG slides with a good caption", () => {
    post([[1080, 1350], [1080, 1350], [1080, 1350]]);
    expect(checkCarousel(root, "steal", CAPTION).problems).toEqual([]);
  });

  it("refuses a slide of another size, which Instagram would crop to the first one's shape", () => {
    post([[1080, 1350], [1080, 1080]]);
    expect(checkCarousel(root, "steal", CAPTION).problems).toEqual(["not the size of slide 1 (1080x1350), so Instagram would crop them: slide-2.jpg"]);
  });

  it("refuses a slide that is not a JPEG, the only photo format the API takes", () => {
    post([[1080, 1350], "png"]);
    expect(checkCarousel(root, "steal", CAPTION).problems).toEqual(["slide-2.jpg is not a JPEG Instagram can read"]);
  });

  it("refuses a single slide, which is not a carousel", () => {
    post([[1080, 1350]]);
    expect(checkCarousel(root, "steal", CAPTION).problems[0]).toMatch(/at least 2/);
  });
});

describe("slideFiles", () => {
  it("orders slides by number, so slide-10 comes after slide-9 and not after slide-1", () => {
    expect(slideFiles(["slide-10.jpg", "slide-2.jpg", "slide-1.jpg", "slide-9.jpg", "notes.txt"])).toEqual(["slide-1.jpg", "slide-2.jpg", "slide-9.jpg", "slide-10.jpg"]);
  });
});

describe("jpegSize", () => {
  it("reads the size from the frame header", () => {
    expect(jpegSize(jpeg(1080, 1350))).toEqual({ width: 1080, height: 1350 });
  });
});

describe("isCarousel", () => {
  it("treats a folder with a Reel manifest as a Reel even if it has slides", () => {
    post([[1080, 1350], [1080, 1350]]);
    expect(isCarousel(root, "steal")).toBe(true);
    writeFileSync(join(root, "steal", "manifest.json"), "{}");
    expect(isCarousel(root, "steal")).toBe(false);
  });
});

describe("postCarousel", () => {
  it("refuses an already-posted carousel before uploading or calling Instagram", async () => {
    post([[1080, 1350], [1080, 1350]]);
    writeFileSync(join(root, "steal", "posted.json"), JSON.stringify({ id: "steal", permalink: "https://instagram.com/p/x", postedAt: "2026-11-08T22:00:00Z" }));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(postCarousel("token", root, "steal", () => undefined)).rejects.toThrow(/already posted/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
