// A party member the AI plays (an ally in a fight, #1021) seen through a stat block made from their own sheet, so the
// monster pipeline (turn options, tactics, resolution, opportunity attacks) plays them unchanged. Weapons first: the
// block holds the attacks their held weapons and bare hands make; a Wild Shaped member fights as the form's block.
// Spells and class features come in later stories.
// Pure and edge-importable (relative `.ts` imports only).

import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import type { PcCustomAttackRow, PcMeleeAttackRow, PcRangedAttackRow, PcThrownAttackRow } from "../../../types/pcAttack.types.ts";
import { emptyDefenses, type StatBlockEntry } from "../../../types/statBlock.types.ts";
import { proficiencyBonusOf } from "../../proficiencyBonus.ts";
import { attackEntryOf } from "../pcAttacks/entry.ts";
import { pcAttackRowsOf } from "../pcAttacks/rows.ts";
import { playerArmorClass, type PlayerSheets } from "../playerSheet.ts";
import { carriedGearOf, rangedAttackAvailable, rangedSpend, thrownAttackAvailable, thrownSpend, type AllySpend } from "../pcAttacks/gear.ts";

/** The row the sheet lists for a stick picked up off the floor: never a weapon the character holds, so never one a turn swings. */
const IMPROVISED_KEY = "improvised";

/** One attack an ally can make now: the entry on the block and the sheet row it was made from. */
type AllyRow = PcMeleeAttackRow | PcRangedAttackRow | PcThrownAttackRow | PcCustomAttackRow;

interface AllyAttack {
  entry: StatBlockEntry;
  row: AllyRow;
}

/**
 * The attacks a member's own sheet lists (`pcAttackRowsOf`): held melee, ranged and thrown weapons, Unarmed Strike, and
 * any custom attack with a to-hit bonus. The Improvised Weapon row is left out, and a custom attack with nothing to roll
 * (an auto-hit, a save) is not an attack the rules can make (`attackEntryOf` is null). A ranged attack with no
 * ammunition (or charges) left is not offered, and neither is a throw with no weapon left to throw (PHB 2014 "Ammunition").
 */
function allyAttacks(sheets: PlayerSheets, memberId: string): AllyAttack[] | null {
  const member = sheets.members.find((m) => m.id === memberId);
  if (member === undefined) return null;
  const gear = carriedGearOf(sheets, memberId);
  const rows = pcAttackRowsOf({ member, inventory: gear.inventory, itemOf: gear.itemOf });
  // Entries are found by name, so a held dagger that can be stabbed and thrown names its throw apart.
  const named = new Set<string>();
  const attacks: AllyAttack[] = [];
  const take = (row: AllyRow, suffix: string) => {
    if (row.key === IMPROVISED_KEY) return;
    const entry = attackEntryOf(row);
    if (entry === null) return;
    const name = named.has(entry.name) ? `${entry.name}${suffix}` : entry.name;
    if (named.has(name)) return;
    named.add(name);
    attacks.push({ entry: { ...entry, name }, row });
  };
  for (const row of rows.melee) take(row, "");
  for (const row of rows.ranged) if (rangedAttackAvailable(row, gear)) take(row, " (ranged)");
  for (const row of rows.thrown) if (thrownAttackAvailable(row, gear)) take(row, " (thrown)");
  for (const row of rows.custom) take(row, " (custom)");
  return attacks;
}

/**
 * What the attack named `action` on this member's block used up: one piece of ammunition (or a charge) for a ranged
 * attack, the weapon itself for a throw, which then lies on the ground (the browser's own rule, `useThrownWeapon`).
 * Null for any other attack, for a Wild Shaped member (a beast's attacks use nothing up) and for a name not on the block.
 */
export function allyAttackSpend(sheets: PlayerSheets, memberId: string, action: string): AllySpend | null {
  const member = sheets.members.find((m) => m.id === memberId);
  if (member === undefined || member.wildshape_state !== null) return null;
  const found = (allyAttacks(sheets, memberId) ?? []).find((a) => a.entry.name === action);
  if (found === undefined) return null;
  const gear = carriedGearOf(sheets, memberId);
  if (found.row.kind === "ranged") return rangedSpend(memberId, action, found.row, gear);
  if (found.row.kind === "thrown") return thrownSpend(memberId, action, found.row, gear);
  return null;
}

/**
 * The block for one party member, or null when the server cannot play them this way: their row was not read, their armour
 * class cannot be worked out, or they are Wild Shaped into a form whose block was not read.
 *
 * A Wild Shaped member fights as the form (`formStatBlock`). Otherwise the block holds the attacks of `allyAttacks`.
 */
export function allyStatBlock(sheets: PlayerSheets, memberId: string): MonsterStatBlock | null {
  const member = sheets.members.find((m) => m.id === memberId);
  if (member === undefined) return null;
  const armorClass = playerArmorClass(sheets, memberId);
  if (armorClass === null) return null;
  const form = member.wildshape_state;
  if (form !== null) {
    const beast = sheets.beasts.find((b) => b.id === form.monster_id)?.stat_block ?? null;
    // RULE wild-shape (PHB 2014 "Wild Shape"; PHB 2024 "Wild Shape"): the beast's game statistics replace the character's, the
    // character keeping Intelligence, Wisdom and Charisma. Its attacks, speed and traits are the form's own; spells,
    // legendary and lair actions are not carried into a form, and the character's hit points are the fight's own pools.
    if (beast === null || beast.speed === undefined) return null;
    return {
      armor_class: armorClass,
      hit_points: "1",
      speed: beast.speed,
      str: beast.str, dex: beast.dex, con: beast.con, int: member.int, wis: member.wis, cha: member.cha,
      challenge_rating: "0",
      proficiency_bonus: proficiencyBonusOf(member),
      defenses: beast.defenses === undefined ? emptyDefenses() : beast.defenses,
      ...(beast.senses === undefined ? {} : { senses: beast.senses }),
      ...(beast.special_abilities === undefined ? {} : { special_abilities: beast.special_abilities }),
      actions: beast.actions === undefined ? [] : beast.actions,
      ...(beast.bonus_actions === undefined ? {} : { bonus_actions: beast.bonus_actions }),
    };
  }
  const attacks = allyAttacks(sheets, memberId);
  if (attacks === null) return null;

  return {
    armor_class: armorClass,
    // Not read by a turn: the fight holds the character's real hit points.
    hit_points: "1",
    speed: `${member.speed} ft.`,
    str: member.str, dex: member.dex, con: member.con, int: member.int, wis: member.wis, cha: member.cha,
    challenge_rating: "0",
    proficiency_bonus: proficiencyBonusOf(member),
    defenses: emptyDefenses(),
    actions: attacks.map((a) => a.entry),
  };
}
