// When an ally's Rage ends before its time (#1021). The book gives a Rage four ways to end besides running out, and they differ by
// edition, so the rule is one pure function over what a command changed on the Barbarian: the verdict says whether the Rage is kept
// going, ended, or (2024) extended. The server applies it after every command, and the browser on its own apply of one (`./rageUpkeep.ts`), because a
// blow that knocks the Barbarian out, an attack it makes and the damage it takes all arrive through different commands.
//
// Only a Rage the server started for an ally is judged (`ragingOf`: the condition `ragingCondition` makes, sourced on its own bearer
// with the spell "Rage"). A "Raging" the DM typed onto a player by hand is the table's, and a human-played Barbarian's attacks are
// rolled at the table, not seen here, so judging it would end a Rage that is going fine.
//
// Pure and edge-importable (relative `.ts` imports only).

import type { AppliedCondition } from "../../../types/condition.types.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import { isIncapacitated } from "../../conditions.ts";
import { RAGING } from "./features.ts";

/** The `action_uses` tally (2014): this Rage has been kept going since the Barbarian's last turn ended, by an attack or by damage. Cleared when its turn ends. */
export const RAGE_KEPT = "rage/kept";
/** The `action_uses` tally: a Rage began in this fight, so a rage the sheet still shows as active is not started again after it ended. */
export const RAGE_STARTED = "rage/started";

/** The Rage the server runs for this ally, or null: not a party member, not raging, or a Raging that is not the one `ragingCondition` makes. */
export function ragingOf(c: RunCombatant): AppliedCondition | null {
  if (c.type !== "player" || c.party_member_id === undefined) return null;
  return c.conditions.find((x) => x.name === RAGING && x.source !== undefined && x.source.spell === "Rage" && x.source.id === c.instance_id) ?? null;
}

/** 2024 Rage lasts "until the end of your next turn" and is carried by that rule (a `turn` end); the 2014 Rage is a minute (rounds). */
export const isTurnLongRage = (rage: AppliedCondition): boolean => rage.ends !== undefined && rage.ends.kind === "turn";

/** Attacks it has been seen to make: the fight's own tally of its attack rolls, hit or miss. */
const attacksMade = (c: RunCombatant): number => (c.shown_deeds === undefined ? 0 : c.shown_deeds.melee + c.shown_deeds.ranged);

/** Whether the tally key holds a use. */
export const tallied = (c: RunCombatant, key: string): boolean => {
  const entry = c.action_uses === undefined ? undefined : c.action_uses[key];
  return entry !== undefined && entry.used > 0;
};

export type RageVerdict =
  | { do: "end"; reason: string }
  /** 2014: the Rage is kept going for this turn's end (it attacked a creature or took damage); the caller tallies it. */
  | { do: "keep" }
  /** 2024: the Barbarian made an attack roll on the turn the Rage would end, which carries it to the end of its next turn. */
  | { do: "extend" };

/**
 * RULE rage-ends (PHB 2014 "Barbarian: Rage": "Your rage lasts for 1 minute. It ends early if you are knocked unconscious or if your turn ends and you
 * haven't attacked a hostile creature since your last turn or taken damage since then."; PHB 2024 "Rage": the Rage lasts until the end of your next turn
 * and "ends early if you ... have the Incapacitated condition"; on your next turn you extend it for another round by making an attack roll against an
 * enemy, forcing an enemy to make a saving throw, or taking a Bonus Action to extend it). `before` and `after` are the Barbarian as a command found it and
 * left it.
 * - 2014: knocked unconscious (the Unconscious condition, or 0 hit points) ends it; an attack made or damage taken (hit points or temporary hit
 *   points lowered) is the "kept going" the turn's end reads (`rageGoesOutAtTurnEnd`). Both are recorded by `after` against `before`.
 * - 2024: Incapacitated, or 0 hit points, ends it; an attack made while the Rage is armed (it is the turn that would end it) extends it. Forcing a save
 *   is not an ally's attack in this app (no weapon or feature of an ally's block forces one), and the Bonus Action extension is `chooseBonusAction`'s.
 * APP CONVENTION: an attack counts when it was rolled (`shown_deeds` melee or ranged), whoever it was at; it is not checked to be a hostile creature.
 * Null for a combatant not raging by the server's hand.
 */
export function rageAfterCommand(before: RunCombatant | undefined, after: RunCombatant): RageVerdict | null {
  const rage = ragingOf(after);
  if (rage === null || before === undefined) return null;
  const down = after.hp <= 0;
  if (isTurnLongRage(rage)) {
    if (down || isIncapacitated(after.conditions)) return { do: "end", reason: "Rage ends: it is Incapacitated." };
    if (rage.ends !== undefined && rage.ends.kind === "turn" && rage.ends.armed === true && attacksMade(after) > attacksMade(before)) return { do: "extend" };
    return null;
  }
  if (down || after.conditions.some((c) => c.name === "Unconscious")) return { do: "end", reason: "Rage ends: it was knocked unconscious." };
  const hurt = after.hp < before.hp || (after.temp_hp === undefined ? 0 : after.temp_hp) < (before.temp_hp === undefined ? 0 : before.temp_hp);
  return hurt || attacksMade(after) > attacksMade(before) ? { do: "keep" } : null;
}

/**
 * RULE rage-ends, at the end of the Barbarian's turn (PHB 2014 "Rage"): the 2014 Rage goes out unless it was kept going by an attack made or damage
 * taken since its last turn ended (`RAGE_KEPT`). A 2024 Rage ends by its own duration (the condition's `turn` end), so nothing is decided here for it.
 */
export function rageGoesOutAtTurnEnd(c: RunCombatant): boolean {
  const rage = ragingOf(c);
  return rage !== null && !isTurnLongRage(rage) && !tallied(c, RAGE_KEPT);
}

/** A 2024 Rage that is armed: this is the Barbarian's turn that would end it, unless an attack roll or the Bonus Action extends it. */
export function rageEndsThisTurn(c: RunCombatant): boolean {
  const rage = ragingOf(c);
  return rage !== null && rage.ends !== undefined && rage.ends.kind === "turn" && rage.ends.armed === true;
}
