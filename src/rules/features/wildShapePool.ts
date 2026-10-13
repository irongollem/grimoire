import type { WildShapeRules } from "@/rules/wildshape";
import type { ResourcePool } from "./characterFeatures";
import { WILD_SHAPE_KEY } from "./mechanics.types";

/**
 * Wild Shape as a pool a feature can spend ("Expend a use of your Wild Shape").
 * It is virtual: the count is `party_members.wildshapes_used` (spent), never a
 * `class_resources` entry, and rests already reset it. A character with no
 * Wild Shape (below druid level 2) has no such pool, so a feature that spends
 * it is unusable, never free.
 */
export function wildShapePool(rules: WildShapeRules): ResourcePool | null {
  if (rules.maxUses === 0) return null;
  return {
    key: WILD_SHAPE_KEY,
    label: "Wild Shape",
    max: rules.maxUses === null ? "unlimited" : rules.maxUses,
    recharge: rules.shortRestRegain === "all" ? "short" : "long",
    shortRestRegain: rules.shortRestRegain === "all" ? null : rules.shortRestRegain,
    pool: false,
    sources: ["Wild Shape"],
  };
}

/** Uses left: the maximum less what is spent, never below zero. */
export function wildShapeLeft(pool: ResourcePool, used: number): number | "unlimited" {
  return pool.max === "unlimited" ? "unlimited" : Math.max(0, pool.max - used);
}
