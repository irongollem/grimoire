import type { RulesetKey } from "@/types/ruleset.types";

/** Row shape of the metamagic_options table — the single source of Metamagic
 * identity, classification, and cost (seeded in migration 20260720000043). */
export interface MetamagicOptionRow {
  ruleset: RulesetKey;
  name: string;
  sp_cost: number;
  /** 'spell_level' — cost is max(cast slot level, sp_cost) (original Twinned Spell). */
  cost_scaling: "fixed" | "spell_level";
  /** Post-roll options modify a cast that already happened (Empowered/Seeking). */
  post_roll: boolean;
  description: string;
  sort_order: number;
}

export interface MetamagicOption {
  name: string;
  /** Display label for the Sorcery Point cost, e.g. "2" or "1+ (spell level)". */
  sp_cost: string;
  description: string;
  post_roll: boolean;
}

export function metamagicCostLabel(row: Pick<MetamagicOptionRow, "sp_cost" | "cost_scaling">): string {
  return row.cost_scaling === "spell_level" ? `${row.sp_cost}+ (spell level)` : String(row.sp_cost);
}

export function toMetamagicOption(row: MetamagicOptionRow): MetamagicOption {
  return {
    name: row.name,
    sp_cost: metamagicCostLabel(row),
    description: row.description,
    post_roll: row.post_roll,
  };
}
