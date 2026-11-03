import { describe, expect, it } from "vitest";
import { coveredCells, creaturesInside, originOnToken, snapAreaOrigin } from "./areaTemplates";

const keys = (s: Set<string>) => [...s].sort();

// Hand-worked against the geometry in PHB 2024 "Areas of Effect", with the table ruling that a square counts when at
// least half of it is covered (see areaTemplates.ts).
describe("coveredCells", () => {
  it("a 10 ft sphere on an intersection covers 12 squares: the 4x4 block without its four corners", () => {
    const cells = coveredCells({ shape: "sphere", feet: 10, origin: { x: 0, y: 0 } });
    expect(cells.size).toBe(12);
    // The corner squares are covered by under half (about a quarter), so they are out.
    for (const corner of ["-2,-2", "1,-2", "-2,1", "1,1"]) expect(cells.has(corner)).toBe(false);
    // The squares touching the centre are in.
    for (const near of ["-1,-1", "0,-1", "-1,0", "0,0"]) expect(cells.has(near)).toBe(true);
  });

  it("a 15 ft cube centred on a square covers exactly the 3x3 around it", () => {
    const origin = snapAreaOrigin("cube", 15, { x: 4.2, y: 4.9 });
    expect(keys(coveredCells({ shape: "cube", feet: 15, origin }))).toEqual(
      ["3,3", "4,3", "5,3", "3,4", "4,4", "5,4", "3,5", "4,5", "5,5"].sort(),
    );
  });

  it("a 10 ft cube centred on an intersection covers the 2x2 around it", () => {
    expect(keys(coveredCells({ shape: "cube", feet: 10, origin: { x: 2, y: 2 } }))).toEqual(["1,1", "1,2", "2,1", "2,2"]);
  });

  it("a 30 ft line is five wide in squares, six long, and nothing beside it", () => {
    // From the left edge of row 0, pointing east: row 0 is 5 ft wide centred on y = 0.5.
    const cells = coveredCells({ shape: "line", feet: 30, origin: { x: 0, y: 0.5 }, aim: { x: 10, y: 0.5 } });
    expect(keys(cells)).toEqual(["0,0", "1,0", "2,0", "3,0", "4,0", "5,0"]);
  });

  it("a 15 ft cone widens as it goes: its width at a point equals the distance from its origin", () => {
    // Origin on an intersection pointing east. Column 0 is a sliver (a quarter of each square), column 1 three quarters,
    // column 2 is full on the two middle rows, and only a quarter of the rows beyond them.
    const cells = coveredCells({ shape: "cone", feet: 15, origin: { x: 0, y: 0 }, aim: { x: 5, y: 0 } });
    expect(keys(cells)).toEqual(["1,-1", "1,0", "2,-1", "2,0"]);
  });

  it("a cone points where it is aimed, not always east", () => {
    const east = coveredCells({ shape: "cone", feet: 15, origin: { x: 0, y: 0 }, aim: { x: 5, y: 0 } });
    const south = coveredCells({ shape: "cone", feet: 15, origin: { x: 0, y: 0 }, aim: { x: 0, y: 5 } });
    expect(keys(south)).toEqual(["-1,1", "-1,2", "0,1", "0,2"]);
    expect(south).not.toEqual(east);
  });

  it("a cone with no aim, or aimed at its own origin, covers nothing", () => {
    expect(coveredCells({ shape: "cone", feet: 15, origin: { x: 0, y: 0 } }).size).toBe(0);
    expect(coveredCells({ shape: "line", feet: 15, origin: { x: 1, y: 1 }, aim: { x: 1, y: 1 } }).size).toBe(0);
  });
});

describe("snapAreaOrigin", () => {
  it("sets a sphere on the nearest intersection", () => {
    expect(snapAreaOrigin("sphere", 20, { x: 3.4, y: 2.6 })).toEqual({ x: 3, y: 3 });
  });
  it("sets an odd cube on a square's middle and an even one on an intersection", () => {
    expect(snapAreaOrigin("cube", 15, { x: 3.9, y: 2.1 })).toEqual({ x: 3.5, y: 2.5 });
    expect(snapAreaOrigin("cube", 20, { x: 3.9, y: 2.1 })).toEqual({ x: 4, y: 2 });
  });
});

describe("originOnToken", () => {
  it("starts a cone on the edge of the caster's square facing the aim, so the caster is not in it", () => {
    // A Medium token at 2,2 (middle 2.5,2.5), aimed due east: leaves through the right edge, x = 3.
    expect(originOnToken({ position: { x: 2, y: 2 }, footprint: 1 }, { x: 9, y: 2.5 })).toEqual({ x: 3, y: 2.5 });
  });
  it("leaves a Large token by its own, wider edge", () => {
    expect(originOnToken({ position: { x: 2, y: 2 }, footprint: 2 }, { x: 3, y: 9 })).toEqual({ x: 3, y: 4 });
  });
  it("on a diagonal aim, leaves by the corner", () => {
    expect(originOnToken({ position: { x: 0, y: 0 }, footprint: 1 }, { x: 5.5, y: 5.5 })).toEqual({ x: 1, y: 1 });
  });
});

describe("creaturesInside", () => {
  const covered = new Set(["3,3", "4,3"]);
  it("counts a creature standing on any covered square, and none that stand beside it", () => {
    expect(
      creaturesInside(covered, [
        { id: "in", position: { x: 4, y: 3 }, footprint: 1 },
        { id: "out", position: { x: 5, y: 3 }, footprint: 1 },
      ]),
    ).toEqual(["in"]);
  });
  it("a Large creature with one corner in the area is inside", () => {
    expect(creaturesInside(covered, [{ id: "big", position: { x: 4, y: 2 }, footprint: 2 }])).toEqual(["big"]);
  });
  it("a Tiny creature stands in the one square it is in", () => {
    expect(creaturesInside(covered, [{ id: "mouse", position: { x: 3.5, y: 3.5 }, footprint: 0.5 }])).toEqual(["mouse"]);
  });
});
