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
import { attacksPerAttackAction, bestOfStrAndDex, featureReady, featureUse, memberClasses, monkTraining, sneakAttackFor, type AllyFeature, type MonkTraining, type SneakAttack } from "./features.ts";
import type { AttackShape } from "../../features/resolve.ts";
import { unarmedDamageBase } from "../../features/damageRoll.ts";
import { parseExpression } from "../../../lib/dice/dice.ts";
import { farthestFeet } from "../terrain/options/attacks.ts";

/** The row the sheet lists for a stick picked up off the floor: never a weapon the character holds, so never one a turn swings. */
const IMPROVISED_KEY = "improvised";

const UNARMED_KEY = "unarmed";

/**
 * RULE martial-arts (PHB 2014 "Monk: Martial Arts"; PHB 2024 "Martial Arts"): a Monk's Unarmed Strike and monk weapons use Dexterity or Strength, whichever is better, for
 * the attack and the damage, and may roll the Martial Arts die in place of the normal damage ("in place of" is a choice: the greater of the weapon's own die and the Martial Arts die
 * is rolled). It applies only while `monkTraining` holds (no armor or shield, no weapon that is not a monk weapon). The die is the sheet's catalogue `scaling` and the unarmed damage
 * is the sheet's own `unarmedDamageBase`. Any other member's strike is the row as listed (a Wild Shaped member's attacks are the form's, so this is never reached for one).
 */
function martialArtsRow(member: PlayerSheets["members"][number], row: AllyRow, training: MonkTraining): AllyRow {
  const strMod = abilityMod(member.str);
  const dexMod = abilityMod(member.dex);
  const best = bestOfStrAndDex(member);
  const unarmed = row.key === UNARMED_KEY;
  const averageOf = (dice: string): number => (parseExpression(dice)?.terms ?? []).reduce((sum, t) => sum + (t.count * (t.sides + 1)) / 2, 0);
  const signed = (n: number) => (n === 0 ? "" : n > 0 ? `+${n}` : String(n));
  if (unarmed) {
    const damage = unarmedDamageBase({ strMod, dexMod, martialArtsDie: training.die });
    return { ...row, attackBonus: best + proficiencyBonusOf(member), damageDice: `${damage.base}${signed(damage.modifier)}`, damageFixed: null } as AllyRow;
  }
  if (row.attackBonus === null) return row;
  // A monk weapon: the ability the row used gives way to the better of the two (what else is in the bonus, a magic weapon's, stays), and the Martial Arts die stands in for the weapon's own when it is greater.
  const used = row.shape !== null && row.shape.kind === "weapon" && !row.shape.usesStrength ? dexMod : strMod;
  const artsDie = unarmedDamageBase({ strMod, dexMod, martialArtsDie: training.die }).base;
  const base = row.baseDice !== null && averageOf(row.baseDice) > averageOf(artsDie) ? row.baseDice : artsDie;
  return { ...row, attackBonus: row.attackBonus - used + best, damageDice: `${base}${signed(row.modifier - used + best)}`, damageFixed: null } as AllyRow;
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
  // Under a Monk's Martial Arts (`monkTraining`: no armor or shield, and every weapon held is a monk weapon) each weapon strike is a monk weapon's, as well as the Unarmed Strike.
  const training = monkTraining(sheets, memberId);
  // Entries are found by name, so a held dagger that can be stabbed and thrown names its throw apart.
  const named = new Set<string>();
  const attacks: AllyAttack[] = [];
  const take = (made: AllyRow, suffix: string) => {
    if (made.key === IMPROVISED_KEY) return;
    const row = training !== null && (made.kind === "melee" || made.kind === "thrown") ? martialArtsRow(member, made, training) : made;
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

/**
 * How many times the means for this attack last: melee and bare hands without end, ammunition, charges or thrown weapons as many as one stack holds, and
 * a custom attack never (the player's own words: the sheet cannot say it is a weapon the Attack action swings).
 */
function supplyOf(row: AllyRow, gear: CarriedGear): number {
  if (row.kind === "melee") return Number.POSITIVE_INFINITY;
  if (row.kind === "ranged") {
    if (row.ammoTag === null) return weaponChargesLeft(row.weaponInvId, gear);
    const stack = availableAmmoFor(row.ammoTag, gear);
    return stack === null ? 0 : remainingOf(stack, gear);
  }
  if (row.kind === "thrown") return gear.inventory.find((i) => i.id === row.weaponInvId)?.quantity ?? 0;
  return 0;
}

/** The farthest an attack's entry reaches (its reach, or its longest range), the standing room the tactics give a set of swings; unknown reads as the shortest. */
function reachOfEntry(entry: StatBlockEntry): number {
  const attack = entry.structured.attack;
  return attack === undefined ? 0 : farthestFeet(attack);
}

/**
 * How good a swing is, to order the weapons of a mixed set: the average hit against an armour class of 12, times the chance to hit it. APP CONVENTION: a number to
 * order by only (the tactics weigh the real target's armour class afterwards); an attack whose damage cannot be read orders last.
 */
function strengthOf(entry: StatBlockEntry): number {
  const attack = entry.structured.attack;
  if (attack === undefined) return 0;
  let damage = 0;
  for (const part of attack.hit) {
    const parsed = parseExpression(part.dice);
    if (parsed === null) return 0;
    damage += parsed.terms.reduce((sum, t) => sum + (t.count * (t.sides + 1)) / 2, 0) + parsed.modifier;
  }
  return damage * Math.min(0.95, Math.max(0.05, (attack.bonus + 9) / 20));
}

/** One Multiattack entry of the block: `named` is its steps (`{ action, count }`), `label` how it reads in its name. */
interface SwingSet {
  label: string;
  steps: { action: string; count: number }[];
}

/**
 * RULE extra-attack, mixed weapons (PHB 2014 "Extra Attack": "you can attack twice, instead of once, whenever you take the Attack action"; each attack of the
 * Attack action is made with a weapon the character holds, and nothing says they are one weapon; 2024 the same): the sets of swings an Attack action of `swings(a)`
 * attacks can make. A set of one weapon is offered for each attack that can be made that many times. Where the best weapon of a kind (melee, or ranged and
 * thrown) cannot be swung that many times (one javelin, three daggers), the rest of the swings are the next best weapon of the kind, and so on: one more set,
 * "A + B". The set stays one standing place and one target, so only weapons of one kind mix, and the weapon of the shortest reach or range leads (it is the one that
 * says where the creature may stand, so every swing is then within its own range). A set that cannot be filled to two swings is not offered.
 */
function swingSets(attacks: readonly AllyAttack[], swings: (attack: AllyAttack) => number, gear: CarriedGear): SwingSet[] {
  const sets: SwingSet[] = [];
  for (const a of attacks) {
    const count = swings(a);
    if (count >= 2 && supplyOf(a.row, gear) >= count) sets.push({ label: a.entry.name, steps: [{ action: a.entry.name, count }] });
  }
  const kinds: AllyRow["kind"][][] = [["melee"], ["ranged", "thrown"]];
  for (const kind of kinds) {
    // The swings one Attack action holds can differ by weapon (the Warlock's pact weapon), and only attacks of the same number are in one set.
    const ofKind = attacks.filter((a) => kind.includes(a.row.kind) && supplyOf(a.row, gear) > 0);
    for (const count of new Set(ofKind.map(swings))) {
      if (count < 2) continue;
      const pool = ofKind.filter((a) => swings(a) === count).sort((a, b) => strengthOf(b.entry) - strengthOf(a.entry));
      if (pool.length < 2) continue;
      const steps: SwingSet["steps"] = [];
      let left = count;
      for (const a of pool) {
        const take = Math.min(left, supplyOf(a.row, gear));
        if (take > 0) steps.push({ action: a.entry.name, count: take });
        left -= take;
        if (left === 0) break;
      }
      if (steps.length < 2) continue;
      // The weapon that reaches least leads: it says where the creature may stand.
      const reach = (action: string) => reachOfEntry((attacks.find((a) => a.entry.name === action) as AllyAttack).entry);
      steps.sort((x, y) => reach(x.action) - reach(y.action));
      sets.push({ label: steps.map((st) => st.action).join(" + "), steps });
    }
  }
  return sets;
}

/**
 * RULE extra-attack (PHB 2014 and 2024 "Extra Attack"; `attacksPerAttackAction`): the Attack action makes as many attacks as the
 * class table gives, with the weapons the character holds. Each set of swings that can be made (`swingSets`) is offered as one
 * Multiattack entry, the way a monster's Multiattack is (the tactics, the options and `take_turn` read it unchanged).
 */
function extraAttackEntries(attacks: readonly AllyAttack[], perAction: (attack: AllyAttack) => number, gear: CarriedGear): StatBlockEntry[] {
  return swingSets(attacks, perAction, gear).filter((set) => set.steps.reduce((sum, st) => sum + st.count, 0) >= 2).map((set): StatBlockEntry => ({
    name: extraAttackName(set.label),
    description: `Makes ${set.steps.reduce((sum, st) => sum + st.count, 0)} attacks: ${set.steps.map((st) => `${st.action} x${st.count}`).join(", ")}.`,
    structured: { kind: "multiattack", source: "manual", multiattack: set.steps },
  }));
}

const ACTION_SURGE = "Action Surge";

/** The class feature a Multiattack entry of this block stands for (Action Surge), or null: what `take_turn` spends the sheet's use for. */
export function allyEntryFeature(action: string): AllyFeature | null {
  return action.startsWith(`${ACTION_SURGE} (`) ? "action_surge" : null;
}

/**
 * RULE action-surge (PHB 2014 "Fighter: Action Surge"; PHB 2024 "Action Surge"): on their turn the Fighter takes one additional action, once
 * per short rest (two uses from 17th level). The extra action is spent attacking: each set of swings that can be made twice over (the Attack action's
 * swings, mixed weapons too: `swingSets`) is offered as one more Multiattack entry, so the tactics weigh it by its expected damage
 * like any other attack (and so use it whenever an attack is in reach and a use is left). It is on the block only while the sheet
 * holds a use. A spell carried by the extra action is the tactics' (`surgeCast.ts`; 2014 only).
 */
function actionSurgeEntries(sheets: PlayerSheets, memberId: string, attacks: readonly AllyAttack[], perAction: (attack: AllyAttack) => number, gear: CarriedGear): StatBlockEntry[] {
  if (!featureReady(featureUse(sheets, memberId, "action_surge"))) return [];
  // A set that cannot swing more than the plain Attack action does is not worth the use (a mixed set short of pieces to throw).
  const worthIt = (set: SwingSet): boolean => {
    const lead = attacks.find((a) => a.entry.name === set.steps[0].action);
    return lead !== undefined && set.steps.reduce((sum, st) => sum + st.count, 0) > perAction(lead);
  };
  return swingSets(attacks, (a) => perAction(a) * 2, gear).filter(worthIt).map((set): StatBlockEntry => ({
    name: `${ACTION_SURGE} (${set.label})`,
    description: `Takes an additional action: ${set.steps.map((st) => `${st.action} x${st.count}`).join(", ")}.`,
    structured: { kind: "multiattack", source: "manual", multiattack: set.steps },
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
  // How many swings one Attack action holds for an attack: the class table's, and for a Warlock's pact weapon the Thirsting Blade's.
  const classes = memberClasses(sheets, memberId);
  const perAction = (a: AllyAttack) => attacksPerAttackAction(classes, { ruleset: member.ruleset, classChoices: member.class_choices }, { pactWeapon: a.row.kind === "melee" && a.row.key !== UNARMED_KEY });
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
      ...extraAttackEntries(attacks, perAction, carriedGearOf(sheets, memberId)),
      ...actionSurgeEntries(sheets, memberId, attacks, perAction, carriedGearOf(sheets, memberId)),
    ],
  };
}
