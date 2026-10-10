/**
 * Recharge, daily uses and legendary cost, which live in an entry's printed name:
 * "Fire Breath (Recharge 5-6)", "Teleport (3/Day)", "Wing Attack (Costs 2 Actions)".
 */
import type { ActionStructure } from "../../types/statBlock.types.ts";
import { normalizeForMatch } from "./proseText.ts";

export type NameMarkers = Pick<ActionStructure, "recharge" | "uses" | "legendary_cost">;

export function parseNameMarkers(name: string, isLegendary: boolean): NameMarkers {
  const n = normalizeForMatch(name);
  const out: NameMarkers = {};

  const recharge = /\brecharge\s+(\d)(?:\s*-\s*(\d))?(?!\d)/i.exec(n);
  if (recharge) {
    const min = Number(recharge[1]);
    const max = recharge[2] === undefined ? min : Number(recharge[2]);
    if (min >= 1 && max >= min && max <= 6) out.recharge = { min, max };
  }

  const perRest = /\((\d+)\s*\/\s*(day|short rest|long rest|short or long rest)\b/i.exec(n);
  if (perRest) {
    const per = perRest[2].toLowerCase();
    out.uses = {
      count: Number(perRest[1]),
      per: per === "day" ? "day" : per === "long rest" ? "long_rest" : "short_rest",
    };
  } else {
    const after = /\brecharges?:?\s+after\s+(?:an?\s+)?(short or long|short|long)\s+rest/i.exec(n);
    if (after) out.uses = { count: 1, per: after[1].toLowerCase() === "long" ? "long_rest" : "short_rest" };
  }

  if (isLegendary) {
    // "(Costs 2 Actions)", Tome of Beasts "(2 actions)" / "(3 actions, Roc Form Only)", Tome of Beasts 3 "(2)".
    const cost =
      /\bcosts?\s+(\d+)\s+actions?/i.exec(n) ??
      /\((\d+)\s+actions?\b[^)]*\)/i.exec(n) ??
      /\(([1-3])\)/.exec(n);
    out.legendary_cost = cost ? Number(cost[1]) : 1;
  }
  return out;
}
