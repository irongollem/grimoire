import { describe, it, expect } from "vitest";
import { normalizeTag } from "./tags";

describe("normalizeTag", () => {
  it("lowercases", () => {
    expect(normalizeTag("Icewind Dale")).toBe("icewind-dale");
  });

  it("turns spaces and underscores into hyphens", () => {
    expect(normalizeTag("council of_speakers")).toBe("council-of-speakers");
  });

  it("strips anything that isn't a-z, 0-9 or hyphen", () => {
    expect(normalizeTag("Frostbite!! (cold)")).toBe("frostbite-cold");
  });

  it("collapses repeated hyphens", () => {
    expect(normalizeTag("a -- b")).toBe("a-b");
  });

  it("trims leading and trailing hyphens", () => {
    expect(normalizeTag("  -icewind-  ")).toBe("icewind");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTag("  icewind dale  ")).toBe("icewind-dale");
  });

  it("returns empty string for input with nothing left to keep", () => {
    expect(normalizeTag("!!!")).toBe("");
  });

  it("leaves an already-normalized tag alone", () => {
    expect(normalizeTag("frostbite")).toBe("frostbite");
  });
});
