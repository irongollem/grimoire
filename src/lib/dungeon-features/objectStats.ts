import { objectArmorClass } from "@/rules/objects";
import type { ObjectMaterial } from "@/rules/objects";
import type { DungeonFeature } from "@/types/dungeonFeature.types";

/**
 * One line of object stats for a feature, e.g.
 * "AC 19 · 18 HP · Threshold 10 · Break DC 20 · Pick lock DC 15".
 *
 * A stat nobody set is dropped, never printed as 0 (a null AC is not an AC of
 * zero), and a feature with none set has no line at all.
 */
export function objectStatLine(
  feature: Pick<DungeonFeature, "object_ac" | "object_hp" | "damage_threshold" | "break_dc" | "lock_dc">,
): string | null {
  const parts: string[] = [];
  if (feature.object_ac !== null) parts.push(`AC ${feature.object_ac}`);
  if (feature.object_hp !== null) parts.push(`${feature.object_hp} HP`);
  if (feature.damage_threshold !== null) parts.push(`Threshold ${feature.damage_threshold}`);
  if (feature.break_dc !== null) parts.push(`Break DC ${feature.break_dc}`);
  if (feature.lock_dc !== null) parts.push(`Pick lock DC ${feature.lock_dc}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type ObjectStatFields = Pick<
  DungeonFeature,
  "object_material" | "object_size" | "object_ac" | "object_hp" | "damage_threshold" | "break_dc" | "lock_dc"
>;

/**
 * A feature's object stats after the DM picks a material in the editor.
 *
 * The AC follows the material while it is still the book's AC for the old one
 * (or empty), so Wood then Iron reads 19, not Wood's 15; an AC the DM typed is
 * kept. "Not an object" (null) clears every object stat, because any one of them
 * left behind still draws the Object block and its immunities on the sheet.
 */
export function withObjectMaterial(stats: ObjectStatFields, next: ObjectMaterial | null): ObjectStatFields {
  if (next === null) {
    return {
      object_material: null, object_size: null, object_ac: null, object_hp: null,
      damage_threshold: null, break_dc: null, lock_dc: null,
    };
  }
  const previousBookAc = stats.object_material ? objectArmorClass(stats.object_material) : null;
  const followsBook = stats.object_ac === null || stats.object_ac === previousBookAc;
  return { ...stats, object_material: next, object_ac: followsBook ? objectArmorClass(next) : stats.object_ac };
}
