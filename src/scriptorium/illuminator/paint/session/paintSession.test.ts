import { describe, expect, it } from "vitest";
import type { PaintAssets, PenSample } from "../engine/types";
import type { TiledLayer } from "../engine/tiledLayer";
import { createPaintSession } from "./paintSession";
import type { PaintLayer, PictureLayer } from "./types";

const assets: PaintAssets = { tip: () => undefined, grain: () => undefined };
const sample = (x: number, y: number): PenSample => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0, time: 0, pointer: "pen" });

function make(picture = true) {
  return createPaintSession({ width: 128, height: 128, paper: null, picture, assets });
}
type Session = ReturnType<typeof make>;

function stroke(s: Session, x = 40, y = 40, opts?: { restore?: boolean }) {
  const id = s.beginStroke(sample(x, y), opts)?.layerId;
  s.addSamples([sample(x + 4, y), sample(x + 8, y)]);
  s.endStroke();
  return id;
}
const paintLayers = (s: Session) => s.state.doc.layers.filter((l): l is PaintLayer => l.kind === "paint");
const alpha = (t: TiledLayer, x: number, y: number) =>
  t.tile(t.key(Math.floor(x / t.tileSize), Math.floor(y / t.tileSize)))?.[((y % t.tileSize) * t.tileSize + (x % t.tileSize)) * 4 + 3] ?? 0;
const dump = (t: TiledLayer) =>
  t
    .keys()
    .sort((a, b) => a - b)
    .map((k) => [k, Array.from(t.tile(k) ?? [])]);
const picture = (s: Session) => s.state.doc.layers[0] as PictureLayer;

describe("strokes by tool and layer", () => {
  // Fails if a brush stroke on the picture paints the picture or nothing, instead of a new layer above it; and if undo does not take the stroke, then the layer, in that order.
  it("brushing on the picture makes a layer above it, paints there, and undoes stroke then layer", () => {
    const s = make();
    const id = stroke(s);
    expect(s.state.doc.layers.map((l) => l.id)).toEqual(["picture", id]);
    expect(s.state.activeLayerId).toBe(id);
    const layer = paintLayers(s)[0] as PaintLayer;
    expect(alpha(layer.pixels, 44, 40)).toBeGreaterThan(0);
    expect(picture(s).mask.keys()).toEqual([]);
    s.undo();
    expect(s.state.doc.layers).toHaveLength(2);
    expect(alpha(layer.pixels, 44, 40)).toBe(0);
    s.undo();
    expect(s.state.doc.layers.map((l) => l.id)).toEqual(["picture"]);
    expect(s.state.activeLayerId).toBe("picture");
    expect(s.canUndo).toBe(false);
  });

  // Fails if the eraser on the picture paints the picture's colour away, or restore does not take the mask back.
  it("the eraser on the picture writes the mask and restore removes it", () => {
    const s = make();
    s.state.tool = "eraser";
    stroke(s);
    expect(alpha(picture(s).mask, 44, 40)).toBeGreaterThan(200);
    expect(paintLayers(s)).toHaveLength(0);
    stroke(s, 40, 40, { restore: true });
    expect(alpha(picture(s).mask, 44, 40)).toBe(0);
  });

  // Fails if the eraser on a paint layer adds paint instead of lowering alpha.
  it("the eraser on a paint layer lowers alpha", () => {
    const s = make(false);
    const layer = paintLayers(s)[0] as PaintLayer;
    stroke(s);
    const painted = alpha(layer.pixels, 44, 40);
    s.state.tool = "eraser";
    stroke(s);
    expect(painted).toBeGreaterThan(200);
    expect(alpha(layer.pixels, 44, 40)).toBeLessThan(painted / 2);
  });

  // Fails if the picker begins a stroke.
  it("the picker never strokes", () => {
    const s = make(false);
    s.state.tool = "picker";
    expect(s.beginStroke(sample(10, 10))).toBeNull();
    expect(s.canUndo).toBe(false);
  });

  // Fails if the lock on the layer is not handed to the engine.
  it("a locked layer takes no paint on empty pixels", () => {
    const s = make(false);
    const layer = paintLayers(s)[0] as PaintLayer;
    s.setLayerProps(layer.id, { lockAlpha: true });
    stroke(s);
    expect(layer.pixels.keys()).toEqual([]);
  });

  // Fails if the options bar's size is ignored.
  it("the tool's overrides reach the stroke", () => {
    const small = make(false);
    small.state.overrides.brush = { size: 4 };
    stroke(small);
    const big = make(false);
    big.state.overrides.brush = { size: 80 };
    stroke(big);
    expect(alpha((paintLayers(big)[0] as PaintLayer).pixels, 44, 46)).toBeGreaterThan(0);
    expect(alpha((paintLayers(small)[0] as PaintLayer).pixels, 44, 46)).toBe(0);
  });
});

describe("one history", () => {
  // Fails if undo is per layer: it must come back in the order things happened, across layers.
  it("undo and redo across two layers follow the order of events", () => {
    const s = make(false);
    const a = paintLayers(s)[0] as PaintLayer;
    stroke(s, 20, 20);
    const b = s.addLayer();
    stroke(s, 60, 60);
    expect(s.undo()?.layerIds).toEqual([b.id]);
    expect(alpha(b.pixels, 64, 60)).toBe(0);
    expect(alpha(a.pixels, 24, 20)).toBeGreaterThan(0);
    expect(s.undo()?.layerIds).toContain(b.id);
    expect(s.state.doc.layers).toHaveLength(1);
    expect(s.undo()?.layerIds).toEqual([a.id]);
    expect(alpha(a.pixels, 24, 20)).toBe(0);
    s.redo();
    s.redo();
    expect(s.state.doc.layers).toHaveLength(2);
    s.redo();
    expect(alpha(b.pixels, 64, 60)).toBeGreaterThan(0);
    expect(s.canRedo).toBe(false);
  });

  // Fails if the oldest entry is kept past the limit (memory grows forever) or the newest dropped.
  it("drops the oldest entry past 100", () => {
    const s = make(false);
    for (let i = 0; i < 105; i++) stroke(s, 10 + (i % 50), 10 + Math.floor(i / 50) * 20);
    let undone = 0;
    while (s.undo()) undone++;
    expect(undone).toBe(100);
  });

  // Fails if redo survives a new action, which would redo into a history that no longer happened.
  it("a new action clears redo", () => {
    const s = make(false);
    stroke(s);
    s.undo();
    expect(s.canRedo).toBe(true);
    stroke(s, 80, 80);
    expect(s.canRedo).toBe(false);
    expect(s.redo()).toBeNull();
  });

  // Fails if a property change is not undoable or an unchanged one is recorded.
  it("layer props undo, and setting the same value records nothing", () => {
    const s = make(false);
    const l = paintLayers(s)[0] as PaintLayer;
    s.setLayerProps(l.id, { opacity: 1 });
    expect(s.canUndo).toBe(false);
    s.setLayerProps(l.id, { opacity: 0.4, blend: "multiply" });
    expect(s.undo()?.layerIds).toEqual([l.id]);
    expect(l.opacity).toBe(1);
    expect(l.blend).toBe("source-over");
    s.redo();
    expect(l.opacity).toBe(0.4);
  });

  // Fails if moving a layer cannot be undone, or the picture can be moved off the bottom.
  it("moves a layer, never past the picture, and undoes it", () => {
    const s = make();
    const a = s.addLayer();
    const b = s.addLayer();
    s.moveLayer(b.id, 0);
    expect(s.state.doc.layers.map((l) => l.id)).toEqual(["picture", b.id, a.id]);
    s.moveLayer("picture", 2);
    expect(s.state.doc.layers[0]?.id).toBe("picture");
    s.undo();
    expect(s.state.doc.layers.map((l) => l.id)).toEqual(["picture", a.id, b.id]);
  });
});

describe("merge down and delete", () => {
  // Fails if merge ignores the upper layer's blend (multiply must darken), leaves the layer behind, or undo is not exact.
  it("merge down with multiply darkens, removes the upper layer, and undo restores both exactly", () => {
    const s = make(false);
    const lower = paintLayers(s)[0] as PaintLayer;
    s.state.colour = { r: 200, g: 200, b: 200 };
    stroke(s);
    const upper = s.addLayer();
    s.state.colour = { r: 128, g: 128, b: 128 };
    stroke(s);
    s.setLayerProps(upper.id, { blend: "multiply" });
    const lowerBefore = dump(lower.pixels);
    const upperBefore = dump(upper.pixels);
    const redAt = (l: PaintLayer) => l.pixels.tile(0)?.[(40 * 256 + 44) * 4] ?? 0;
    const was = redAt(lower);
    s.mergeDown(upper.id);
    expect(s.state.doc.layers.map((l) => l.id)).toEqual([lower.id]);
    expect(redAt(lower)).toBeLessThan(was - 40);
    expect(s.state.activeLayerId).toBe(lower.id);
    expect(s.undo()?.layerIds).toEqual(expect.arrayContaining([lower.id, upper.id]));
    expect(s.state.doc.layers.map((l) => l.id)).toEqual([lower.id, upper.id]);
    expect(dump(lower.pixels)).toEqual(lowerBefore);
    expect(dump(upper.pixels)).toEqual(upperBefore);
    s.redo();
    expect(redAt(lower)).toBeLessThan(was - 40);
  });

  // Fails if merging onto the picture moves paint into a layer that is never painted on.
  it("merge down onto the picture does nothing", () => {
    const s = make();
    stroke(s);
    s.mergeDown(s.state.activeLayerId);
    expect(s.state.doc.layers).toHaveLength(2);
  });

  // Fails if delete loses the pixels or the place: undo must bring the same layer back at the same index.
  it("delete then undo restores pixels and position", () => {
    const s = make();
    const a = s.addLayer();
    stroke(s, 20, 20);
    const b = s.addLayer();
    const before = dump(a.pixels);
    s.deleteLayer(a.id);
    expect(s.state.doc.layers.map((l) => l.id)).toEqual(["picture", b.id]);
    s.undo();
    expect(s.state.doc.layers.map((l) => l.id)).toEqual(["picture", a.id, b.id]);
    expect(dump(a.pixels)).toEqual(before);
    s.redo();
    expect(s.state.doc.layers).toHaveLength(2);
  });

  // Fails if a blank sheet can be left with nothing to paint on, or the picture deleted.
  it("keeps the last layer of a blank sheet and the picture", () => {
    const blank = make(false);
    blank.deleteLayer((paintLayers(blank)[0] as PaintLayer).id);
    expect(blank.state.doc.layers).toHaveLength(1);
    const s = make();
    s.deleteLayer("picture");
    expect(s.state.doc.layers).toHaveLength(1);
  });
});

describe("stroke results and what the panels may offer", () => {
  // Fails if a lone tap's end returns nothing: the dab of a tap can land at the end, and the canvas would never redraw it.
  it("endStroke returns the tiles a tap changed, and beginStroke names the layer", () => {
    const s = make(false);
    const begun = s.beginStroke(sample(40, 40));
    expect(begun?.layerId).toBe((paintLayers(s)[0] as PaintLayer).id);
    const ended = s.endStroke();
    expect(ended.length).toBeGreaterThan(0);
    expect(s.endStroke()).toEqual([]);
  });

  // Fails if the panel is offered Delete or Merge where the session would refuse: the picture, the last layer of a blank sheet, a merge onto the picture.
  it("canDelete and canMergeDown refuse what the session refuses", () => {
    const s = make();
    const a = s.addLayer();
    const b = s.addLayer();
    expect(s.canDelete("picture")).toBe(false);
    expect(s.canMergeDown(a.id)).toBe(false);
    expect(s.canMergeDown(b.id)).toBe(true);
    expect(s.canDelete(b.id)).toBe(true);
    const blank = make(false);
    const only = paintLayers(blank)[0] as PaintLayer;
    expect(blank.canDelete(only.id)).toBe(false);
    expect(blank.canMergeDown(only.id)).toBe(false);
    blank.addLayer();
    expect(blank.canDelete(only.id)).toBe(true);
  });
});

describe("recent colours", () => {
  // Fails if recents duplicate, grow past 12, or are not newest first.
  it("dedupes, puts the newest first, and caps at 12", () => {
    const s = make(false);
    for (let i = 0; i < 14; i++) {
      s.state.colour = { r: i, g: 0, b: 0 };
      stroke(s, 10, 10 + i * 6);
    }
    s.state.colour = { r: 5, g: 0, b: 0 };
    stroke(s, 100, 10);
    expect(s.state.recent).toHaveLength(12);
    expect(s.state.recent[0]).toEqual({ r: 5, g: 0, b: 0 });
    expect(s.state.recent.filter((c) => c.r === 5)).toHaveLength(1);
  });

  // Fails if erasing records a colour the user did not paint with.
  it("only a brush stroke adds a recent colour", () => {
    const s = make(false);
    s.state.tool = "eraser";
    stroke(s);
    expect(s.state.recent).toEqual([]);
  });
});
