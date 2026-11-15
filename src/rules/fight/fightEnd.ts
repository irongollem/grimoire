/**
 * What the end of a fight writes back, computed and not yet written: each
 * player character's and companion's patch, and where the party stands on the
 * site. The runner (or a server) does the writes; this is the deciding half of
 * the runner's "End combat".
 */
import type { AppliedCondition } from "../../types/condition.types.ts";
import type { ExploreParty } from "../../types/exploreParty.types.ts";
import type { RunCombatant } from "../../types/encounter.types.ts";
import type { PartyMemberUpdate } from "../../types/party.types.ts";
import { withoutDue } from "../conditions.ts";
import { partyAfterFight } from "./explorePositions.ts";

export interface EndOfFightPatches {
  partyMembers: Array<{ id: string; patch: PartyMemberUpdate }>;
  /** A companion persists HP and conditions the same way, so it walks into the next encounter at whatever state combat left it in (#569). */
  companions: Array<{ id: string; patch: { current_hp: number; conditions: AppliedCondition[] } }>;
  /** The party where the fight left them (#1133 decision 7); null when there is nothing to write. */
  exploreParty: ExploreParty | null;
}

export interface EndOfFightInput {
  /** The fight's own roster: HP, conditions, curses and death saves come from here. */
  combatants: readonly RunCombatant[];
  /** Where the tokens stand at the end. The live row's, when it is the fight's, since the runner's store does not hear a player moving their own token. */
  tokensAtEnd: readonly RunCombatant[];
  /** `campaigns.explore_party` as it stands before the fight's end writes. */
  exploreParty: ExploreParty | null;
  /** The site the fight is anchored in, if any. */
  siteId: string | null;
}

export function endOfFightPatches(input: EndOfFightInput): EndOfFightPatches {
  const partyMembers = input.combatants.flatMap((c) =>
    c.type === "player" && c.party_member_id
      ? [{
          id: c.party_member_id,
          patch: {
            current_hp: c.hp,
            conditions: withoutDue(c.conditions),
            curses: c.curses,
            // The roll was for this fight; the next lobby starts blank.
            current_initiative: null,
            death_save_successes: c.death_saves.successes,
            death_save_failures: c.death_saves.failures,
          },
        }]
      : [],
  );
  const companions = input.combatants.flatMap((c) =>
    c.type === "player" && c.companion_id
      ? [{ id: c.companion_id, patch: { current_hp: c.hp, conditions: withoutDue(c.conditions) } }]
      : [],
  );
  return { partyMembers, companions, exploreParty: partyAfterFight(input.tokensAtEnd, input.exploreParty, input.siteId) };
}
