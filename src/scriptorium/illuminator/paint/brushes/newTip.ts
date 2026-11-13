/*
 * A brush made from a tip the painter photographed, boxed or described (#1181): what it is called, and the preset it
 * starts as (the armed brush's settings, with the new picture as its tip).
 */
import { rowFromPreset, type BrushSource } from "./userBrushes";
import type { BrushPreset, GrainImage, TipImage } from "../engine/types";

/** What a new brush is made from. */
export interface NewTip {
  tip: TipImage;
  name: string;
  source: Extract<BrushSource, "photo" | "picture" | "described">;
}

/** The names a brush may have are 80 long; a described brush is "<words> 1" to "<words> 4", so the words give way, not the number. */
export function describedName(description: string, n: number): string {
  const suffix = ` ${n}`;
  return `${description.trim().slice(0, 80 - suffix.length).trimEnd()}${suffix}`;
}

/** The tip id a brush carries until its row exists; `rowFromPreset` stores it as the row's own file whatever it says. */
const PENDING_TIP = "user:pending:tip";

/**
 * The armed brush's settings with `item`'s tip and name, in Yours. A grain of the painter's own comes along when it
 * is loaded; one that cannot be read back is dropped, since a row cannot hold a grain it has no file for.
 */
export function brushFromTip(base: BrushPreset, item: NewTip, grainOf: (id: string) => GrainImage | undefined): { preset: BrushPreset; grain: GrainImage | null } {
  const withTip: BrushPreset = { ...base, name: item.name, group: "yours", tip: { ...base.tip, source: { kind: "image", id: PENDING_TIP } } };
  if (!rowFromPreset(withTip).ownGrain || !base.grain) return { preset: withTip, grain: null };
  const grain = grainOf(base.grain.id) ?? null;
  return { preset: grain === null ? { ...withTip, grain: null } : withTip, grain };
}
