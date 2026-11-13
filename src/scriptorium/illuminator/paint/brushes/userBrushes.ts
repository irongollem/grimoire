import { STOCK_GRAIN_PATHS } from "@/scriptorium/papers/papers";
import type { BrushBlend, BrushPreset, DynamicControl, Grain, TipSettings } from "../engine/types";
import { STOCK_TIP_PATHS } from "./stockBrushes";

/*
 * A painter's own brushes as the table holds them (#1181). The row keeps the settings as JSON and the tip and
 * grain pictures as files; `presetFromRow` turns one back into a brush the engine can paint with, and refuses a
 * row whose JSON is not a whole brush, so a bad row is skipped rather than painted with.
 */

export type BrushSource = "made" | "photo" | "picture" | "described" | "abr" | "procreate";

export interface PaintBrushRow {
  id: string;
  user_id: string;
  name: string;
  preset: unknown;
  tip_url: string | null;
  grain_url: string | null;
  source: BrushSource;
  set_name: string | null;
  created_at: string;
  updated_at: string;
}

/** A brush the painter owns: the preset the engine paints with, plus what the library shows around it. */
export interface UserBrush {
  preset: BrushPreset;
  source: BrushSource;
  setName: string | null;
}

/** What a stored preset's image id says when the picture is the row's own file rather than a stock one. */
export const OWN_IMAGE = "own";

export const userTipId = (rowId: string) => `user:${rowId}:tip`;
export const userGrainId = (rowId: string) => `user:${rowId}:grain`;
export const isUserImageId = (id: string) => id.startsWith("user:");

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const CONTROLS: readonly DynamicControl[] = ["off", "pressure", "tilt", "rotation", "direction", "fade"];
const BLENDS: readonly BrushBlend[] = ["normal", "multiply", "screen", "overlay", "soft-light", "colour", "behind", "clear"];

function varied(v: unknown): boolean {
  return isObj(v) && num(v.jitter) && num(v.minimum) && typeof v.control === "string" && (CONTROLS as readonly string[]).includes(v.control);
}

function tipOk(t: unknown): t is TipSettings {
  if (!isObj(t) || !isObj(t.source)) return false;
  const s = t.source;
  const sourceOk = (s.kind === "round" && num(s.hardness)) || (s.kind === "image" && typeof s.id === "string");
  return sourceOk && num(t.size) && t.size > 0 && num(t.angle) && num(t.roundness) && num(t.spacing) && t.spacing > 0
    && bool(t.flipX) && bool(t.flipY) && bool(t.followDirection);
}

function grainOk(g: unknown): g is Grain {
  return isObj(g) && typeof g.id === "string" && num(g.scale) && g.scale > 0 && num(g.depth) && (g.mode === "paper" || g.mode === "moving");
}

/** The stored settings, checked field by field; null when any part is missing or the wrong type. */
function parseSettings(raw: unknown): Omit<BrushPreset, "id" | "name" | "group"> | null {
  if (!isObj(raw) || raw.v !== 1 || !tipOk(raw.tip)) return null;
  const { shape, scatter, grain, transfer, wetMix, colour } = raw;
  if (shape !== null && !(isObj(shape) && varied(shape.size) && varied(shape.angle) && varied(shape.roundness))) return null;
  if (scatter !== null && !(isObj(scatter) && num(scatter.amount) && bool(scatter.bothAxes) && num(scatter.count) && num(scatter.countJitter))) return null;
  if (grain !== null && !grainOk(grain)) return null;
  if (!isObj(transfer) || !num(transfer.flow) || !num(transfer.opacity) || !varied(transfer.flowDynamics) || !varied(transfer.opacityDynamics)) return null;
  if (!bool(raw.wetEdges)) return null;
  if (wetMix !== null && !(isObj(wetMix) && num(wetMix.dilution) && num(wetMix.charge) && num(wetMix.pull))) return null;
  if (colour !== null && !(isObj(colour) && num(colour.hue) && num(colour.saturation) && num(colour.value))) return null;
  if (!num(raw.smoothing) || typeof raw.blend !== "string" || !(BLENDS as readonly string[]).includes(raw.blend) || !num(raw.fadeLength)) return null;
  return raw as unknown as Omit<BrushPreset, "id" | "name" | "group">;
}

/**
 * The brush a row holds, or null when it cannot be painted with: broken JSON, or a picture the row names as its
 * own with no file for it, or a stock picture that does not exist.
 */
export function presetFromRow(row: PaintBrushRow): BrushPreset | null {
  const settings = parseSettings(row.preset);
  if (!settings) return null;
  const tip = { ...settings.tip };
  if (tip.source.kind === "image") {
    const id = tip.source.id;
    if (id === OWN_IMAGE) {
      if (row.tip_url === null) return null;
      tip.source = { kind: "image", id: userTipId(row.id) };
    } else if (!(id in STOCK_TIP_PATHS)) return null;
  }
  let grain = settings.grain;
  if (grain) {
    if (grain.id === OWN_IMAGE) {
      if (row.grain_url === null) return null;
      grain = { ...grain, id: userGrainId(row.id) };
    } else if (!(grain.id in STOCK_GRAIN_PATHS)) return null;
  }
  return { ...settings, tip, grain, id: row.id, name: row.name, group: "yours" };
}

export interface StoredBrush {
  name: string;
  preset: Omit<BrushPreset, "id" | "name" | "group">;
  /** Whether the brush's tip / grain is a picture of its own that needs a file. */
  ownTip: boolean;
  ownGrain: boolean;
}

/**
 * What to store for a brush: the settings without what the columns hold (id, name, group), and with a picture
 * that is not a stock one marked as the row's own, whatever local id it carried (an import's, or another row's).
 */
export function rowFromPreset(preset: BrushPreset): StoredBrush {
  const { id: _id, name, group: _group, ...settings } = preset;
  const ownTip = preset.tip.source.kind === "image" && !(preset.tip.source.id in STOCK_TIP_PATHS);
  const ownGrain = preset.grain !== null && !(preset.grain.id in STOCK_GRAIN_PATHS);
  return {
    name: name.trim().slice(0, 80),
    ownTip,
    ownGrain,
    preset: {
      ...settings,
      tip: ownTip ? { ...settings.tip, source: { kind: "image", id: OWN_IMAGE } } : settings.tip,
      grain: ownGrain && settings.grain ? { ...settings.grain, id: OWN_IMAGE } : settings.grain,
    },
  };
}

/** The painter's brushes from the rows, in the order the rows came; rows that are not whole brushes are left out. */
export function userBrushesFromRows(rows: readonly PaintBrushRow[]): UserBrush[] {
  const out: UserBrush[] = [];
  for (const row of rows) {
    const preset = presetFromRow(row);
    if (preset) out.push({ preset, source: row.source, setName: row.set_name });
  }
  return out;
}

/** A file's name without its extension: what an imported set is called. */
export function setNameFromFile(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  // A file name is not a title: "Grass_Big" reads as "Grass Big" in the library.
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** A brush the file left unnamed comes out as its number; it is named after its set instead ("Inks 4"). */
export function importedBrushName(name: string, setName: string): string {
  const trimmed = name.trim();
  return trimmed === "" || /^\d+$/.test(trimmed) ? `${setName} ${trimmed}`.trim().slice(0, 80) : trimmed;
}
