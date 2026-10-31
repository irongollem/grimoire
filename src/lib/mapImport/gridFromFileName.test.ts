import { describe, expect, it } from "vitest";
import { gridFromFileName, pixelsPerCellFromFileName } from "./gridFromFileName";

// app convention: the shapes below are how map creators name their exports.
describe("gridFromFileName", () => {
  it.each([
    ["riverside-ambush_30x20.webm", 30, 20],
    ["Forest Glade [22x30].jpg", 22, 30],
    ["cave 40 x 30 gridless.png", 40, 30],
    ["map(30X20).webp", 30, 20],
    ["tavern_30×20.png", 30, 20],
  ])("reads %s", (name, cols, rows) => {
    expect(gridFromFileName(name)).toEqual({ cols, rows });
  });

  it("does not take a screen resolution for a grid", () => {
    expect(gridFromFileName("keep_1920x1080.png")).toBeNull();
  });

  it("ignores a resolution but still finds the grid beside it", () => {
    expect(gridFromFileName("keep_30x20_1920x1080.png")).toEqual({ cols: 30, rows: 20 });
  });

  it("rejects a zero side and one past 200 cells", () => {
    expect(gridFromFileName("a_0x20.png")).toBeNull();
    expect(gridFromFileName("a_201x20.png")).toBeNull();
    expect(gridFromFileName("a_200x20.png")).toEqual({ cols: 200, rows: 20 });
  });

  it("refuses a name that holds two different sizes, but not the same size twice", () => {
    expect(gridFromFileName("a_30x20_40x30.png")).toBeNull();
    expect(gridFromFileName("a_30x20 copy 30x20.png")).toEqual({ cols: 30, rows: 20 });
  });

  it("does not read a year or a plain number as a grid, nor cut 2030x20 down to 30x20", () => {
    expect(gridFromFileName("campaign 2024 map.png")).toBeNull();
    expect(gridFromFileName("a_2030x20.png")).toBeNull();
  });
});

describe("pixelsPerCellFromFileName", () => {
  it.each([
    ["foo_100ppi.png", 100],
    ["foo 140 ppi.png", 140],
    ["foo_70px.png", 70],
    ["foo_72dpi.png", 72],
  ])("reads %s", (name, n) => {
    expect(pixelsPerCellFromFileName(name)).toBe(n);
  });

  it("ignores a width in pixels and conflicting hints", () => {
    expect(pixelsPerCellFromFileName("foo_4096px.png")).toBeNull();
    expect(pixelsPerCellFromFileName("foo_10px.png")).toBeNull();
    expect(pixelsPerCellFromFileName("foo_70px_140ppi.png")).toBeNull();
  });
});
