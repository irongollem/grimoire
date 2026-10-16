// Dressing: the shared library of top-down props a DM places on a Cartographer
// map (epic #1062). Rows live in `library_dressing`.

import type { SwayMotion, TileLight } from "@/cartographer/packSchema";

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
  | "outdoor"
  | "crossings"
  | "vermin";

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
  { key: "crossings", label: "Bridges and walkways" },
  { key: "vermin", label: "Vermin" },
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
  /**
   * Lies on the floor (a rug, a bloodstain, a body): the map draws it only an occlusion rim, never
   * a cast shadow, which would lift it off the ground (#1065).
   */
  flat: boolean;
  /** The light this prop gives (a lantern, a campfire), or null for none. Read from the art by the art pipeline. */
  light: TileLight | null;
  /** How the prop sways in the live battle map (#1073), or null to stand still. */
  sway: SwayMotion | null;
}
