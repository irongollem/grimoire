// A party member the AI plays (an ally in a fight, #1021) seen through a stat block made from their own sheet, so the
// monster pipeline (turn options, tactics, resolution, opportunity attacks) plays them unchanged. Weapons first: the
// block holds the attacks their held weapons and bare hands make and a Spellcasting entry for the spells they have ready
// (`allySpellcastingEntries`); a Wild Shaped member fights as the form's block. Class features (`features.ts`): Extra Attack is a Multiattack entry here, and Sneak Attack
// is added to a hit by `resolve_attack` (`allySneakAttack`).
// Pure and edge-importable (relative `.ts` imports only).

import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import type { PcCustomAttackRow, PcMeleeAttackRow, PcRangedAttackRow, PcThrownAttackRow } from "../../../types/pcAttack.types.ts";
import { emptyDefenses, type StatBlockEntry } from "../../../types/statBlock.types.ts";
import { proficiencyBonusOf } from "../../proficiencyBonus.ts";
import { abilityMod } from "../../abilityScore.ts";
import { attackEntryOf } from "../pcAttacks/entry.ts";
import { pcAttackRowsOf } from "../pcAttacks/rows.ts";
import { playerArmorClass, type PlayerSheets } from "../playerSheet.ts";
import { allySpellcastingEntries, type CastTally } from "./spells.ts";
import { availableAmmoFor, carriedGearOf, rangedAttackAvailable, rangedSpend, remainingOf, thrownAttackAvailable, thrownSpend, weaponChargesLeft, type AllySpend, type CarriedGear } from "../pcAttacks/gear.ts";
import { attacksPerAttackAction, bestOfStrAndDex, featureReady, featureUse, martialArtsDie, memberClasses, sneakAttackFor, type AllyFeature, type SneakAttack } from "./features.ts";
import type { AttackShape } from "../../features/resolve.ts";
import { unarmedDamageBase } from "../../features/damageRoll.ts";

/** The row the sheet lists for a stick picked up off the floor: never a weapon the character holds, so never one a turn swings. */
const IMPROVISED_KEY = "improvised";

const UNARMED_KEY = "unarmed";

/**
 * RULE martial-arts (PHB 2014 "Monk: Martial Arts"; PHB 2024 "Martial Arts"): a Monk's Unarmed Strike rolls the Martial Arts die in place of
 * the flat 1 + Strength, and uses Dexterity or Strength, whichever is better, for the attack and the damage. The die is the sheet's
 * catalogue `scaling` (`martialArtsDie`) and the damage is the sheet's own `unarmedDamageBase`. Any other member's strike is the row as
 * listed (a Wild Shaped member's attacks are the form's, so this is never reached for one).
 */
function martialArtsRow(sheets: PlayerSheets, member: PlayerSheets["members"][number], row: AllyRow): AllyRow {
  const die = martialArtsDie(sheets, member.id);
  if (die === null) return row;
  const mod = bestOfStrAndDex(member);
  const damage = unarmedDamageBase({ strMod: abilityMod(member.str), dexMod: abilityMod(member.dex), martialArtsDie: die });
  return { ...row, attackBonus: mod + proficiencyBonusOf(member), damageDice: `${damage.base}${damage.modifier === 0 ? "" : damage.modifier > 0 ? `+${damage.modifier}` : String(damage.modifier)}`, damageFixed: null } as AllyRow;
}

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
  const take = (made: AllyRow, suffix: string) => {
    if (made.key === IMPROVISED_KEY) return;
    const row = made.key === UNARMED_KEY ? martialArtsRow(sheets, member, made) : made;
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

/** The name of the Multiattack entry that makes `count` swings of one attack, as the Attack action's Extra Attack does. */
const extraAttackName = (attack: string) => `Extra Attack (${attack})`;

/** Whether the means for `count` swings of this attack are in one place: melee and bare hands always, ammunition, charges or thrown weapons only when one stack holds that many. */
function canSwingTimes(row: AllyRow, gear: CarriedGear, count: number): boolean {
  if (row.kind === "melee") return true;
  if (row.kind === "ranged") {
    if (row.ammoTag === null) return weaponChargesLeft(row.weaponInvId, gear) >= count;
    const stack = availableAmmoFor(row.ammoTag, gear);
    return stack !== null && remainingOf(stack, gear) >= count;
  }
  if (row.kind === "thrown") return (gear.inventory.find((i) => i.id === row.weaponInvId)?.quantity ?? 0) >= count;
  // A custom attack is the player's own words: the sheet cannot say it is a weapon the Attack action swings.
  return false;
}

/**
 * RULE extra-attack (PHB 2014 and 2024 "Extra Attack"; `attacksPerAttackAction`): the Attack action makes as many attacks as the
 * class table gives, with the weapons the character holds. Each attack that can be made that many times is offered as one
 * Multiattack entry of that many swings of it, the way a monster's Multiattack is (the tactics, the options and `take_turn` read
 * it unchanged). The swings are the same weapon: a mixed set of weapons is not offered yet.
 */
function extraAttackEntries(attacks: readonly AllyAttack[], perAction: number, gear: CarriedGear): StatBlockEntry[] {
  if (perAction < 2) return [];
  return attacks.filter((a) => canSwingTimes(a.row, gear, perAction)).map((a): StatBlockEntry => ({
    name: extraAttackName(a.entry.name),
    description: `Makes ${perAction} attacks: ${a.entry.name} x${perAction}.`,
    structured: { kind: "multiattack", source: "manual", multiattack: [{ action: a.entry.name, count: perAction }] },
  }));
}

const ACTION_SURGE = "Action Surge";

/** The class feature a Multiattack entry of this block stands for (Action Surge), or null: what `take_turn` spends the sheet's use for. */
export function allyEntryFeature(action: string): AllyFeature | null {
  return action.startsWith(`${ACTION_SURGE} (`) ? "action_surge" : null;
}

/**
 * RULE action-surge (PHB 2014 "Fighter: Action Surge"; PHB 2024 "Action Surge"): on their turn the Fighter takes one additional action, once
 * per short rest (two uses from 17th level). The extra action is spent attacking: each attack that can be swung that many times
 * is offered as one more Multiattack entry of twice the Attack action's swings, so the tactics weigh it by its expected damage
 * like any other attack (and so use it whenever an attack is in reach and a use is left). It is on the block only while the sheet
 * holds a use. Spells are not cast with the extra action yet.
 */
function actionSurgeEntries(sheets: PlayerSheets, memberId: string, attacks: readonly AllyAttack[], perAction: number, gear: CarriedGear): StatBlockEntry[] {
  if (!featureReady(featureUse(sheets, memberId, "action_surge"))) return [];
  const swings = perAction * 2;
  return attacks.filter((a) => canSwingTimes(a.row, gear, swings)).map((a): StatBlockEntry => ({
    name: `${ACTION_SURGE} (${a.entry.name})`,
    description: `Takes an additional action: ${a.entry.name} x${swings}.`,
    structured: { kind: "multiattack", source: "manual", multiattack: [{ action: a.entry.name, count: swings }] },
  }));
}

/**
 * Sneak Attack on the attack named `action` of this member (`sneakAttackFor`: the dice and whether this attack is one it rides, both
 * the sheet's feature rules), or null: no Rogue levels, an attack it does not ride, a Wild Shaped member (the form's attacks are
 * the beast's, not a weapon the Rogue holds) or a name not on the block. Whether this swing meets the advantage or the
 * adjacent-enemy condition, and whether the turn's one use is spent, are the fight's to say (`resolve_attack`).
 */
export function allySneakAttack(sheets: PlayerSheets, memberId: string, action: string): SneakAttack | null {
  const member = sheets.members.find((m) => m.id === memberId);
  if (member === undefined || member.wildshape_state !== null) return null;
  const found = (allyAttacks(sheets, memberId) ?? []).find((a) => a.entry.name === action);
  if (found === undefined) return null;
  return sneakAttackFor(sheets.casting.classes.filter((c) => c.party_member_id === memberId), member.ruleset, found.row.shape);
}

/** The sheet's shape of the attack named `action` on this member's block (weapon, finesse, Strength, unarmed), or null for a Wild Shaped member and for a name not on the block. */
export function allyAttackShape(sheets: PlayerSheets, memberId: string, action: string): AttackShape | null {
  const member = sheets.members.find((m) => m.id === memberId);
  if (member === undefined || member.wildshape_state !== null) return null;
  const found = (allyAttacks(sheets, memberId) ?? []).find((a) => a.entry.name === action);
  return found === undefined ? null : found.row.shape;
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
 * A Wild Shaped member fights as the form (`formStatBlock`). Otherwise the block holds the attacks of `allyAttacks` and, for a
 * member with spells ready, a Spellcasting entry per source. `tally` is the member's own combatant's `action_uses` (the casts the
 * fight already counts), which the slot counts of the entry are worked out against.
 */
export function allyStatBlock(sheets: PlayerSheets, memberId: string, tally?: CastTally, raging = false): MonsterStatBlock | null {
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
  // RULE rage (PHB 2014 "Rage"; PHB 2024 "Rage"): you can't cast spells or concentrate on them while raging, so a raging member's block lists none.
  const spellcasting = raging ? [] : allySpellcastingEntries(sheets, memberId, tally);

  return {
    armor_class: armorClass,
    // Not read by a turn: the fight holds the character's real hit points.
    hit_points: "1",
    speed: `${member.speed} ft.`,
    str: member.str, dex: member.dex, con: member.con, int: member.int, wis: member.wis, cha: member.cha,
    challenge_rating: "0",
    proficiency_bonus: proficiencyBonusOf(member),
    defenses: emptyDefenses(),
    ...(spellcasting.length === 0 ? {} : { special_abilities: spellcasting }),
    actions: [
      ...attacks.map((a) => a.entry),
      ...extraAttackEntries(attacks, attacksPerAttackAction(memberClasses(sheets, memberId)), carriedGearOf(sheets, memberId)),
      ...actionSurgeEntries(sheets, memberId, attacks, attacksPerAttackAction(memberClasses(sheets, memberId)), carriedGearOf(sheets, memberId)),
    ],
  };
}
