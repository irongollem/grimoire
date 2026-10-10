import {
  fetchAll,
  fetchAllFromDocuments,
  fetchOpen5eDocumentRefs,
  fetchSupported5eDocumentKeys,
  licenseForDocumentKey,
  rulesetForDocument,
  slugifyKey,
} from "@/lib/library/open5eApi";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import { structureStatBlock, type ProseStatBlockFields } from "@/rules/statBlock/structureStatBlock";
import type { MonsterInsert, MonsterStatBlock, MonsterSize, MonsterType } from "@/types/monster.types";

/** The stat block as Open5e's prose gives it, before `structureStatBlock` (#1017). */
type ProseMonsterStatBlock = Omit<MonsterStatBlock, keyof ProseStatBlockFields> & ProseStatBlockFields;

interface Open5eV2Action {
  name: string;
  desc: string;
  action_type: "ACTION" | "BONUS_ACTION" | "REACTION" | "LEGENDARY_ACTION" | string;
  /** How many legendary actions this one costs. Set (1) on every action, meaningful on LEGENDARY_ACTION. */
  legendary_action_cost?: number | null;
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

/** A5E's "Titanic" sits above Gargantuan, which is the largest size 5e has. Any
 *  other unknown size throws: the old fallback to "medium" stored the A5E Titanic
 *  Kraken and Titanic Dragon Turtle as medium creatures without a word. */
function normalizeSize(raw: string): MonsterSize {
  const value = raw.toLowerCase();
  if (value === "titanic") return "gargantuan";
  if ((VALID_SIZES as readonly string[]).includes(value)) return value as MonsterSize;
  throw new Error(`Open5e size "${raw}" has no MonsterSize.`);
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

// Open5e v2 has no lair-action type: a scan of every creature (18 pages, ~12,000
// actions, 7 Oct 2026) found only ACTION, BONUS_ACTION, REACTION and
// LEGENDARY_ACTION, and no action named for a lair. So `lair_actions` is not mapped
// from the API; there is nothing to map. It is a DM-authored list.
function actionsOf(monster: Open5eV2Monster, type: string) {
  const rows = (monster.actions ?? []).filter(action => action.action_type === type);
  return rows.length ? rows.map(action => ({ name: printedName(action), description: action.desc })) : undefined;
}

/**
 * The action's name as the book prints it. Open5e strips "(Costs 2 Actions)" from
 * SRD legendary actions and keeps the cost in `legendary_action_cost` instead, so
 * the SRD's Wing Attack arrived costing 1. Putting the parenthetical back gives the
 * reader the printed text and gives the structured-action parser (#1017) the cost
 * as prose it can check, rather than a number from a field it cannot.
 */
function printedName(action: Open5eV2Action): string {
  const cost = action.legendary_action_cost;
  if (action.action_type !== "LEGENDARY_ACTION" || typeof cost !== "number" || cost <= 1) return action.name;
  if (/\(\s*costs\s+\d/i.test(action.name)) return action.name;
  return `${action.name} (Costs ${cost} Actions)`;
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

/** Maps one Open5e v2 creature to a `library_monsters` row.
 *
 *  `campaign_id` is omitted, not nulled: these rows are seeded into
 *  `library_monsters`, which has no such column — the campaign scope #597 added
 *  belongs to the DM's own `monsters` table. Shared reference material is global
 *  by construction, so there is nothing to express here. Spreading a stray
 *  `campaign_id` into the seed upsert fails the whole batch with PGRST204, and
 *  `MonsterInsert` is hand-written rather than generated, so only this Omit
 *  keeps the typechecker on the hook for it. */
export function mapOpen5eV2Monster(
  monster: Open5eV2Monster,
  documentMetadata?: ReadonlyMap<string, Open5eDocumentRef>,
): Omit<MonsterInsert, "campaign_id"> {
  const traits = monster.traits?.map(trait => ({ name: trait.name, description: trait.desc }));
  const legendaryResistance = monster.traits?.find(trait => /legendary resistance/i.test(trait.name));
  const count = legendaryResistance?.name.match(/\((\d+)\s*\/\s*day/i)?.[1];
  const scores = monster.ability_scores;
  const ruleset = rulesetForDocument(monster.document);
  const statBlock: ProseMonsterStatBlock = {
    armor_class: monster.armor_class ?? 10,
    hit_points: monster.hit_dice ? `${monster.hit_points} (${monster.hit_dice})` : String(monster.hit_points),
    // `speed` holds the creature's NATIVE speeds; `speed_all` additionally
    // bakes in Open5e's derived half-speeds (every walker gets swim/crawl at
    // walk/2), which both corrupts the displayed stat block ("Cat — swim
    // 20 ft.") and broke wild shape: wildShapeFormCost excludes a form with a
    // swim or fly speed the druid's level does not allow yet, so with
    // speed_all every beast was ineligible to a low-level druid. Fall back to
    // speed_all only when speed is absent.
    speed: toSpeedString(monster.speed ?? monster.speed_all),
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
    conceptual_key: slugifyKey(monster.name),
    source_document_key: monster.document.key,
    source_record_key: monster.key,
    source_revision: monster.document.name,
    source_license: licenseForDocumentKey(documentMetadata, monster.document.key),
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
    // Open5e's own `attacks[]` is deliberately not read: it is wrong (the 2014
    // goblin Scimitar is typed thunder with no damage bonus). The parser reads the
    // prose and its prose check vouches for the result.
    stat_block: structureStatBlock(statBlock),
    notes: null,
    image_url: null,
    cutout_url: null, // Open5e has no cutout art (#917 story 1)
    // Every row this mapper produces is destined for the shared library table,
    // Kobold Press and EN Publishing included, so the flag is unconditional: it
    // marks shared content, not SRD provenance. Real provenance is
    // source_document_key -> content_sources. Deriving it from the publisher key
    // would write `false` for 2,885 of 3,541 rows and strand every reference in
    // discovered_monsters / pinned_forms, which key off `is_shared` to choose
    // between the text library id column and the uuid homebrew one.
    is_shared: true,
    open5e_import: true,
  };
}

export async function fetchOpen5eDocuments(): Promise<Open5eDocument[]> {
  const documents = await fetchAll<Open5eDocumentRef>("https://api.open5e.com/v2/documents/");
  return documents.map(document => ({ slug: document.key, title: document.display_name || document.name }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** V2 native keys preserve equal-name creatures across books and editions. */
export async function fetchOpen5eMonsters(
  sourceKeys?: string[],
): Promise<Array<Omit<MonsterInsert, "campaign_id">>> {
  const documentKeys = sourceKeys?.length ? sourceKeys : await fetchSupported5eDocumentKeys();
  // The embedded `monster.document` ref on a /v2/creatures/ record never
  // carries `licenses` (verified against the live API) — only the full
  // /v2/documents/ listing does. A document-metadata map keyed by document
  // key is fetched alongside the creatures themselves so mapOpen5eV2Monster
  // can populate source_license.
  const [raw, documents] = await Promise.all([
    fetchAllFromDocuments<Open5eV2Monster>("https://api.open5e.com/v2/creatures/", documentKeys),
    fetchOpen5eDocumentRefs(),
  ]);
  const documentMetadata = new Map(documents.map((document) => [document.key, document]));
  return raw.map((monster) => mapOpen5eV2Monster(monster, documentMetadata));
}
