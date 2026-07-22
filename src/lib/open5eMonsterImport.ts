import { fetchAll, fetchAllFromDocuments, fetchSupported5eDocumentKeys, rulesetForDocument } from "@/lib/open5eApi";
import type { Open5eDocumentRef } from "@/lib/open5eApi";
import type { MonsterInsert, MonsterStatBlock, MonsterSize, MonsterType, MonsterUpdate } from "@/types/monster.types";

interface Open5eV2Action {
  name: string;
  desc: string;
  action_type: "ACTION" | "BONUS_ACTION" | "REACTION" | "LEGENDARY_ACTION" | string;
}

interface Open5eV2Monster {
  key: string;
  name: string;
  document: Open5eDocumentRef;
  type: { name: string; key: string };
  size: { name: string; key: string };
  alignment: string;
  armor_class: number;
  hit_points: number;
  hit_dice: string;
  speed_all?: Record<string, number | boolean | string>;
  speed?: Record<string, number | boolean | string>;
  ability_scores: Record<string, number>;
  modifiers?: Record<string, number>;
  // Populated with the printed 2024 initiative bonus for srd-2024 creatures.
  // Observed as 0 on srd-2014 records regardless of DEX — indistinguishable from
  // unset, so it's only trusted when the record's ruleset resolves to "2024".
  initiative_bonus?: number;
  saving_throws?: Record<string, number>;
  skill_bonuses?: Record<string, number>;
  resistances_and_immunities?: Record<string, string | unknown[]>;
  languages?: { as_string?: string };
  challenge_rating: number | string;
  normal_sight_range?: number | null;
  darkvision_range?: number | null;
  blindsight_range?: number | null;
  tremorsense_range?: number | null;
  truesight_range?: number | null;
  actions?: Open5eV2Action[];
  traits?: Array<{ name: string; desc: string }>;
}

export interface Open5eDocument { slug: string; title: string }

const VALID_TYPES: ReadonlyArray<MonsterType> = [
  "aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey",
  "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead",
];
const VALID_SIZES: ReadonlyArray<MonsterSize> = [
  "tiny", "small", "medium", "large", "huge", "gargantuan",
];

function normalizeType(raw: string): MonsterType {
  const value = raw.toLowerCase().split("(")[0].split(" of ")[0].trim();
  return (VALID_TYPES as readonly string[]).includes(value) ? value as MonsterType : "monstrosity";
}

function normalizeSize(raw: string): MonsterSize {
  const value = raw.toLowerCase();
  return (VALID_SIZES as readonly string[]).includes(value) ? value as MonsterSize : "medium";
}

function toSpeedString(speed: Record<string, number | boolean | string> | undefined): string {
  if (!speed) return "30 ft.";
  const unit = speed.unit === "meters" ? "m" : "ft.";
  const parts: string[] = [];
  for (const kind of ["walk", "fly", "swim", "climb", "burrow"] as const) {
    const value = Number(speed[kind] ?? 0);
    if (value <= 0) continue;
    const label = kind === "walk" ? "" : `${kind} `;
    parts.push(`${label}${value} ${unit}${kind === "fly" && speed.hover ? " (hover)" : ""}`);
  }
  return parts.join(", ") || `30 ${unit}`;
}

function formatBonus(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function toSavingThrows(monster: Open5eV2Monster): string | undefined {
  const labels: Record<string, string> = {
    strength: "Str", dexterity: "Dex", constitution: "Con",
    intelligence: "Int", wisdom: "Wis", charisma: "Cha",
  };
  const entries = Object.entries(monster.saving_throws ?? {})
    .filter(([ability, value]) => value !== monster.modifiers?.[ability])
    .map(([ability, value]) => `${labels[ability] ?? ability} ${formatBonus(value)}`);
  return entries.length ? entries.join(", ") : undefined;
}

function toSkills(skills: Record<string, number> | undefined): Record<string, string> | undefined {
  if (!skills) return undefined;
  const result = Object.fromEntries(Object.entries(skills).map(([key, value]) => [key, formatBonus(value)]));
  return Object.keys(result).length ? result : undefined;
}

function actionsOf(monster: Open5eV2Monster, type: string) {
  const rows = (monster.actions ?? []).filter(action => action.action_type === type);
  return rows.length ? rows.map(action => ({ name: action.name, description: action.desc })) : undefined;
}

function senses(monster: Open5eV2Monster): string | undefined {
  const parts: string[] = [];
  const ranges: Array<[string, number | null | undefined]> = [
    ["darkvision", monster.darkvision_range], ["blindsight", monster.blindsight_range],
    ["tremorsense", monster.tremorsense_range], ["truesight", monster.truesight_range],
  ];
  for (const [label, range] of ranges) if (range) parts.push(`${label} ${range} ft.`);
  return parts.length ? parts.join(", ") : undefined;
}

function displayResistance(monster: Open5eV2Monster, key: string): string | undefined {
  const value = monster.resistances_and_immunities?.[key];
  return typeof value === "string" && value ? value : undefined;
}

export function mapOpen5eV2Monster(monster: Open5eV2Monster): MonsterInsert {
  const traits = monster.traits?.map(trait => ({ name: trait.name, description: trait.desc }));
  const legendaryResistance = monster.traits?.find(trait => /legendary resistance/i.test(trait.name));
  const count = legendaryResistance?.name.match(/\((\d+)\s*\/\s*day/i)?.[1];
  const scores = monster.ability_scores;
  const ruleset = rulesetForDocument(monster.document);
  const statBlock: MonsterStatBlock = {
    armor_class: monster.armor_class ?? 10,
    hit_points: monster.hit_dice ? `${monster.hit_points} (${monster.hit_dice})` : String(monster.hit_points),
    speed: toSpeedString(monster.speed_all ?? monster.speed),
    str: scores.strength ?? 10,
    dex: scores.dexterity ?? 10,
    con: scores.constitution ?? 10,
    int: scores.intelligence ?? 10,
    wis: scores.wisdom ?? 10,
    cha: scores.charisma ?? 10,
    challenge_rating: String(monster.challenge_rating ?? "0"),
    saving_throws: toSavingThrows(monster),
    skills: toSkills(monster.skill_bonuses),
    damage_vulnerabilities: displayResistance(monster, "damage_vulnerabilities_display"),
    damage_resistances: displayResistance(monster, "damage_resistances_display"),
    damage_immunities: displayResistance(monster, "damage_immunities_display"),
    condition_immunities: displayResistance(monster, "condition_immunities_display"),
    senses: senses(monster),
    languages: monster.languages?.as_string || undefined,
    special_abilities: traits?.length ? traits : undefined,
    actions: actionsOf(monster, "ACTION"),
    bonus_actions: actionsOf(monster, "BONUS_ACTION"),
    reactions: actionsOf(monster, "REACTION"),
    legendary_resistance: count ? Number(count) : undefined,
    legendary_actions: actionsOf(monster, "LEGENDARY_ACTION"),
    // Only trust initiative_bonus for 2024 records — see the field's doc comment above.
    initiative_bonus: ruleset === "2024" && typeof monster.initiative_bonus === "number"
      ? monster.initiative_bonus
      : undefined,
  };
  return {
    ruleset,
    conceptual_key: monster.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    source_document_key: monster.document.key,
    source_record_key: monster.key,
    source_revision: monster.document.name,
    source_license: null,
    provenance: {
      provider: "open5e-v2",
      document: {
        key: monster.document.key,
        publisher: monster.document.publisher ?? null,
        gamesystem: monster.document.gamesystem ?? null,
        permalink: monster.document.permalink ?? null,
      },
    },
    name: monster.name,
    monster_type: normalizeType(monster.type.name),
    size: normalizeSize(monster.size.name),
    alignment: monster.alignment || "unaligned",
    habitat: null,
    source: monster.document.key,
    source_title: monster.document.display_name || monster.document.name,
    source_url: monster.document.permalink ?? null,
    tags: [],
    stat_block: statBlock,
    notes: null,
    image_url: null,
    is_srd: monster.document.publisher?.key === "wizards-of-the-coast",
    open5e_import: true,
  };
}

export async function fetchOpen5eDocuments(): Promise<Open5eDocument[]> {
  const documents = await fetchAll<Open5eDocumentRef>("https://api.open5e.com/v2/documents/");
  return documents.map(document => ({ slug: document.key, title: document.display_name || document.name }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** V2 native keys preserve equal-name creatures across books and editions. */
export async function fetchSrdMonsters(sourceKeys?: string[]): Promise<MonsterInsert[]> {
  const documentKeys = sourceKeys?.length ? sourceKeys : await fetchSupported5eDocumentKeys();
  const raw = await fetchAllFromDocuments<Open5eV2Monster>("https://api.open5e.com/v2/creatures/", documentKeys);
  return raw.map(mapOpen5eV2Monster);
}

/**
 * Narrows a freshly-mapped Open5e monster down to the fields a re-import is
 * allowed to refresh on an existing row: upstream identity/content (name,
 * type, size, alignment, source metadata, stat block). `mapOpen5eV2Monster`
 * always sets `notes`, `image_url`, `habitat` and `tags` to empty defaults
 * (Open5e has no equivalent data), so those — plus `description`,
 * `portrait_focal_point` and `lair_location_id`, which only ever come from a
 * DM — must never be included here or a re-import would silently wipe
 * DM-added art, notes, and customization on every run.
 */
export function monsterImportUpdateFields(insert: MonsterInsert): MonsterUpdate {
  return {
    ruleset: insert.ruleset,
    conceptual_key: insert.conceptual_key,
    source_document_key: insert.source_document_key,
    source_record_key: insert.source_record_key,
    source_revision: insert.source_revision,
    source_license: insert.source_license,
    provenance: insert.provenance,
    name: insert.name,
    monster_type: insert.monster_type,
    size: insert.size,
    alignment: insert.alignment,
    source: insert.source,
    source_title: insert.source_title,
    source_url: insert.source_url,
    stat_block: insert.stat_block,
    is_srd: insert.is_srd,
    open5e_import: insert.open5e_import,
  };
}
