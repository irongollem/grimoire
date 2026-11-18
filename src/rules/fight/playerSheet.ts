// What the server needs of a player character to adjudicate against them (#1201, stage 4): the armour class the
// runner shows for them and the bonus on a saving throw. Both are worked out, never stored: the same pure rules the
// character sheet uses (`calculateAc` over worn gear, `savingThrowEntries` over the scores in effect), fed from rows
// the server read instead of the browser's caches. Pure, with no Vue, so an edge function can load it.

import type { PartyInventoryItem } from "../../types/inventory.types.ts";
import type { Item } from "../../types/item.types.ts";
import type { AbilityScores } from "../../types/multiclass.types.ts";
import type { WildshapeState } from "../../types/encounter.types.ts";
import type { PartyMember } from "../../types/party.types.ts";
import type { SaveAbility } from "../../types/statBlock.types.ts";
import { parseArmorClass } from "../../lib/encounters/actionTargeting.ts";
import { calculateAc, wornGearByMember } from "../armorClass.ts";
import { effectiveAbilityScores, savingThrowEntries } from "../characterChecks.ts";
import { abilityMod } from "../weaponAttack.ts";

/** The `party_members` columns this module reads, and no others. */
export type PlayerSheetRow = Pick<
  PartyMember,
  | "id" | "ruleset" | "class" | "subclass" | "ac_formula" | "class_choices"
  | "str" | "dex" | "con" | "int" | "wis" | "cha"
  | "proficiency_bonus" | "saving_throw_proficiencies"
> & { wildshape_state: WildshapeState | null };

/** The scores of a Wild Shape form's stat block, by the monster id the form names. */
export interface BeastScores {
  id: string;
  stat_block: Pick<AbilityScores, "str" | "dex" | "con"> | null;
}

/** Everything the server read about a fight's player characters. */
export interface PlayerSheets {
  members: PlayerSheetRow[];
  /** The campaign's inventory rows (those carried by these members matter). */
  inventory: PartyInventoryItem[];
  /** The items those rows reference, library rows already normalised. */
  items: Item[];
  /** The stat blocks of the forms the members are shaped into. */
  beasts: BeastScores[];
}

function memberRow(sheets: PlayerSheets, memberId: string): PlayerSheetRow | null {
  return sheets.members.find((m) => m.id === memberId) ?? null;
}

/**
 * The AC the runner shows for this player: the form's own while Wild Shaped (the beast's AC replaces the
 * character's, as `useMemberVitals` has it), otherwise the calculation over what they wear. Null when the
 * character's row was not read, or the beast's AC is not a number.
 */
export function playerArmorClass(sheets: PlayerSheets, memberId: string): number | null {
  const member = memberRow(sheets, memberId);
  if (!member) return null;
  if (member.wildshape_state) return parseArmorClass(member.wildshape_state.beast_ac);
  const gear = wornGearByMember(sheets.inventory, sheets.items)[member.id] ?? [];
  return calculateAc(member, gear).total;
}

/**
 * The bonus on this player's saving throw: the ability modifier from the scores in effect (a Wild Shape form's
 * STR, DEX and CON replace theirs) plus the proficiency bonus when they are proficient. Nothing they wear adds to
 * a save in this app. Null when the character's row was not read.
 */
export function playerSaveBonus(sheets: PlayerSheets, memberId: string, ability: SaveAbility): number | null {
  const member = memberRow(sheets, memberId);
  if (!member) return null;
  const form = member.wildshape_state;
  const beast = form ? (sheets.beasts.find((b) => b.id === form.monster_id)?.stat_block ?? null) : null;
  const scores = effectiveAbilityScores(member, { active: form !== null, statBlock: beast });
  const entry = savingThrowEntries(member, scores)?.[ability];
  return entry ? entry.bonus : null;
}

/**
 * The modifier of this player's ability score, for an ability check: from the scores in effect (a Wild Shape form's STR,
 * DEX and CON replace theirs). No proficiency is added: the sheet this reads holds no skill proficiencies, so a check
 * that names a skill is not one the server can work out for a player. Null when the character's row was not read.
 */
export function playerAbilityModifier(sheets: PlayerSheets, memberId: string, ability: SaveAbility): number | null {
  const member = memberRow(sheets, memberId);
  if (!member) return null;
  const form = member.wildshape_state;
  const beast = form ? (sheets.beasts.find((b) => b.id === form.monster_id)?.stat_block ?? null) : null;
  return abilityMod(effectiveAbilityScores(member, { active: form !== null, statBlock: beast })[ability]);
}
