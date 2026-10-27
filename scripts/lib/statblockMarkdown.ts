/**
 * Parser and row mapper for the `::: statblock` markdown a setting book's
 * bestiary is written in (epic #1115), turned into a row of `monsters`.
 *
 * Pure: no I/O. `scripts/import-statblocks.ts` reads the files and writes the rows.
 *
 * The stored shape is the one the app reads since #1017: a typed `defenses` and a
 * `structured` payload on every entry. Both come from `structureStatBlock`, the same
 * converter `npm run stat-blocks:structure` uses, so this module never re-implements
 * action parsing. The database trigger `private.guard_stat_block_shape` rejects
 * prose defense strings, which is why the four legacy strings are never written.
 */
import { structureStatBlock } from "../../src/rules/statBlock/structureStatBlock.ts";
import { MONSTER_SIZES, MONSTER_TYPES, type MonsterSize, type MonsterStatBlock, type MonsterType } from "../../src/types/monster.types.ts";
import { normalizeName } from "./name-matching.ts";

export { normalizeName };

export const STATBLOCK_RULESET = "2024";
/** The `monsters.source` value; free text, shown as the book's name. */
export const DEFAULT_SOURCE = "Sothery: A Campaign Setting";

const SECTION_KEYS = ["traits", "actions", "bonus_actions", "reactions", "legendary_actions"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
const SCALAR_KEYS = [
  "name",
  "meta",
  "ac",
  "initiative",
  "hp",
  "speed",
  "abilities",
  "skills",
  "vulnerabilities",
  "resistances",
  "immunities",
  "gear",
  "senses",
  "languages",
  "cr",
] as const;
type ScalarKey = (typeof SCALAR_KEYS)[number];
const ALL_KEYS: readonly string[] = [...SCALAR_KEYS, ...SECTION_KEYS];

export interface ParsedEntry {
  name: string;
  description: string;
}

export interface ParsedStatblock {
  scalars: Partial<Record<ScalarKey, string>>;
  sections: Record<SectionKey, ParsedEntry[]>;
}

export class StatblockParseError extends Error {}

/** `**x**` and `_x_` markers removed; the app shows plain text in an entry. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** The text between `::: statblock` and the closing `:::`, or null when the file holds no block. */
export function extractBlock(markdown: string): string | null {
  const match = /^:::[ \t]*statblock[ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/m.exec(markdown);
  return match ? match[1] : null;
}

function parseItem(raw: string): ParsedEntry {
  const text = raw.replace(/^-\s+/, "").replace(/\s+/g, " ").trim();
  const match = /^\*\*(.+?)\.?\*\*\s*(.*)$/.exec(text);
  if (!match) throw new StatblockParseError(`list item has no **Name.** prefix: "${text.slice(0, 40)}"`);
  // A name ending in ")." keeps its parenthesis: "**Sticky Burst (Recharge 5–6).**".
  const name = match[1].replace(/\.$/, "").trim();
  return { name, description: stripMarkdown(match[2]) };
}

export function parseBlock(body: string): ParsedStatblock {
  const scalars: Partial<Record<ScalarKey, string>> = {};
  const rawSections: Record<SectionKey, string[]> = { traits: [], actions: [], bonus_actions: [], reactions: [], legendary_actions: [] };
  let section: SectionKey | null = null;

  for (const line of body.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const key = /^([a-z_]+):(?:\s*(.*))?$/.exec(line);
    if (key && ALL_KEYS.includes(key[1])) {
      const value = (key[2] ?? "").trim();
      if ((SECTION_KEYS as readonly string[]).includes(key[1])) {
        section = key[1] as SectionKey;
        if (value !== "") throw new StatblockParseError(`"${key[1]}:" must be followed by list items, not text`);
      } else {
        section = null;
        scalars[key[1] as ScalarKey] = value;
      }
      continue;
    }
    if (!section) throw new StatblockParseError(`unexpected line outside a list: "${line.slice(0, 40)}"`);
    const items = rawSections[section];
    if (line.startsWith("- ")) items.push(line);
    else if (items.length > 0) items[items.length - 1] += ` ${line.trim()}`; // wrapped continuation
    else throw new StatblockParseError(`text before the first item of ${section}`);
  }

  const sections = {} as Record<SectionKey, ParsedEntry[]>;
  for (const k of SECTION_KEYS) sections[k] = rawSections[k].map(parseItem);
  return { scalars, sections };
}

// ── Scalar fields ───────────────────────────────────────────────────────────

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
type AbilityKey = (typeof ABILITY_KEYS)[number];
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const toInt = (s: string) => Number.parseInt(s.replace(/[−–]/g, "-").replace(/^\+/, ""), 10);

export function parseAbilities(text: string): Record<AbilityKey, { score: number; mod: number; save: number }> {
  const out = {} as Record<AbilityKey, { score: number; mod: number; save: number }>;
  for (const part of text.split("|")) {
    const m = /^\s*(STR|DEX|CON|INT|WIS|CHA)\s+(\d+)\s+([+\-−–]?\d+)\s+([+\-−–]?\d+)\s*$/i.exec(part);
    if (!m) throw new StatblockParseError(`unreadable ability "${part.trim()}"`);
    out[m[1].toLowerCase() as AbilityKey] = { score: Number(m[2]), mod: toInt(m[3]), save: toInt(m[4]) };
  }
  for (const k of ABILITY_KEYS) if (!out[k]) throw new StatblockParseError(`ability ${k.toUpperCase()} is missing`);
  return out;
}

export function parseMeta(text: string): { size: MonsterSize; monster_type: MonsterType; alignment: string; tags: string[] } {
  // Split on the first comma outside parentheses: "(Demon, Shapechanger)" is one tag group.
  let depth = 0;
  let cut = text.length;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth = Math.max(0, depth - 1);
    else if (text[i] === "," && depth === 0) {
      cut = i;
      break;
    }
  }
  const typeLine = text.slice(0, cut);
  const alignment = text.slice(cut + 1).trim().toLowerCase();
  const paren = /\(([^)]*)\)/.exec(typeLine);
  const tags = paren ? paren[1].split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : [];
  const words = typeLine.replace(/\([^)]*\)/, " ").toLowerCase().split(/\s+/).filter(Boolean);
  const size = words.find((w): w is MonsterSize => (MONSTER_SIZES as readonly string[]).includes(w));
  // "Swarm of Medium Beasts" and "Constructs" style plurals still name a type.
  const type = words
    .map((w) => w.replace(/s$/, ""))
    .find((w): w is MonsterType => (MONSTER_TYPES as readonly string[]).includes(w));
  if (!size) throw new StatblockParseError(`meta "${text}" names no size`);
  if (!type) throw new StatblockParseError(`meta "${text}" names no creature type`);
  return { size, monster_type: type, alignment: alignment || "unaligned", tags };
}

/** "Perception +3, Stealth +5" -> { perception: "+3", stealth: "+5" }. */
export function parseSkills(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(",")) {
    const m = /^\s*(.+?)\s+([+\-−–]\d+)\s*$/.exec(part);
    if (!m) throw new StatblockParseError(`unreadable skill "${part.trim()}"`);
    out[m[1].toLowerCase()] = m[2].replace(/[−–]/g, "-");
  }
  return out;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/** Damage types before the first `;`, conditions after it. A single group with no `;` is all damage. */
export function splitImmunities(text: string | undefined): { damage: string; conditions: string } {
  const value = nonEmpty(text);
  if (!value) return { damage: "", conditions: "" };
  const [damage, ...rest] = value.split(";");
  return { damage: damage.trim(), conditions: rest.join(";").trim() };
}

export interface MonsterRowFields {
  name: string;
  monster_type: MonsterType;
  size: MonsterSize;
  alignment: string;
  tags: string[];
  ruleset: typeof STATBLOCK_RULESET;
  source: string;
  /** Gear line, when the block has one; the stat block has no field for it. */
  notes: string | null;
  stat_block: MonsterStatBlock;
}

function required(scalars: ParsedStatblock["scalars"], key: ScalarKey): string {
  const value = nonEmpty(scalars[key]);
  if (value === undefined) throw new StatblockParseError(`"${key}" is missing`);
  return value;
}

/** Maps a parsed block onto the row the app reads. Throws StatblockParseError when a required field is unreadable. */
export function toMonsterRow(parsed: ParsedStatblock, source: string = DEFAULT_SOURCE): MonsterRowFields {
  const { scalars, sections } = parsed;
  const name = required(scalars, "name");
  const meta = parseMeta(required(scalars, "meta"));
  const abilities = parseAbilities(required(scalars, "abilities"));

  const ac = /\d+/.exec(required(scalars, "ac"));
  if (!ac) throw new StatblockParseError(`unreadable ac "${scalars.ac}"`);
  const hp = required(scalars, "hp");
  if (!/\d+d\d+/.test(hp)) throw new StatblockParseError(`unreadable hp "${hp}"`);
  const cr = /^\s*(\d+(?:\/\d+)?)\s*(?:\(([^)]*)\))?/.exec(required(scalars, "cr"));
  if (!cr) throw new StatblockParseError(`unreadable cr "${scalars.cr}"`);
  const pb = cr[2] ? /PB\s*\+?(\d+)/i.exec(cr[2]) : null;

  // "+3 (13)": the bonus is what the app stores.
  const initiative = nonEmpty(scalars.initiative);
  const initiativeBonus = initiative ? /^[+\-−–]?\d+/.exec(initiative) : null;

  // A save differs from the modifier only when the creature is proficient; the app stores just those.
  const saves = ABILITY_KEYS.filter((k) => abilities[k].save !== abilities[k].mod).map(
    (k) => `${k[0].toUpperCase()}${k.slice(1)} ${signed(abilities[k].save)}`,
  );

  const immunities = splitImmunities(scalars.immunities);
  const traits = sections.traits;
  const legendaryResistance = traits
    .map((t) => /^Legendary Resistance \((\d+)\/Day/i.exec(t.name))
    .find((m): m is RegExpExecArray => m !== null);

  const prose = {
    special_abilities: traits,
    actions: sections.actions,
    bonus_actions: sections.bonus_actions,
    reactions: sections.reactions,
    legendary_actions: sections.legendary_actions,
    damage_resistances: nonEmpty(scalars.resistances),
    damage_immunities: nonEmpty(immunities.damage),
    damage_vulnerabilities: nonEmpty(scalars.vulnerabilities),
    condition_immunities: nonEmpty(immunities.conditions),
  };
  const structured = structureStatBlock(prose);
  // An empty list stays out of the row, as the library's own rows do.
  const lists = Object.fromEntries(
    (["special_abilities", "actions", "bonus_actions", "reactions", "legendary_actions"] as const)
      .filter((k) => (structured[k]?.length ?? 0) > 0)
      .map((k) => [k, structured[k]]),
  );

  const skills = nonEmpty(scalars.skills);
  const senses = nonEmpty(scalars.senses);
  const languages = nonEmpty(scalars.languages);
  const gear = nonEmpty(scalars.gear);

  const stat_block: MonsterStatBlock = {
    armor_class: Number(ac[0]),
    hit_points: hp,
    speed: required(scalars, "speed"),
    str: abilities.str.score,
    dex: abilities.dex.score,
    con: abilities.con.score,
    int: abilities.int.score,
    wis: abilities.wis.score,
    cha: abilities.cha.score,
    challenge_rating: cr[1],
    ...(pb ? { proficiency_bonus: Number(pb[1]) } : {}),
    ...(initiativeBonus ? { initiative_bonus: toInt(initiativeBonus[0]) } : {}),
    ...(saves.length > 0 ? { saving_throws: saves.join(", ") } : {}),
    ...(skills ? { skills: parseSkills(skills) } : {}),
    defenses: structured.defenses,
    ...(senses ? { senses } : {}),
    ...(languages ? { languages } : {}),
    ...(legendaryResistance ? { legendary_resistance: Number(legendaryResistance[1]) } : {}),
    ...lists,
  };

  return {
    name,
    monster_type: meta.monster_type,
    size: meta.size,
    alignment: meta.alignment,
    tags: meta.tags,
    ruleset: STATBLOCK_RULESET,
    source,
    notes: gear ? `Gear: ${gear}` : null,
    stat_block,
  };
}

/** One file's text to one row, or a reason it cannot be one. */
export function parseStatblockFile(markdown: string, source?: string): MonsterRowFields {
  const body = extractBlock(markdown);
  if (body === null) throw new StatblockParseError("no `::: statblock` block");
  return toMonsterRow(parseBlock(body), source);
}

/** One row of the bestiary art map: a monster name and where its picture may come from. */
export interface BestiaryArtRow {
  name: string;
  existing: string | undefined;
  alt: string | undefined;
}

/**
 * Reads the `| Monster | Existing | Alt |` table of `data/bestiary-art.md`. The header,
 * the `|---|` rule and rows without a name are skipped; empty cells are undefined. The
 * reference forms in the cells are read by `parseArtReference` (lib/scriptoriumBook.ts).
 */
export function parseBestiaryArtMap(markdown: string): BestiaryArtRow[] {
  const rows: BestiaryArtRow[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const text = line.trim();
    if (!text.startsWith("|")) continue;
    const cells = text.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    const [name, existing, alt] = cells;
    if (!name || /^-+$/.test(name.replace(/[:\s]/g, "")) || name.toLowerCase() === "monster") continue;
    rows.push({ name, existing: existing || undefined, alt: alt || undefined });
  }
  return rows;
}
