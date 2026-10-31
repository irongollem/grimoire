import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { renderBattlefieldPng } from "./dev-showcase-picture";

describe("renderBattlefieldPng", () => {
  const png = renderBattlefieldPng(64, 48);

  it("writes a PNG whose header carries the size the grid calibration will assume", () => {
    // A wrong IHDR width would calibrate the grid against a different image than the one shown.
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(64);
    expect(png.readUInt32BE(20)).toBe(48);
  });

  it("holds exactly one filtered scanline per row once inflated, so a browser decodes it", () => {
    const idatLength = png.readUInt32BE(33);
    const data = png.subarray(41, 41 + idatLength);
    expect(inflateSync(data)).toHaveLength((64 * 3 + 1) * 48);
  });

  it("is the same picture every run", () => {
    expect(renderBattlefieldPng(64, 48).equals(png)).toBe(true);
  });
});
