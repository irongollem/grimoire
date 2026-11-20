// Who needs healing, and how badly (#1021). Pure and edge-importable (relative `.ts` imports only).
//
// RULE healing-down (PHB 2014 ch. 9 "Dropping to 0 Hit Points" and "Death Saving Throws"; PHB 2024 "Dropping to 0 Hit Points"):
// a character at 0 hit points who is not dead is dying or stable, and any healing that brings them above 0 ends the
// Unconscious state and the death saves (`healingOutcome`, which `adjust_hp` applies). A character with three failed saves is
// dead and healing does not bring them back; a monster, an NPC or a companion at 0 is dead here (`takesTurnsInFight`).
// APP CONVENTION: "low" is below half the maximum hit points, the same line a Second Wind is saved for (`tactics/bonusAction.ts`).

import type { RunCombatant } from "../../../types/encounter.types.ts";
import { takesTurnsInFight } from "../standing.ts";

/** `down`: at 0 and alive; `low`: above 0 and below half; `hurt`: any other wound; null: nothing to heal, or dead. */
export type HealNeed = "down" | "low" | "hurt" | null;

export function healNeedOf(c: Pick<RunCombatant, "hp" | "max_hp" | "type" | "death_saves" | "party_member_id">): HealNeed {
  if (c.hp <= 0) return takesTurnsInFight(c) ? "down" : null;
  if (c.hp >= c.max_hp) return null;
  return c.hp * 2 < c.max_hp ? "low" : "hurt";
}
