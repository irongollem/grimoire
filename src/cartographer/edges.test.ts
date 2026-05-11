import { describe, it, expect } from "vitest";
import { canonicaliseEdge, otherEnd } from "./edges";

describe("canonicaliseEdge — NW ownership rule", () => {
  it("a north edge stays on the same cell as wallN", () => {
    expect(canonicaliseEdge(5, 5, "N")).toEqual({ x: 5, y: 5, side: "N" });
  });

  it("a west edge stays on the same cell as wallW", () => {
    expect(canonicaliseEdge(5, 5, "W")).toEqual({ x: 5, y: 5, side: "W" });
  });

  it("a south edge is owned by the cell below as its N edge", () => {
    expect(canonicaliseEdge(5, 5, "S")).toEqual({ x: 5, y: 6, side: "N" });
  });

  it("an east edge is owned by the cell to the right as its W edge", () => {
    expect(canonicaliseEdge(5, 5, "E")).toEqual({ x: 6, y: 5, side: "W" });
  });

  it("handles negative cell coordinates (infinite canvas)", () => {
    expect(canonicaliseEdge(-3, -7, "S")).toEqual({ x: -3, y: -6, side: "N" });
    expect(canonicaliseEdge(-3, -7, "E")).toEqual({ x: -2, y: -7, side: "W" });
  });

  it("handles origin", () => {
    expect(canonicaliseEdge(0, 0, "N")).toEqual({ x: 0, y: 0, side: "N" });
    expect(canonicaliseEdge(0, 0, "W")).toEqual({ x: 0, y: 0, side: "W" });
    expect(canonicaliseEdge(0, 0, "S")).toEqual({ x: 0, y: 1, side: "N" });
    expect(canonicaliseEdge(0, 0, "E")).toEqual({ x: 1, y: 0, side: "W" });
  });
});

describe("otherEnd — round-trip from canonical owner to the originating cell", () => {
  // If we canonicalise (5, 5, "S") → (5, 6, "N"), the "other end" of that
  // canonical edge is (5, 5). Useful for hover-highlight rendering when the
  // visual focus stays on whichever cell the user pointed at.
  it("the cell above owns a north edge; the cell below sees it as S", () => {
    expect(otherEnd({ x: 5, y: 6, side: "N" })).toEqual({ x: 5, y: 5, side: "S" });
  });
  it("the cell to the right owns a west edge; the cell to the left sees it as E", () => {
    expect(otherEnd({ x: 6, y: 5, side: "W" })).toEqual({ x: 5, y: 5, side: "E" });
  });
});
