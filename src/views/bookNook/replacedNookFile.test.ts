import { describe, expect, it } from "vitest";
import { isOrphanedOwnNookFile } from "./replacedNookFile";

const own = "https://cdn.example.invalid/location-images/u1/nooks/n1/a.webp";

describe("isOrphanedOwnNookFile", () => {
  it("frees this nook's own file once no layer uses it", () => {
    expect(isOrphanedOwnNookFile(own, "n1", { stack: [{ src: "other.webp" }] })).toBe(true);
  });
  it("keeps a file a layer still uses", () => {
    // Bug: replacing the room could delete a file another layer still drew.
    expect(isOrphanedOwnNookFile(own, "n1", { stack: [{ src: own }] })).toBe(false);
  });
  it("never frees a stock part, a place's picture or another nook's file", () => {
    // Bug: replacing the room with a stock-sourced picture would have removed the shared library art.
    expect(isOrphanedOwnNookFile("https://cdn.example.invalid/location-images/srd/x.webp", "n1", {})).toBe(false);
    expect(isOrphanedOwnNookFile("https://cdn.example.invalid/location-images/u1/place.webp", "n1", {})).toBe(false);
    expect(isOrphanedOwnNookFile(own.replace("/n1/", "/n2/"), "n1", {})).toBe(false);
  });
  it("frees nothing for a missing url", () => {
    expect(isOrphanedOwnNookFile(null, "n1", {})).toBe(false);
  });
});
