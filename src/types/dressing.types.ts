// Dressing: the shared library of top-down props a DM places on a Cartographer
// map (epic #1062). Rows live in `library_dressing`.

export type DressingGroup =
  | "furniture"
  | "containers"
  | "loot"
  | "remains"
  | "tavern"
  | "workshop"
  | "arcane"
  | "religious"
  | "camp"
  | "prison"
  | "outdoor";

/** Picker order, with the label each group shows. */
export const DRESSING_GROUPS: ReadonlyArray<{ key: DressingGroup; label: string }> = [
  { key: "furniture", label: "Furniture" },
  { key: "containers", label: "Containers" },
  { key: "loot", label: "Loot" },
  { key: "remains", label: "Remains" },
  { key: "tavern", label: "Tavern and kitchen" },
  { key: "workshop", label: "Workshop" },
  { key: "arcane", label: "Arcane" },
  { key: "religious", label: "Religious" },
  { key: "camp", label: "Camp and travel" },
  { key: "prison", label: "Prison" },
  { key: "outdoor", label: "Outdoor" },
];

export interface LibraryDressing {
  /** Text id, e.g. `dressing_long_table`. */
  id: string;
  name: string;
  group_key: DressingGroup;
  tags: string[];
  /** Footprint in cells (1..4), before any rotation. */
  footprint_w: number;
  footprint_h: number;
  /** Null until the art is painted: the editor draws a footprint placeholder. */
  image_url: string | null;
  /** `content_sources` key of the book this prop belongs to. */
  source: string;
}
