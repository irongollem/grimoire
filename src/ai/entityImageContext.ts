import { buildEntityContext, toPlainText } from "./utils";

/**
 * The entity facts the portrait author works from, built from a stored row.
 *
 * The detail editors build the same strings from their live form state (so
 * unsaved edits count); these builders serve the places that only hold the
 * saved row, such as The Mint and Card Forge. Keep the field choice in step
 * with the editors' `aiContext` so a portrait painted from either place
 * describes the same entity.
 */

export function npcImageContext(npc: {
  name: string;
  race: string | null;
  occupation: string | null;
  appearance: string | null;
  personality: string | null;
}): string {
  return buildEntityContext([
    npc.name,
    [npc.race, npc.occupation].filter(Boolean).join(", "),
    toPlainText(npc.appearance),
    toPlainText(npc.personality),
  ]);
}

export function partyMemberImageContext(member: {
  name: string;
  speciesName?: string | null;
  subrace: string | null;
  className: string | null;
  level: number;
}): string {
  return buildEntityContext([
    member.name,
    [member.speciesName, member.subrace].filter(Boolean).join(" "),
    member.className,
    `level ${member.level}`,
  ]);
}

export function monsterImageContext(monster: {
  name: string;
  size: string;
  monster_type: string;
  alignment: string;
  habitat: string | null;
  description?: string | null;
}): string {
  return buildEntityContext([
    monster.name,
    `${monster.size} ${monster.monster_type}`,
    monster.alignment,
    monster.habitat,
    toPlainText(monster.description),
  ]);
}

export function itemImageContext(
  item: { name: string; description: string },
  labels: { type: string; rarity: string },
): string {
  return buildEntityContext([item.name, labels.type, labels.rarity, toPlainText(item.description)]);
}

export function spellImageContext(spell: {
  name: string;
  level: number;
  school: string;
  description: string;
}): string {
  return buildEntityContext([
    spell.name,
    `${spell.level === 0 ? "cantrip" : `level ${spell.level}`} ${spell.school} spell`,
    toPlainText(spell.description),
  ]);
}
