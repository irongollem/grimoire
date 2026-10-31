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
