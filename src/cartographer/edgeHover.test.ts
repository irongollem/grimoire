import { describe, it, expect } from "vitest";
import { detectHoveredEdge } from "./edgeHover";

// World-coordinate hover detection. tileSize is in pixels, threshold is the
// fraction of a tile width within which the cursor "snaps" to the nearest
// edge. Center of the cell → null (no edge targeted).
const TILE = 128;
const THRESHOLD = 0.25;

describe("detectHoveredEdge — pointer-to-edge resolution", () => {
  it("returns null when the cursor sits in the cell centre", () => {
    expect(detectHoveredEdge(64, 64, TILE, THRESHOLD)).toBeNull();
  });

  it("snaps to N when the cursor is near the top of cell (0,0)", () => {
    expect(detectHoveredEdge(60, 5, TILE, THRESHOLD)).toEqual({ x: 0, y: 0, side: "N" });
  });

  it("snaps to S when the cursor is near the bottom of cell (0,0)", () => {
    expect(detectHoveredEdge(60, 120, TILE, THRESHOLD)).toEqual({ x: 0, y: 0, side: "S" });
  });

  it("snaps to W when the cursor is near the left edge of cell (0,0)", () => {
    expect(detectHoveredEdge(8, 64, TILE, THRESHOLD)).toEqual({ x: 0, y: 0, side: "W" });
  });

  it("snaps to E when the cursor is near the right edge of cell (0,0)", () => {
    expect(detectHoveredEdge(120, 64, TILE, THRESHOLD)).toEqual({ x: 0, y: 0, side: "E" });
  });

  it("picks the nearer edge when the cursor is near a corner", () => {
    // Cursor at (5, 8) of cell (0,0) — closer to top (y=8) than left (x=5)?
    // dy=8 < dx=5? No, dx=5 < dy=8. So nearest edge is W.
    expect(detectHoveredEdge(5, 8, TILE, THRESHOLD)).toEqual({ x: 0, y: 0, side: "W" });
    // Cursor at (8, 5): dy=5 < dx=8 → N wins
    expect(detectHoveredEdge(8, 5, TILE, THRESHOLD)).toEqual({ x: 0, y: 0, side: "N" });
  });

  it("reports the cell the cursor is over, regardless of which edge", () => {
    // Cursor at (128 + 60, 5) → cell (1,0), near top → N
    expect(detectHoveredEdge(188, 5, TILE, THRESHOLD)).toEqual({ x: 1, y: 0, side: "N" });
  });

  it("handles negative world coordinates", () => {
    // Cursor at (-100, 5): floor(-100/128) = -1, so cell x = -1.
    // Within-cell x = -100 - (-128) = 28. dx=28 < dy=5? No, dy=5 < dx=28 → N.
    expect(detectHoveredEdge(-100, 5, TILE, THRESHOLD)).toEqual({ x: -1, y: 0, side: "N" });
  });

  it("snaps wider with a larger threshold", () => {
    // Cursor 40px from top of a 128px tile — outside 0.25 (32px) but inside 0.4 (51px)
    expect(detectHoveredEdge(64, 40, TILE, 0.25)).toBeNull();
    expect(detectHoveredEdge(64, 40, TILE, 0.4)).toEqual({ x: 0, y: 0, side: "N" });
  });
});
