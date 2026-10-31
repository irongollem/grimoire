import { describe, expect, it } from "vitest";
import { panToKeepInView } from "./follow";

describe("panToKeepInView", () => {
  // A token well inside the screen must not move the map, or the picture would drift on every step it takes.
  it("leaves the map alone while the token is comfortably on screen", () => {
    expect(panToKeepInView({ hostW: 1000, hostH: 600, centre: { x: 620, y: 360 } })).toEqual({ dx: 0, dy: 0 });
  });

  // #1125 decision 15: it follows the turn. A token past the right edge brings the map left so it sits in the middle.
  it("brings a token that has left the screen back to the middle", () => {
    expect(panToKeepInView({ hostW: 1000, hostH: 600, centre: { x: 1300, y: 300 } })).toEqual({ dx: -800, dy: 0 });
  });

  it("pulls a token that is only near an edge back as well, on the vertical axis too", () => {
    expect(panToKeepInView({ hostW: 1000, hostH: 600, centre: { x: 500, y: 40 } })).toEqual({ dx: 0, dy: 260 });
  });
});
