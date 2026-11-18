// The spell records a fight's `cast_spell` reads (#1021, row 5b): a spell the stat block names in prose, looked up by
// name in the shared library and in the campaign's own spells. Only the columns the casting rules need.
//
// The service-role client bypasses RLS, so every read of the campaign's own rows is scoped to the campaign (or to the
// owner's all-campaigns catalogue) in the query itself, as `fightStatBlocks.ts` does. Read errors are thrown, never
// turned into "no such spell".

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpellRecord } from "../../../src/rules/fight/spells/spellChoice.ts";

const LIBRARY_COLUMNS =
  "id, name, level, ruleset, source, concentration, attack_type, save_attribute, save_effect, damage_rolls, healing_dice, aoe_shape, aoe_size, higher_level_damage, mechanics_reviewed, effects";
/** A campaign's own spell has no reviewed flag and no structured effects: its flat columns are all there is, and they are the DM's word. */
const CUSTOM_COLUMNS =
  "id, name, level, ruleset, source, concentration, attack_type, save_attribute, save_effect, damage_rolls, healing_dice, aoe_shape, aoe_size, higher_level_damage";

/** `ilike` reads % and _ as wildcards and \ as its escape: a name is matched literally, in any letter case. */
export function literalPattern(name: string): string {
  return name.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Every record named `name`, the campaign's own first (a tie in the choice goes to the earlier record). `ownerId` is the
 * campaign's owner: their spells made for all campaigns (no campaign) belong to it too.
 */
export async function loadSpellsNamed(admin: SupabaseClient, campaignId: string, ownerId: string, name: string): Promise<SpellRecord[]> {
  const pattern = literalPattern(name);
  const custom = await admin
    .from("spells")
    .select(CUSTOM_COLUMNS)
    .ilike("name", pattern)
    .or(`campaign_id.eq.${campaignId},and(campaign_id.is.null,user_id.eq.${ownerId})`);
  if (custom.error) throw new Error(`spells: ${custom.error.message}`);
  const library = await admin.from("library_spells").select(LIBRARY_COLUMNS).ilike("name", pattern);
  if (library.error) throw new Error(`library_spells: ${library.error.message}`);
  return [...(custom.data as unknown as SpellRecord[]).map((row): SpellRecord => ({ ...row, own: true })), ...(library.data as unknown as SpellRecord[])];
}
