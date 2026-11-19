// What a fight reads from its players' own `party_members` rows before it does anything, shared by `encounter-command`
// (which then saves) and `encounter-options` (which only looks): both must see the same hit points, or the options a DM is
// shown could differ from the turn the server takes. The rules of the adoption are `src/rules/fight/partyIngest.ts`.
//
// The service-role client bypasses RLS, so the read is scoped to the campaign in the query itself.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestPartyRow, type PartyIngestRow } from "../../../src/rules/fight/partyIngest.ts";
import type { FightDeps } from "../../../src/rules/fight/fightEvents.ts";
import type { FightEffect, FightState } from "../../../src/rules/fight/fightState.ts";

/** The `party_members` columns a fight reads, of these members of this campaign. Errors are thrown, never read as "no rows". */
export async function loadPartyIngestRows(admin: SupabaseClient, campaignId: string, ids: string[]): Promise<PartyIngestRow[]> {
  const { data, error } = await admin
    .from("party_members")
    .select("id, current_hp, temp_hp, current_initiative, conditions, concentration, wildshape_state, death_save_successes, death_save_failures")
    .eq("campaign_id", campaignId)
    .in("id", ids);
  if (error) throw new Error(`party_members: ${error.message}`);
  return data as PartyIngestRow[];
}

/** The party members of a roster, each once. */
export function partyMemberIdsOf(state: FightState): string[] {
  return [...new Set(state.combatants.flatMap((c) => (c.party_member_id ? [c.party_member_id] : [])))];
}

/**
 * Applies each row to the fight, in order, and returns the new state with what the rows raised. `live` is whether the
 * players' screens are in this fight (the lobby included), not whether combat has started: a player rolls initiative in
 * the lobby, and a row read before the lobby opens still carries last session's roll.
 */
export function ingestPartyRows(state: FightState, rows: readonly PartyIngestRow[], live: boolean, fightDeps: FightDeps): { state: FightState; effects: FightEffect[] } {
  let current = state;
  const effects: FightEffect[] = [];
  for (const partyRow of rows) {
    const held = current.combatants.find((c) => c.party_member_id === partyRow.id);
    const result = ingestPartyRow(
      current,
      partyRow,
      // The spell the fight last knew the member concentrating on, so a spell dropped on the sheet ends what it held.
      { live, lastConcentration: held ? (held.concentration?.spellName ?? null) : undefined },
      fightDeps,
    );
    current = result.state;
    effects.push(...result.effects);
  }
  return { state: current, effects };
}
