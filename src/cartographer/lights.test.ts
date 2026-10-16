import { describe, it, expect } from "vitest";
import { lightReachCells, lightRgba, lightStops } from "./lights";
import { DEFAULT_LIGHT_INTENSITY } from "@/cartographer/packSchema";

describe("lightRgba", () => {
  it("turns a hex colour and an alpha into an rgba string", () => {
    expect(lightRgba("#ff8030", 0.5)).toBe("rgba(255,128,48,0.5)");
    expect(lightRgba("#000000", 0)).toBe("rgba(0,0,0,0)");
  });

  it("trims float noise from the alpha", () => {
    expect(lightRgba("#ffffff", 0.55 * 0.45)).toBe("rgba(255,255,255,0.248)");
  });
});

describe("lightReachCells", () => {
  it("adds the bright radius and the dim ring, at five feet a cell", () => {
    expect(lightReachCells({ color: "#ff8030", bright: 20, dim: 20 })).toBe(8);
    expect(lightReachCells({ color: "#ff8030", bright: 0, dim: 5 })).toBe(1);
  });
});

describe("lightStops", () => {
  it("is strongest at the flame, falls fast through the bright light and fades to nothing through the dim ring", () => {
    expect(lightStops({ color: "#ff0000", bright: 30, dim: 30, intensity: 1 })).toEqual([
      [0, "rgba(255,0,0,1)"],
      [0.125, "rgba(255,0,0,0.55)"],
      [0.5, "rgba(255,0,0,0.22)"],
      [1, "rgba(255,0,0,0)"],
    ]);
  });

  it("puts the bright edge where the rules put it: a lamp's 15 feet of 45", () => {
    expect(lightStops({ color: "#ff0000", bright: 15, dim: 30 })[2][0]).toBeCloseTo(1 / 3);
  });

  it("fades a dim-only light (a glowing mushroom) the whole way from a softer start", () => {
    expect(lightStops({ color: "#00ff00", bright: 0, dim: 20, intensity: 1 })).toEqual([
      [0, "rgba(0,255,0,0.5)"],
      [0.3, "rgba(0,255,0,0.2)"],
      [1, "rgba(0,255,0,0)"],
    ]);
  });

  it("ends a light with no dim ring at its bright edge", () => {
    const stops = lightStops({ color: "#0000ff", bright: 10, dim: 0, intensity: 1 });
    expect(stops.at(-1)).toEqual([1, "rgba(0,0,255,0.22)"]);
  });

  it("uses the default intensity when none is given", () => {
    expect(lightStops({ color: "#00ff00", bright: 20, dim: 20 })[0][1]).toBe(`rgba(0,255,0,${DEFAULT_LIGHT_INTENSITY})`);
  });
});
