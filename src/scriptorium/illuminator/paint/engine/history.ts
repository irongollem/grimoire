import type { TiledLayer } from "./tiledLayer";
import type { UndoRecord } from "./stroke";

interface Stacks {
  undo: UndoRecord[];
  redo: UndoRecord[];
}

/**
 * Undo for painting. A record holds only the tiles a stroke changed, as they were. Undo and redo swap
 * the record's tiles with the layer's, so one record serves both directions. Past the limit the oldest
 * record is dropped and its memory released: that is how a stroke becomes plain pixels.
 */
export class PaintHistory {
  private readonly stacks = new Map<TiledLayer, Stacks>();

  constructor(readonly limit: number = 100) {}

  private of(layer: TiledLayer): Stacks {
    let s = this.stacks.get(layer);
    if (!s) {
      s = { undo: [], redo: [] };
      this.stacks.set(layer, s);
    }
    return s;
  }

  push(layer: TiledLayer, record: UndoRecord): void {
    const s = this.of(layer);
    s.undo.push(record);
    s.redo.length = 0;
    while (s.undo.length > this.limit) s.undo.shift();
  }

  canUndo(layer: TiledLayer): boolean {
    return (this.stacks.get(layer)?.undo.length ?? 0) > 0;
  }

  canRedo(layer: TiledLayer): boolean {
    return (this.stacks.get(layer)?.redo.length ?? 0) > 0;
  }

  /** Returns the tile keys that changed, or null when there is nothing to undo. */
  undo(layer: TiledLayer): number[] | null {
    const s = this.of(layer);
    const record = s.undo.pop();
    if (!record) return null;
    s.redo.push(record);
    return swapRecord(layer, record);
  }

  redo(layer: TiledLayer): number[] | null {
    const s = this.of(layer);
    const record = s.redo.pop();
    if (!record) return null;
    s.undo.push(record);
    return swapRecord(layer, record);
  }

  /** Forgets a layer's history (the layer was deleted or replaced). */
  clear(layer: TiledLayer): void {
    this.stacks.delete(layer);
  }
}

/** Swaps a record's tiles with the layer's, so the same record undoes and redoes. Returns the tile keys changed. */
export function swapRecord(layer: TiledLayer, record: UndoRecord): number[] {
  const keys: number[] = [];
  for (const [key, saved] of record.tiles) {
    const current = layer.tile(key) ?? null;
    layer.setTile(key, saved);
    record.tiles.set(key, current);
    keys.push(key);
  }
  return keys;
}
