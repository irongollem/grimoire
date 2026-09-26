import type { TrackerDef } from "@/types/rule.types";

/**
 * The value a tracker reads at for a character with no saved
 * `party_member_tracker_state` row.
 *
 * A tracker's floor (`min`) is not necessarily where it starts — the demo
 * campaign's Lucidity runs 0 to 10 but every character starts at 8. `start`
 * is optional and clamped into [min, max] here, so a mis-typed starting value
 * saved on the rule can never read as a tracker state outside its own range.
 * Absent `start`, a fresh character reads at `min` — the behaviour every
 * caller had before this field existed.
 *
 * Every reader of an unset tracker value routes through this one function so
 * "no row yet" means the same thing everywhere: the player character sheet,
 * the DM's tracker buttons, the dashboard widget, and the delta-apply math
 * that has to know where a first button press counts up from.
 */
export function trackerInitialValue(def: Pick<TrackerDef, "min" | "max" | "start">): number {
  if (def.start === undefined) return def.min;
  return Math.max(def.min, Math.min(def.max, def.start));
}
