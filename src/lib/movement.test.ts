import { describe, it, expect } from "vitest";
import { parseSpeed } from "./movement";

describe("parseSpeed", () => {
  it("returns [] for nullish/empty", () => {
    expect(parseSpeed(null)).toEqual([]);
    expect(parseSpeed("")).toEqual([]);
  });

  it("parses a plain walk speed", () => {
    expect(parseSpeed("30 ft.")).toEqual([{ mode: "walk", value: "30" }]);
  });

  it("parses walk + a special mode", () => {
    expect(parseSpeed("30 ft., fly 60 ft.")).toEqual([
      { mode: "walk", value: "30" },
      { mode: "fly", value: "60" },
    ]);
  });

  it("parses several modes in order", () => {
    expect(parseSpeed("walk 30 ft., climb 30 ft., swim 30 ft., burrow 20 ft.")).toEqual([
      { mode: "walk", value: "30" },
      { mode: "climb", value: "30" },
      { mode: "swim", value: "30" },
      { mode: "burrow", value: "20" },
    ]);
  });

  it("renders a hovering flyer as a single hover icon + value, dropping 0-ft walk", () => {
    expect(parseSpeed("0 ft., fly 50 ft. (hover)")).toEqual([
      { mode: "hover", value: "50" },
    ]);
  });

  it("keeps a lone walk even at 0 ft", () => {
    expect(parseSpeed("0 ft.")).toEqual([{ mode: "walk", value: "0" }]);
  });
});
