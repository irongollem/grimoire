/*
 * Editor / preview pixel dimensions at 96 dpi.
 *
 * Calibrated to the mm dimensions in `useScriptoriumPdf.ts` so html2canvas
 * captures match the jsPDF page exactly (1 CSS px ≈ 0.265 mm at 96 dpi).
 * Both tables are keyed by `ScriptoriumPageSize` — change a row in one,
 * change the matching row in the other.
 */

import type { ScriptoriumPageSize, ScriptoriumDocType } from "@/types/scriptorium.types";

export const EDITOR_PAGE_DIMENSIONS_PX: Record<
  ScriptoriumPageSize,
  { w: number; h: number }
> = {
  A4:     { w: 794, h: 1123 },
  A5:     { w: 559, h: 794 },
  Letter: { w: 816, h: 1056 },
} as const;

export const IMAGE_SIZES = [
  { label: "S",  w: 160 },
  { label: "M",  w: 330 },
  { label: "L",  w: 490 },
  { label: "XL", w: 650 },
] as const;

export const THEMES = ["onednd2024", "phb2014"] as const;
export type ScriptoriumTheme = (typeof THEMES)[number];

export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2.0;

/*
 * Per-doc-type display config: human label + accent colour for the badge.
 * Single source of truth — the dropdown options array is derived from it,
 * so adding a new doc type only requires one edit here.
 */
export const DOC_TYPES: Record<ScriptoriumDocType, { label: string; color: string }> = {
  custom:      { label: "Custom",     color: "#6b7280" },
  spell:       { label: "Spell",      color: "#7c3aed" },
  monster:     { label: "Monster",    color: "#dc2626" },
  item:        { label: "Item",       color: "#d97706" },
  class:       { label: "Class",      color: "#2563eb" },
  subclass:    { label: "Subclass",   color: "#0891b2" },
  race:        { label: "Species",    color: "#059669" },
  background:  { label: "Background", color: "#9333ea" },
  adventure:   { label: "Adventure",  color: "#c2410c" },
  "npc-sheet": { label: "NPC Sheet",  color: "#0f766e" },
  location:    { label: "Location",   color: "#0369a1" },
  quest:       { label: "Quest",      color: "#b45309" },
};

export const DOC_TYPE_OPTIONS: { value: ScriptoriumDocType; label: string }[] =
  (Object.entries(DOC_TYPES) as [ScriptoriumDocType, { label: string; color: string }][])
    .map(([value, { label }]) => ({ value, label }));

export function docTypeLabel(t: ScriptoriumDocType): string {
  return DOC_TYPES[t]?.label ?? t;
}

export function docTypeColor(t: ScriptoriumDocType): string {
  return DOC_TYPES[t]?.color ?? "#6b7280";
}
