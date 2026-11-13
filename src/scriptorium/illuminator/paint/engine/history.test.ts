import { describe, expect, it } from "vitest";
import { PaintHistory } from "./history";
import type { UndoRecord } from "./stroke";
import { TiledLayer } from "./tiledLayer";

function paintTile(layer: TiledLayer, key: number, v: number): UndoRecord {
  const old = layer.tile(key);
  const record: UndoRecord = { tiles: new Map([[key, old ? old.slice() : null]]) };
  layer.ensureTile(key).fill(v);
  return record;
}

describe("PaintHistory", () => {
  // Fails if undo does not delete a tile the stroke created, or redo does not bring it back byte for byte.
  it("undo removes a created tile and redo restores it exactly", () => {
    const layer = new TiledLayer(64, 64, 32);
    const h = new PaintHistory();
    h.push(layer, paintTile(layer, 0, 77));
    expect(h.undo(layer)).toEqual([0]);
    expect(layer.tile(0)).toBeUndefined();
    h.redo(layer);
    expect(Array.from(layer.tile(0) ?? [])).toEqual(Array.from({ length: 32 * 32 * 4 }, () => 77));
  });

  // Fails if undo restores a blank tile instead of the previous pixels.
  it("undo restores the previous pixels of an existing tile", () => {
    const layer = new TiledLayer(64, 64, 32);
    layer.ensureTile(0).fill(5);
    const h = new PaintHistory();
    h.push(layer, paintTile(layer, 0, 99));
    h.undo(layer);
    expect(layer.tile(0)?.[0]).toBe(5);
    h.redo(layer);
    expect(layer.tile(0)?.[0]).toBe(99);
    h.undo(layer);
    expect(layer.tile(0)?.[0]).toBe(5);
  });

  // Fails if a new stroke keeps the old redo branch alive, so redo replays a stroke from a dead timeline.
  it("a new push clears redo", () => {
    const layer = new TiledLayer(64, 64, 32);
    const h = new PaintHistory();
    h.push(layer, paintTile(layer, 0, 1));
    h.undo(layer);
    expect(h.canRedo(layer)).toBe(true);
    h.push(layer, paintTile(layer, 1, 2));
    expect(h.canRedo(layer)).toBe(false);
  });

  // Fails if the limit is not enforced, or drops the newest record instead of the oldest.
  it("pushing past the limit drops the oldest record", () => {
    const layer = new TiledLayer(64, 64, 32);
    const h = new PaintHistory(2);
    h.push(layer, paintTile(layer, 0, 1));
    h.push(layer, paintTile(layer, 1, 2));
    h.push(layer, paintTile(layer, 2, 3));
    expect(h.undo(layer)).toEqual([2]);
    expect(h.undo(layer)).toEqual([1]);
    expect(h.undo(layer)).toBeNull();
    expect(layer.tile(0)).toBeDefined();
  });

  // Fails if histories are shared between layers, so undoing one layer edits another.
  it("keeps each layer's history apart", () => {
    const a = new TiledLayer(64, 64, 32);
    const b = new TiledLayer(64, 64, 32);
    const h = new PaintHistory();
    h.push(a, paintTile(a, 0, 1));
    expect(h.canUndo(b)).toBe(false);
    expect(h.undo(b)).toBeNull();
    expect(a.tile(0)).toBeDefined();
  });
});
