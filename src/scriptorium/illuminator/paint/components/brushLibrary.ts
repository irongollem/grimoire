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
  /** Yours only: the brushes again, split under the name of the set each came in. A brush of no set heads the list with no name. */
  sets: { name: string | null; brushes: BrushPreset[] }[];
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
export function groupBrushes(brushes: readonly BrushPreset[], query: string, setNames: Readonly<Record<string, string | null>> = {}): BrushSection[] {
  const searching = query.trim() !== "";
  const out: BrushSection[] = [];
  for (const { group, label } of BRUSH_GROUPS) {
    const inGroup = brushes.filter((b) => b.group === group && (!searching || brushMatches(b, query)));
    if (inGroup.length === 0 && (searching || group !== "yours")) continue;
    out.push({ group, label, brushes: inGroup, sets: group === "yours" ? splitBySet(inGroup, setNames) : [] });
  }
  return out;
}

/** Brushes of no set first, then each set in the order its first brush appears. */
function splitBySet(brushes: readonly BrushPreset[], setNames: Readonly<Record<string, string | null>>): BrushSection["sets"] {
  const sets: BrushSection["sets"] = [];
  const none = brushes.filter((b) => (setNames[b.id] ?? null) === null);
  if (none.length > 0) sets.push({ name: null, brushes: none });
  for (const b of brushes) {
    const name = setNames[b.id] ?? null;
    if (name === null) continue;
    const hit = sets.find((s) => s.name === name);
    if (hit) hit.brushes.push(b);
    else sets.push({ name, brushes: [b] });
  }
  return sets;
}
