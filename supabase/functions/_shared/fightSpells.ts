// The spell records a fight's `cast_spell` reads (#1021, row 5b): a spell the stat block names in prose, looked up by
// name in the shared library and in the campaign's own spells. Only the columns the casting rules need.
//
// The service-role client bypasses RLS, so every read of the campaign's own rows is scoped to the campaign (or to the
// owner's all-campaigns catalogue) in the query itself, as `fightStatBlocks.ts` does. Read errors are thrown, never
// turned into "no such spell".

import type { SupabaseClient } from "@supabase/supabase-js";
import { withFlatHealing } from "../../../src/rules/fight/spells/healEntry.ts";
import type { SpellRecord } from "../../../src/rules/fight/spells/spellChoice.ts";

const LIBRARY_COLUMNS =
  "id, name, level, range, ruleset, source, concentration, attack_type, save_attribute, save_effect, damage_rolls, healing_dice, aoe_shape, aoe_size, higher_level_damage, mechanics_reviewed, effects, condition_effect, casting_time, casting_time_custom";
/** A campaign's own spell has no reviewed flag and no structured effects: its flat columns are all there is, and they are the DM's word (and its `condition_effect`, which the DM fills). */
const CUSTOM_COLUMNS =
  "id, name, level, range, ruleset, source, concentration, attack_type, save_attribute, save_effect, damage_rolls, healing_dice, higher_level_healing, aoe_shape, aoe_size, higher_level_damage, condition_effect, casting_time, casting_time_custom";

/**
 * A campaign's own spell as the casting rules read it: marked `own`, and its flat healing columns (`healing_dice`,
 * `higher_level_healing`) turned into the one structured healing effect (`withFlatHealing`), so a DM's own Cure Wounds heals like a
 * library one. This is the one place a custom row is mapped, whichever loader read it.
 */
export function ownRecord(row: SpellRecord & { higher_level_healing?: string | null }): SpellRecord {
  const { higher_level_healing: higher, ...record } = row;
  return withFlatHealing({ ...record, own: true }, higher === undefined ? null : higher);
}

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
  return [...(custom.data as unknown as (SpellRecord & { higher_level_healing: string | null })[]).map(ownRecord), ...(library.data as unknown as SpellRecord[])];
}

/**
 * `.or()` filter text for one name: `name.ilike."<pattern>"`. The value is quoted so a comma, a parenthesis or a dot in a
 * spell name ("Tasha's Hideous Laughter", "Melf's Acid Arrow (Level 2)") cannot end the filter early, and the quote and the
 * backslash, the only characters special inside quotes, are escaped (PostgREST "reserved characters"). `literalPattern`
 * has already put its own backslashes in front of `%` and `_`, so those are doubled here and come out the other side as
 * the single backslash `ilike` reads.
 */
export function nameFilter(name: string): string {
  const quoted = literalPattern(name).replace(/[\\"]/g, (c) => `\\${c}`);
  return `name.ilike."${quoted}"`;
}

/**
 * Every record named any of `names`, in at most two reads (one per table) however many names there are, and none at all
 * for no names. The same rows `loadSpellsNamed` would give for each name, the campaign's own first.
 */
export async function loadSpellsListed(admin: SupabaseClient, campaignId: string, ownerId: string, names: readonly string[]): Promise<SpellRecord[]> {
  const wanted = names.filter((n) => n.trim() !== "");
  if (wanted.length === 0) return [];
  const named = wanted.map(nameFilter).join(",");
  const custom = await admin
    .from("spells")
    .select(CUSTOM_COLUMNS)
    .or(named)
    .or(`campaign_id.eq.${campaignId},and(campaign_id.is.null,user_id.eq.${ownerId})`);
  if (custom.error) throw new Error(`spells: ${custom.error.message}`);
  const library = await admin.from("library_spells").select(LIBRARY_COLUMNS).or(named);
  if (library.error) throw new Error(`library_spells: ${library.error.message}`);
  return [...(custom.data as unknown as (SpellRecord & { higher_level_healing: string | null })[]).map(ownRecord), ...(library.data as unknown as SpellRecord[])];
}
