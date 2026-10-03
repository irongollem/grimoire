import type { WildShapeRules } from "@/rules/wildshape";

/**
 * 2024 Evergreen Wild Shape (druid level 20): "Whenever you roll Initiative,
 * you regain one expended use of Wild Shape if you have none left."
 *
 * Returns the new `wildshapes_used`, or null when nothing changes. A null here
 * means "do not write", so callers never issue a no-op update.
 */
export function evergreenWildShapeRegain(rules: WildShapeRules, wildshapesUsed: number): number | null {
  if (!rules.evergreen || rules.maxUses === null) return null;
  if (wildshapesUsed < rules.maxUses) return null;
  return rules.maxUses - 1;
}
