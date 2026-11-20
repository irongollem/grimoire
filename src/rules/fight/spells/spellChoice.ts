// Which spell record a creature's printed spell name means (#1021, row 5b). A stat block names a spell in prose
// ("fireball"), and the same name exists in several source books, in both editions, some of them with no mechanics
// filled in. Pure and edge-importable (relative `.ts` imports only).
//
// APP CONVENTION: a campaign's own spell comes first and is taken at its word: the DM wrote it, and their table's
// rules are theirs to set (a homebrew Fireball that deals 6d6 deals 6d6 here). Among library records the campaign's
// edition comes first, then reviewed mechanics (the #1123 check approves a record only when its stored numbers
// provably match its own text). A library record that is not reviewed is never automated, however complete it looks,
// because nothing has proved it right.

import type { RulesetKey } from "../../../types/ruleset.types.ts";
import type { Spell } from "../../../types/spell.types.ts";
import { spellKey } from "./castLimit.ts";

/** The columns the casting rules read from `library_spells` or a campaign's own `spells`. */
export type SpellRecord = Pick<
  Spell,
  | "id" | "name" | "level" | "range" | "ruleset" | "source" | "concentration" | "attack_type" | "save_attribute" | "save_effect"
  | "damage_rolls" | "healing_dice" | "aoe_shape" | "aoe_size" | "higher_level_damage" | "mechanics_reviewed" | "effects" | "condition_effect"
> & Partial<Pick<Spell, "casting_time" | "casting_time_custom">> & {
  /** A campaign's own spell (`spells`), as against a shared library record. Set by whoever loads the records. */
  own?: true;
};

export interface ChosenSpell {
  record: SpellRecord;
  /** True for a campaign's own spell and for a reviewed library record. Whether its data is enough to roll is `spellEntryFor`'s call. */
  automatable: boolean;
}

/**
 * Among the records of that name: the campaign's own first; then the campaign's edition, then any other; within
 * that the reviewed ones first. Records listed earlier win a tie. Null when no record has the name.
 */
export function pickSpellRecord(name: string, records: readonly SpellRecord[], ruleset: RulesetKey): ChosenSpell | null {
  const wanted = spellKey(name);
  const rank = (r: SpellRecord): number => (r.own === true ? 0 : 4) + (r.ruleset === ruleset ? 0 : 2) + (r.mechanics_reviewed === true ? 0 : 1);
  const named = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => spellKey(record.name) === wanted)
    .sort((a, b) => rank(a.record) - rank(b.record) || a.index - b.index);
  const first = named[0];
  if (first === undefined) return null;
  return { record: first.record, automatable: first.record.own === true || first.record.mechanics_reviewed === true };
}
