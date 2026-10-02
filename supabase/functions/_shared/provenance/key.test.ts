import { describe, it, expect } from "vitest";
import { imageProvenanceStem } from "./key";

describe("imageProvenanceStem", () => {
  it("drops the extension of a plain original", () => {
    expect(imageProvenanceStem("u/abc.webp")).toBe("u/abc");
  });

  it("gives the original and every variant width the same stem", () => {
    for (const w of [200, 400, 800, 1200]) {
      expect(imageProvenanceStem(`u/abc_w${w}.webp`)).toBe("u/abc");
    }
  });

  it("handles .jpeg and .png originals", () => {
    expect(imageProvenanceStem("u/abc.jpeg")).toBe("u/abc");
    expect(imageProvenanceStem("u/abc.png")).toBe("u/abc");
  });

  it("ignores dots in folder names", () => {
    expect(imageProvenanceStem("u.v1/sub.dir/abc.webp")).toBe("u.v1/sub.dir/abc");
    expect(imageProvenanceStem("u.v1/abc_w400.webp")).toBe("u.v1/abc");
  });

  it("leaves a path with no extension alone", () => {
    expect(imageProvenanceStem("u/abc")).toBe("u/abc");
    expect(imageProvenanceStem("u.v1/abc")).toBe("u.v1/abc");
  });

  it("keeps a name that merely contains _w", () => {
    expect(imageProvenanceStem("u/new_wizard.webp")).toBe("u/new_wizard");
    expect(imageProvenanceStem("u/new_wizard_w400.webp")).toBe("u/new_wizard");
    expect(imageProvenanceStem("u/scene_w.webp")).toBe("u/scene_w");
  });
});
