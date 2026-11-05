import { describe, expect, it } from "vitest";
import { newScene } from "./edit";
import { addLiftedPart, addStockPart, replaceRoom } from "./editRoom";
import { anchorFor } from "./presets";
import { layersOf } from "./scene";

const base = newScene({ id: "n", title: "N", room: { url: "room-1", width: 2000, height: 1000 } });
const part = { id: "kettle-1", src: "k", width: 600, height: 600 };

describe("replaceRoom", () => {
  it("swaps only the picture's source and keeps every cut-out", () => {
    const withPart = addStockPart(base, part, {});
    const next = replaceRoom(withPart, "room-2");
    expect(layersOf(next)[0].src).toBe("room-2");
    expect(layersOf(next)[1].src).toBe("k");
  });
});

describe("addStockPart", () => {
  it("arrives pinned and moving as its preset says, at the middle of the room", () => {
    // Bug: a torch added from the shelf stands still because the preset was dropped.
    const layer = layersOf(addStockPart(base, part, { hold: "hangs", motion: "Cloth" })).find((l) => l.id === "kettle-1")!;
    expect(layer.anchor).toEqual(anchorFor("hangs"));
    expect(layer.motions?.[0].kind).toBe("billow");
    expect(layer.at).toEqual({ x: 1000, y: 500 });
    expect(layer.shadow).toBeUndefined();
  });
  it("a part with no preset still stands, still, with its shadow", () => {
    const layer = layersOf(addStockPart(base, part, {})).find((l) => l.id === "kettle-1")!;
    expect(layer.anchor).toEqual(anchorFor("stands"));
    expect(layer.motions).toBeUndefined();
    expect(layer.shadow).toBeDefined();
  });
});

describe("addLiftedPart", () => {
  it("stands at its source rect, at its true width, uncapped", () => {
    // Bug: addCutout caps a new file at a quarter of the room, so a big lifted statue came back smaller than it left.
    const rect = { x: 100, y: 200, w: 900, h: 400 };
    const layer = layersOf(addLiftedPart(base, { ...part, width: 900, height: 400 }, rect)).find((l) => l.id === "kettle-1")!;
    expect(layer.width).toBe(900);
    expect(layer.at).toEqual({ x: 550, y: 600 });
    expect(layer.depth).toBe(layersOf(base)[0].depth);
    expect(layer.shadow).toBeUndefined();
  });
});
