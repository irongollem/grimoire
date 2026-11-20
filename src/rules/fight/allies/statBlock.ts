// A party member the AI plays (an ally in a fight, #1021) seen through a stat block made from their own sheet, so the
// monster pipeline (turn options, tactics, resolution, opportunity attacks) plays them unchanged. Weapons first: the
// block holds the attacks their held weapons and bare hands make; spells and class features come in later stories.
// Pure and edge-importable (relative `.ts` imports only).

import { inventoryItemRef } from "../../../lib/itemRef.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import type { PcAttackRow } from "../../../types/pcAttack.types.ts";
import { emptyDefenses, type StatBlockEntry } from "../../../types/statBlock.types.ts";
import { proficiencyBonusOf } from "../../proficiencyBonus.ts";
import { attackEntryOf } from "../pcAttacks/entry.ts";
import { pcAttackRowsOf } from "../pcAttacks/rows.ts";
import { playerArmorClass, type PlayerSheets } from "../playerSheet.ts";

/** The row the sheet lists for a stick picked up off the floor: never a weapon the character holds, so never one a turn swings. */
const IMPROVISED_KEY = "improvised";

/**
 * The block for one party member, or null when the server cannot play them this way: their row was not read, they are
 * Wild Shaped (the beast's attacks are not read from a sheet yet, so the form has no turn the rules can play), or their
 * armour class cannot be worked out.
 *
 * Attacks are the ones the character's own sheet lists (`pcAttackRowsOf`): held melee, ranged and thrown weapons,
 * Unarmed Strike, and any custom attack with a to-hit bonus. The Improvised Weapon row is left out, and a custom
 * attack with nothing to roll (an auto-hit, a save) is not an attack the rules can make (`attackEntryOf` is null).
 * Ammunition and thrown weapons are not spent yet.
 */
export function allyStatBlock(sheets: PlayerSheets, memberId: string): MonsterStatBlock | null {
  const member = sheets.members.find((m) => m.id === memberId);
  if (member === undefined || member.wildshape_state !== null) return null;
  const armorClass = playerArmorClass(sheets, memberId);
  if (armorClass === null) return null;

  const rows = pcAttackRowsOf({
    member,
    inventory: sheets.inventory.filter((inv) => inv.carried_by === memberId),
    itemOf: (inv) => {
      const ref = inventoryItemRef(inv);
      return ref === null ? undefined : sheets.items.find((item) => item.id === ref);
    },
  });
  // Entries are found by name, so a held dagger that can be stabbed and thrown names its throw apart.
  const named = new Set<string>();
  const actions: StatBlockEntry[] = [];
  const take = (row: PcAttackRow, suffix: string) => {
    if (row.key === IMPROVISED_KEY) return;
    const entry = attackEntryOf(row);
    if (entry === null) return;
    const name = named.has(entry.name) ? `${entry.name}${suffix}` : entry.name;
    if (named.has(name)) return;
    named.add(name);
    actions.push({ ...entry, name });
  };
  for (const row of rows.melee) take(row, "");
  for (const row of rows.ranged) take(row, " (ranged)");
  for (const row of rows.thrown) take(row, " (thrown)");
  for (const row of rows.custom) take(row, " (custom)");

  return {
    armor_class: armorClass,
    // Not read by a turn: the fight holds the character's real hit points.
    hit_points: "1",
    speed: `${member.speed} ft.`,
    str: member.str, dex: member.dex, con: member.con, int: member.int, wis: member.wis, cha: member.cha,
    challenge_rating: "0",
    proficiency_bonus: proficiencyBonusOf(member),
    defenses: emptyDefenses(),
    actions,
  };
}
