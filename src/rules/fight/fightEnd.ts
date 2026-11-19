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
import { partyAfterFight } from "../explore/explorePositions.ts";
import { DISENGAGED, DODGING } from "./stances.ts";

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

/**
 * The conditions a creature carries out of the fight. Fight-only bookkeeping stays behind (APP CONVENTION: the books
 * count these in a fight's turns and rounds, which end with the fight, and a character sheet has no turn to expire them on):
 * - the Dodge and Disengage stances;
 * - any condition with a duration measured in turns or rounds (`ends`: a turn edge, a count of rounds, or a repeat save
 *   at a turn edge), since nothing ticks them out of combat;
 * - a condition that rides on a fight combatant's concentration (`source.concentration`), because that spell's
 *   bookkeeping lives in the fight and nothing out of it could end it.
 * Everything else is kept: a plain Poisoned, Exhaustion, a curse's condition, a condition with no end named. No
 * condition here carries a real-time duration, so none is kept on that account.
 * `due` is dropped from what stays: nothing owes a roll out of combat.
 */
export function conditionsAfterFight(conditions: readonly AppliedCondition[], roster: readonly Pick<RunCombatant, "instance_id">[]): AppliedCondition[] {
  const inFight = new Set(roster.map((c) => c.instance_id));
  return withoutDue(
    conditions.filter(
      (c) =>
        c.name !== DODGING &&
        c.name !== DISENGAGED &&
        c.ends === undefined &&
        !(c.source?.concentration === true && inFight.has(c.source.id)),
    ),
  );
}

export function endOfFightPatches(input: EndOfFightInput): EndOfFightPatches {
  const partyMembers = input.combatants.flatMap((c) =>
    c.type === "player" && c.party_member_id
      ? [{
          id: c.party_member_id,
          patch: {
            current_hp: c.hp,
            conditions: conditionsAfterFight(c.conditions, input.combatants),
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
      ? [{ id: c.companion_id, patch: { current_hp: c.hp, conditions: conditionsAfterFight(c.conditions, input.combatants) } }]
      : [],
  );
  return { partyMembers, companions, exploreParty: partyAfterFight(input.tokensAtEnd, input.exploreParty, input.siteId) };
}
