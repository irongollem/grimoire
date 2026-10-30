/**
 * The character-sheet episodes' scene, in the local demo copy only.
 *
 * Chicory (the player fixture's cleric) starts every take at full health with
 * every spell slot unused and a little gold, because rolling, casting and the
 * DM's Damage button all change her. The rest of the party gets a believable
 * evening's wear so the tracker has something to show at a glance. A take
 * leaves Chicory hurt and her slots spent, so every run puts her back.
 */
import { runSqlFile } from "../../lib/dev-campaign-io.ts";
import { quote } from "../../lib/dev-db.ts";
import { demoCampaignId, localDb, playerCharacter } from "./demo.ts";

/** Hit points the other four heroes start with, by name; null leaves them at full. */
const WEAR: Record<string, { hp: number; used?: Record<number, number> }> = {
  "Rosetta \"Rosie\" Vermeil": { hp: 41 },
  "Vellum Ochre": { hp: 19, used: { 1: 2, 2: 1 } },
};

export function setupSheets(): void {
  const campaignId = demoCampaignId();
  const chicory = playerCharacter(campaignId);
  const c = quote(campaignId);
  const pm = quote(chicory.id);
  const wear = Object.entries(WEAR)
    .map(
      ([name, w]) => `
    update public.party_members set current_hp = least(${w.hp}, max_hp), temp_hp = 0
     where campaign_id = ${c} and name = ${quote(name)};
    ${
      w.used
        ? `update public.party_members set spell_slots = (
             select coalesce(jsonb_agg(jsonb_set(s, '{used}', to_jsonb(coalesce((${quote(JSON.stringify(w.used))}::jsonb ->> (s ->> 'level'))::int, 0)))), '[]'::jsonb)
               from jsonb_array_elements(spell_slots) s)
           where campaign_id = ${c} and name = ${quote(name)};`
        : ""
    }`,
    )
    .join("\n");
  runSqlFile(
    localDb(),
    `begin;
     update public.party_members
        set current_hp = max_hp, temp_hp = 0, conditions = '[]'::jsonb, concentration = null,
            inspiration = false, death_save_successes = 0, death_save_failures = 0,
            gp = 87, sp = 0, cp = 0, ep = 0, pp = 0,
            spell_slots = (select coalesce(jsonb_agg(jsonb_set(s, '{used}', '0'::jsonb)), '[]'::jsonb) from jsonb_array_elements(spell_slots) s)
      where id = ${pm};
     update public.party_members set conditions = '[]'::jsonb, concentration = null
      where campaign_id = ${c} and id <> ${pm};
     ${wear}
     -- This local demo copy predates the production template's clean-up: it carries Beacon of Hope and Spiritual
     -- Weapon twice (legacy srd_* and srd_srd_* ids), and the legacy rows name a source the table has not enabled,
     -- which raises an approval banner over the sheet. Production's template has only the srd_srd_* ids, so the
     -- twin of each stays and nothing is lost.
     delete from public.character_spells where party_member_id = ${pm} and spell_id in ('srd_beacon_of_hope', 'srd_spiritual_weapon');
     delete from public.party_inventory where carried_by = ${pm} and name = 'Moonflower Essence';
     commit;`,
  );
}
