// What kind of creature a combatant is (#1021, row 5b): the one thing a spell limited to a kind ("humanoid" for Hold
// Person, "beast" for Dominate Beast) needs to know about what it is aimed at. A fight stores no creature type on a
// combatant, so it is read from the source row behind it. Pure and edge-importable (relative `.ts` imports only).
//
// APP CONVENTIONS:
// - A creature backed by a monster row has that row's `monster_type`, a closed list of single words (beast, humanoid,
//   undead, ...), compared case-insensitively. A blank or missing value is not known.
// - A player character is a Humanoid. Every playable species of the 2014 and 2024 Player's Handbooks is one, and a
//   character sheet stores no creature type.
// - An NPC or a companion with no monster row behind it is not known. Its free-text `race` and a companion's
//   `companion_type` are not creature kinds of the rules, so nothing is guessed from them.

import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { SpellRecord } from "./spellChoice.ts";

/** The part of a fight's stat block sources a kind is read from. */
export interface KindSources {
  monsters: readonly { id: string; monster_type?: string | null }[];
}

/** The creature kind of a combatant, lower-cased and trimmed, or null when the fight cannot tell. */
export function creatureKindOf(c: RunCombatant, sources: KindSources): string | null {
  if (c.type === "player") return "humanoid";
  if (!c.monster_id) return null;
  const type = sources.monsters.find((m) => m.id === c.monster_id)?.monster_type;
  if (type === undefined || type === null) return null;
  const kind = type.trim().toLowerCase();
  return kind === "" ? null : kind;
}

/** The kinds a spell's condition is limited to (lower-cased), or null when it has no such limit. */
export function kindLimitOf(record: SpellRecord): readonly string[] | null {
  const effect = record.condition_effect;
  if (effect === null || effect === undefined || effect.verdict !== "condition" || effect.only_kinds.length === 0) return null;
  return effect.only_kinds.map((k) => k.trim().toLowerCase());
}

/** Whether a creature of this kind (null: not known) is one a limited spell may be cast on. Unknown is never allowed. */
export function kindAllowed(kind: string | null, limit: readonly string[]): boolean {
  return kind !== null && limit.includes(kind);
}

/** "a humanoid", "an undead or a beast": the kinds as a spell's refusal names them. */
export function kindPhrase(limit: readonly string[]): string {
  return limit.map((k) => `${/^[aeiou]/.test(k) ? "an" : "a"} ${k}`).join(" or ");
}
