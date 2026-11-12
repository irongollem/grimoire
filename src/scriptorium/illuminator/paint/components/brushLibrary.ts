import type { BrushGroup, BrushPreset } from "../engine/types";

/** The order the library lists its groups in, and the name each goes by. */
export const BRUSH_GROUPS: ReadonlyArray<{ group: BrushGroup; label: string }> = [
  { group: "basic", label: "Basic" },
  { group: "watercolour", label: "Watercolour" },
  { group: "bristle", label: "Bristle" },
  { group: "dry", label: "Dry media" },
  { group: "ink", label: "Ink" },
  { group: "texture", label: "Texture" },
  { group: "yours", label: "Yours" },
];

export interface BrushSection {
  group: BrushGroup;
  label: string;
  brushes: BrushPreset[];
}

/** True when the brush's name contains every word of the query, ignoring case. */
export function brushMatches(brush: BrushPreset, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const name = brush.name.toLowerCase();
  return words.every((w) => name.includes(w));
}

/**
 * The brushes grouped in library order. Without a search every group shows, so an empty "Yours" can say how to fill
 * it; with one, only groups that still have a match are listed.
 */
export function groupBrushes(brushes: readonly BrushPreset[], query: string): BrushSection[] {
  const searching = query.trim() !== "";
  const out: BrushSection[] = [];
  for (const { group, label } of BRUSH_GROUPS) {
    const inGroup = brushes.filter((b) => b.group === group && (!searching || brushMatches(b, query)));
    if (inGroup.length === 0 && (searching || group !== "yours")) continue;
    out.push({ group, label, brushes: inGroup });
  }
  return out;
}
