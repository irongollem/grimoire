/*
 * The painting session (#1181 wave 2): the layers, the armed tool, the colour and one undo history across
 * all of it. The engine paints pixels; this decides which layer, with what, and keeps undo in the order
 * things happened. Pure logic, no Vue and no DOM.
 */
import { blendPixel } from "../engine/blend";
import { swapRecord } from "../engine/history";
import { DEFAULT_PRESSURE_CURVE } from "../engine/pressure";
import { type Stroke, type UndoRecord, beginStroke } from "../engine/stroke";
import { TiledLayer } from "../engine/tiledLayer";
import type { BrushBlend, BrushPreset, PaintAssets, PenSample, PressureCurve, Rgb } from "../engine/types";
import { STOCK_BRUSHES } from "../brushes/stockBrushes";
import type { Paper } from "@/scriptorium/papers/papers";
import type {
  HistoryEntry,
  Layer,
  LayerBlend,
  LayerListSnapshot,
  PaintLayer,
  PaintSessionApi,
  PaintTool,
  PictureLayer,
  SessionState,
} from "./types";

export interface PaintSessionInit {
  width: number;
  height: number;
  paper: Paper | null;
  /** Paint layers a saved painting brings back, bottom first, above the picture. Loading them is not an edit. */
  layers?: PaintLayer[];
  /** True when a picture is being illuminated: it becomes the bottom layer. False is a blank sheet. */
  picture: boolean;
  assets: PaintAssets;
  brushes?: Partial<SessionState["brushes"]>;
  colour?: Rgb;
  curve?: PressureCurve;
  /** A seed per stroke; without it strokes count up from 1. */
  seed?: () => number;
}

const HISTORY_LIMIT = 100;
const RECENT_LIMIT = 12;
/** The ink a fresh session paints with. */
export const DEFAULT_INK: Rgb = { r: 0x2b, g: 0x20, b: 0x19 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
/** The paper-white background colour a fresh painting starts with. */
export const DEFAULT_BACKGROUND: Rgb = WHITE;

type PaintingTool = Exclude<PaintTool, "picker">;

/** A layer-list edit. `pool` holds layer objects that may need to come back (added, deleted, merged). */
interface LayersEntry {
  kind: "layers";
  before: LayerListSnapshot;
  after: LayerListSnapshot;
  pool: Layer[];
  /** A merge also changed the pixels of the layer below. */
  merge?: { targetId: string; record: UndoRecord };
}
/** Every paint layer swapped for another set at once (going back to a saved version). Whole layer arrays, because ids may repeat. */
interface ReplaceEntry {
  kind: "replace";
  before: Layer[];
  after: Layer[];
  beforeActive: string;
  afterActive: string;
  /** Tiles to treat as changed per layer id either way: the save diffs by tile. */
  touched: Map<string, Set<number>>;
}
type Entry = Extract<HistoryEntry, { kind: "stroke" }> | LayersEntry | ReplaceEntry;

interface Active {
  layerId: string;
  stroke: Stroke;
  tool: PaintingTool;
  colour: Rgb;
}

function brushById(id: string): BrushPreset {
  const found = STOCK_BRUSHES.find((b) => b.id === id);
  if (!found) throw new Error(`Stock brush "${id}" is missing`);
  return found;
}

function blendOf(blend: LayerBlend): BrushBlend {
  if (blend === "source-over") return "normal";
  if (blend === "color") return "colour";
  return blend;
}

function sameColour(a: Rgb, b: Rgb): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export function snapshotLayers(layers: readonly Layer[]): LayerListSnapshot {
  const props: LayerListSnapshot["props"] = {};
  for (const l of layers) {
    props[l.id] =
      l.kind === "picture"
        ? { name: l.name, visible: l.visible }
        : { name: l.name, blend: l.blend, opacity: l.opacity, visible: l.visible, lockAlpha: l.lockAlpha };
  }
  return { order: layers.map((l) => l.id), props };
}

function sameSnapshot(a: LayerListSnapshot, b: LayerListSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createPaintSession(init: PaintSessionInit): PaintSessionApi {
  let layerSeq = 0;
  let seedSeq = 0;
  const newPaintLayer = (): PaintLayer => {
    layerSeq++;
    return {
      kind: "paint",
      id: `layer-${layerSeq}`,
      name: `Layer ${layerSeq}`,
      blend: "source-over",
      opacity: 1,
      visible: true,
      lockAlpha: false,
      pixels: new TiledLayer(init.width, init.height),
    };
  };

  const layers: Layer[] = [];
  if (init.picture) {
    const picture: PictureLayer = { kind: "picture", id: "picture", name: "Picture", visible: true, mask: new TiledLayer(init.width, init.height) };
    layers.push(picture);
  } else if (!init.layers || init.layers.length === 0) {
    layers.push(newPaintLayer());
  }
  for (const saved of init.layers ?? []) {
    layers.push(saved);
    // New layers must not take an id a saved one holds.
    const n = /^layer-(\d+)$/.exec(saved.id);
    if (n) layerSeq = Math.max(layerSeq, Number(n[1]));
  }

  const state: SessionState = {
    doc: { width: init.width, height: init.height, paper: init.paper, layers },
    activeLayerId: layers[0]?.id ?? "",
    tool: "brush",
    brushes: {
      brush: init.brushes?.brush ?? brushById("soft-round"),
      smudge: init.brushes?.smudge ?? brushById("soft-round"),
      eraser: init.brushes?.eraser ?? brushById("hard-round"),
    },
    overrides: { brush: {}, smudge: {}, eraser: {} },
    colour: init.colour ?? DEFAULT_INK,
    recent: [],
    curve: init.curve ?? DEFAULT_PRESSURE_CURVE,
  };

  /** Tiles changed on each paint layer since the painting was loaded or last saved: what the save path uploads. */
  const dirty = new Map<string, Set<number>>();
  function touch(layerId: string, keys: Iterable<number>): void {
    if (layerOf(layerId)?.kind !== "paint") return;
    let set = dirty.get(layerId);
    if (!set) dirty.set(layerId, (set = new Set()));
    for (const key of keys) set.add(key);
  }

  const undoStack: Entry[] = [];
  let redoStack: Entry[] = [];
  let active: Active | null = null;

  function layerOf(id: string): Layer | undefined {
    return state.doc.layers.find((l) => l.id === id);
  }
  const pixelsOf = (l: Layer): TiledLayer => (l.kind === "picture" ? l.mask : l.pixels);

  /** Something changed since the painting was loaded or last saved (strokes, layer edits, undo, going back). */
  let edited = false;

  function record(entry: Entry): void {
    edited = true;
    undoStack.push(entry);
    redoStack = [];
    while (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  }

  /** Puts the layer list into a snapshot's shape. Returns the ids whose props, place or existence changed. */
  function applySnapshot(snap: LayerListSnapshot, pool: Layer[]): string[] {
    const byId = new Map<string, Layer>();
    for (const l of pool) byId.set(l.id, l);
    for (const l of state.doc.layers) byId.set(l.id, l);
    const oldIndex = new Map(state.doc.layers.map((l, i) => [l.id, i]));
    const next: Layer[] = [];
    const changed = new Set<string>();
    for (const id of snap.order) {
      const l = byId.get(id);
      if (l) next.push(l);
    }
    next.forEach((l, i) => {
      const want = snap.props[l.id];
      const before = snapshotLayers([l]).props[l.id];
      if (oldIndex.get(l.id) !== i || JSON.stringify(before) !== JSON.stringify(want)) changed.add(l.id);
      if (!want) return;
      l.name = want.name;
      l.visible = want.visible;
      if (l.kind === "paint") {
        if (want.blend !== undefined) l.blend = want.blend;
        if (want.opacity !== undefined) l.opacity = want.opacity;
        if (want.lockAlpha !== undefined) l.lockAlpha = want.lockAlpha;
      }
    });
    for (const l of state.doc.layers) if (!snap.order.includes(l.id)) changed.add(l.id);
    state.doc.layers.splice(0, state.doc.layers.length, ...next);
    if (!layerOf(state.activeLayerId)) state.activeLayerId = next[Math.max(0, (oldIndex.get(state.activeLayerId) ?? 1) - 1)]?.id ?? next[0]?.id ?? "";
    return [...changed];
  }

  function currentBrush(tool: PaintingTool): BrushPreset {
    return state.brushes[tool];
  }

  const api: PaintSessionApi = {
    state,

    beginStroke(first: PenSample, opts?: { restore?: boolean }): { layerId: string; keys: number[] } | null {
      if (state.tool === "picker") return null;
      const tool = state.tool;
      let target = layerOf(state.activeLayerId);
      if (!target) return null;
      if (target.kind === "picture" && tool !== "eraser") {
        target = api.addLayer();
      }
      const onPicture = target.kind === "picture";
      let brush = currentBrush(tool);
      let colour = state.colour;
      let mode: "paint" | "erase" | "smudge";
      if (tool === "smudge") mode = "smudge";
      else if (tool === "brush") mode = "paint";
      else if (onPicture) {
        // The mask is coverage in alpha: white painted in is "erased to the paper", erase mode takes it back.
        mode = opts?.restore ? "erase" : "paint";
        colour = WHITE;
        brush = { ...brush, blend: "normal" };
      } else mode = "erase";
      const stroke = beginStroke(
        pixelsOf(target),
        {
          brush,
          colour,
          mode,
          seed: init.seed ? init.seed() : ++seedSeq,
          curve: state.curve,
          overrides: state.overrides[tool],
          paper: target.kind === "paint" && state.doc.paper ? state.doc.paper : undefined,
          lockAlpha: target.kind === "paint" ? target.lockAlpha : undefined,
        },
        init.assets,
      );
      active = { layerId: target.id, stroke, tool, colour: state.colour };
      const keys = stroke.add([first]);
      return { layerId: target.id, keys };
    },

    addSamples(samples: PenSample[]): number[] {
      return active ? active.stroke.add(samples) : [];
    },

    // The record holds every tile the stroke touched, which is a superset of what the end changed: redrawing
    // all of them is correct, and a lone tap (its dab lands only at the end) is covered.
    endStroke(): number[] {
      if (!active) return [];
      const done = active;
      active = null;
      const rec = done.stroke.end();
      if (rec.tiles.size > 0) {
        record({ kind: "stroke", layerId: done.layerId, record: rec });
        touch(done.layerId, rec.tiles.keys());
      }
      if (done.tool === "brush") {
        state.recent = [done.colour, ...state.recent.filter((c) => !sameColour(c, done.colour))].slice(0, RECENT_LIMIT);
      }
      return [...rec.tiles.keys()];
    },

    canDelete(id: string): boolean {
      const layer = layerOf(id);
      if (!layer || layer.kind === "picture") return false;
      // A blank sheet always keeps one paint layer to paint on.
      return init.picture || state.doc.layers.length > 1;
    },

    canMergeDown(id: string): boolean {
      const upper = layerOf(id);
      if (!upper || upper.kind !== "paint") return false;
      return state.doc.layers[state.doc.layers.indexOf(upper) - 1]?.kind === "paint";
    },

    addLayer(): PaintLayer {
      const before = snapshotLayers(state.doc.layers);
      const layer = newPaintLayer();
      // Just above the active layer; with the picture active that is just above the picture.
      const at = state.doc.layers.findIndex((l) => l.id === state.activeLayerId);
      state.doc.layers.splice(at < 0 ? state.doc.layers.length : at + 1, 0, layer);
      state.activeLayerId = layer.id;
      record({ kind: "layers", before, after: snapshotLayers(state.doc.layers), pool: [layer] });
      return layer;
    },

    deleteLayer(id: string): void {
      const layer = layerOf(id);
      if (!layer || !api.canDelete(id)) return;
      const before = snapshotLayers(state.doc.layers);
      const index = state.doc.layers.indexOf(layer);
      state.doc.layers.splice(index, 1);
      if (state.activeLayerId === id) state.activeLayerId = state.doc.layers[Math.max(0, index - 1)]?.id ?? "";
      record({ kind: "layers", before, after: snapshotLayers(state.doc.layers), pool: [layer] });
    },

    moveLayer(id: string, toIndex: number): void {
      const layer = layerOf(id);
      if (!layer || layer.kind === "picture") return;
      const floor = state.doc.layers[0]?.kind === "picture" ? 1 : 0;
      const to = Math.min(state.doc.layers.length - 1, Math.max(floor, toIndex));
      const from = state.doc.layers.indexOf(layer);
      if (to === from) return;
      const before = snapshotLayers(state.doc.layers);
      state.doc.layers.splice(from, 1);
      state.doc.layers.splice(to, 0, layer);
      record({ kind: "layers", before, after: snapshotLayers(state.doc.layers), pool: [] });
    },

    // Merging onto the picture is not allowed (it is never painted on): that call does nothing. A hidden
    // layer merges away without leaving paint, as hidden layers do in every painting app.
    mergeDown(id: string): void {
      const upper = layerOf(id);
      if (!upper || upper.kind !== "paint" || !api.canMergeDown(id)) return;
      const index = state.doc.layers.indexOf(upper);
      const lower = state.doc.layers[index - 1];
      if (!lower || lower.kind !== "paint") return;
      const before = snapshotLayers(state.doc.layers);
      const rec: UndoRecord = { tiles: new Map() };
      if (upper.visible && upper.opacity > 0) {
        const blend = blendOf(upper.blend);
        const T = upper.pixels.tileSize;
        for (const key of upper.pixels.keys()) {
          const src = upper.pixels.tile(key);
          if (!src) continue;
          const prior = lower.pixels.tile(key);
          rec.tiles.set(key, prior ? prior.slice() : null);
          const dst = lower.pixels.ensureTile(key);
          for (let i = 0; i < T * T; i++) {
            const o = i * 4;
            const a = src[o + 3] ?? 0;
            if (a === 0) continue;
            blendPixel(dst, o, blend, src[o] ?? 0, src[o + 1] ?? 0, src[o + 2] ?? 0, (a / 255) * upper.opacity);
          }
          if (lower.pixels.isTileEmpty(dst)) lower.pixels.setTile(key, null);
        }
        touch(lower.id, rec.tiles.keys());
      }
      state.doc.layers.splice(index, 1);
      if (state.activeLayerId === id) state.activeLayerId = lower.id;
      record({ kind: "layers", before, after: snapshotLayers(state.doc.layers), pool: [upper], merge: { targetId: lower.id, record: rec } });
    },

    setLayerProps(id, props): void {
      const layer = layerOf(id);
      if (!layer) return;
      const before = snapshotLayers(state.doc.layers);
      if (props.name !== undefined) layer.name = props.name;
      if (props.visible !== undefined) layer.visible = props.visible;
      if (layer.kind === "paint") {
        if (props.blend !== undefined) layer.blend = props.blend;
        if (props.opacity !== undefined) layer.opacity = Math.min(1, Math.max(0, props.opacity));
        if (props.lockAlpha !== undefined) layer.lockAlpha = props.lockAlpha;
      }
      const after = snapshotLayers(state.doc.layers);
      if (sameSnapshot(before, after)) return;
      record({ kind: "layers", before, after, pool: [] });
    },

    undo(): { layerIds: string[] } | null {
      const entry = undoStack.pop();
      if (!entry) return null;
      redoStack.push(entry);
      return { layerIds: step(entry, "undo") };
    },

    redo(): { layerIds: string[] } | null {
      const entry = redoStack.pop();
      if (!entry) return null;
      undoStack.push(entry);
      return { layerIds: step(entry, "redo") };
    },

    get dirty(): ReadonlyMap<string, ReadonlySet<number>> {
      return dirty;
    },
    markClean(): void {
      dirty.clear();
      edited = false;
    },
    rebase(): void {
      dirty.clear();
    },
    get edited(): boolean {
      return edited;
    },

    // One history step: Ctrl+Z puts every layer back as it was. The picture layer (and its mask) stays.
    replaceLayers(next: PaintLayer[]): string[] {
      const before = [...state.doc.layers];
      const beforeActive = state.activeLayerId;
      const incoming = next.length === 0 && !init.picture ? [newPaintLayer()] : next;
      for (const l of incoming) {
        const n = /^layer-(\d+)$/.exec(l.id);
        if (n) layerSeq = Math.max(layerSeq, Number(n[1]));
      }
      const after: Layer[] = [...before.filter((l) => l.kind === "picture"), ...incoming];
      const touched = new Map<string, Set<number>>();
      for (const l of [...before, ...incoming]) {
        if (l.kind !== "paint") continue;
        const set = touched.get(l.id) ?? new Set<number>();
        for (const key of l.pixels.keys()) set.add(key);
        touched.set(l.id, set);
      }
      const afterActive = after.some((l) => l.id === beforeActive) ? beforeActive : (incoming[incoming.length - 1]?.id ?? after[0]?.id ?? "");
      state.doc.layers.splice(0, state.doc.layers.length, ...after);
      state.activeLayerId = afterActive;
      for (const [id, keys] of touched) touch(id, keys);
      record({ kind: "replace", before, after, beforeActive, afterActive, touched });
      return [...new Set([...before, ...after].map((l) => l.id))];
    },

    get canUndo(): boolean {
      return undoStack.length > 0;
    },
    get canRedo(): boolean {
      return redoStack.length > 0;
    },
  };

  function step(entry: Entry, way: "undo" | "redo"): string[] {
    edited = true;
    if (entry.kind === "replace") {
      const to = way === "undo" ? entry.before : entry.after;
      state.doc.layers.splice(0, state.doc.layers.length, ...to);
      state.activeLayerId = way === "undo" ? entry.beforeActive : entry.afterActive;
      // Every layer in play must exist again in the saved diff (a later save re-reads each id's tiles).
      for (const [id, keys] of entry.touched) {
        const keep = layerOf(id);
        const all = new Set(keys);
        if (keep && keep.kind === "paint") for (const k of keep.pixels.keys()) all.add(k);
        touch(id, all);
      }
      return [...new Set([...entry.before, ...entry.after].map((l) => l.id))];
    }
    if (entry.kind === "stroke") {
      const layer = layerOf(entry.layerId);
      if (layer) swapRecord(pixelsOf(layer), entry.record);
      touch(entry.layerId, entry.record.tiles.keys());
      return [entry.layerId];
    }
    const changed = new Set(applySnapshot(way === "undo" ? entry.before : entry.after, entry.pool));
    if (entry.merge) {
      const target = layerOf(entry.merge.targetId);
      if (target && target.kind === "paint") {
        swapRecord(target.pixels, entry.merge.record);
        touch(target.id, entry.merge.record.tiles.keys());
      }
      changed.add(entry.merge.targetId);
    }
    return [...changed];
  }

  return api;
}
