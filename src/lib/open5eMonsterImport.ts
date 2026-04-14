import type { MonsterInsert, MonsterStatBlock, MonsterSize, MonsterType } from "@/types/monster.types";

// ── Open5e v1 API shapes ──────────────────────────────────────────────────────

interface Open5eSpeed {
  walk?: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
  hover?: boolean;
}

interface Open5eTrait {
  name?: string;
  desc?: string;
}

interface Open5eMonster {
  slug: string;
  name: string;
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  armor_class: number;
  hit_points: number;
  hit_dice: string;
  speed: Open5eSpeed;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  strength_save?: number | null;
  dexterity_save?: number | null;
  constitution_save?: number | null;
  intelligence_save?: number | null;
  wisdom_save?: number | null;
  charisma_save?: number | null;
  skills?: Record<string, number>;
  damage_vulnerabilities?: string;
  damage_resistances?: string;
  damage_immunities?: string;
  condition_immunities?: string;
  senses?: string;
  languages?: string;
  challenge_rating: string | number;
  actions?: Open5eTrait[];
  bonus_actions?: Open5eTrait[] | null;
  reactions?: Open5eTrait[] | null;
  legendary_desc?: string;
  legendary_actions?: Open5eTrait[] | null;
  special_abilities?: Open5eTrait[];
  document__slug: string;
  document__title: string;
  document__url: string;
}

interface Open5eListResponse<T> {
  count: number;
  next: string | null;
  results: T[];
}

// ── Pagination fetch ──────────────────────────────────────────────────────────

async function fetchAll<T>(baseUrl: string): Promise<T[]> {
  const results: T[] = [];
  const sep = baseUrl.includes("?") ? "&" : "?";
  let url: string | null = `${baseUrl}${sep}limit=500&format=json`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open5e fetch failed: ${res.status} ${url}`);
    const json: Open5eListResponse<T> = await res.json();
    results.push(...json.results);
    url = json.next;
  }
  return results;
}

// ── Document list ─────────────────────────────────────────────────────────────

export interface Open5eDocument {
  slug: string;
  title: string;
}

/**
 * Fetch the list of Open5e documents (SRD, Tome of Beasts, Creature Codex…).
 * Shared with `open5eSpellImport` intentionally — the endpoint is cross-content,
 * not content-type-specific. Importers re-query per call to keep staleTime
 * handling local to each `useXxxSources`.
 */
export async function fetchOpen5eDocuments(): Promise<Open5eDocument[]> {
  const docs = await fetchAll<Open5eDocument>("https://api.open5e.com/v1/documents/");
  return docs.slice().sort((a, b) => a.title.localeCompare(b.title));
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

const VALID_TYPES: ReadonlyArray<MonsterType> = [
  "aberration", "beast", "celestial", "construct", "dragon",
  "elemental", "fey", "fiend", "giant", "humanoid",
  "monstrosity", "ooze", "plant", "undead",
];
const VALID_SIZES: ReadonlyArray<MonsterSize> = [
  "tiny", "small", "medium", "large", "huge", "gargantuan",
];

function normalizeType(raw: string): MonsterType {
  // Open5e sometimes emits "humanoid (any race)" or "swarm of tiny beasts" —
  // split on "(" / "of" to pull just the base type.
  const base = (raw ?? "").toLowerCase().split("(")[0].split(" of ")[0].trim();
  return (VALID_TYPES as readonly string[]).includes(base) ? (base as MonsterType) : "monstrosity";
}

function normalizeSize(raw: string): MonsterSize {
  const lower = (raw ?? "medium").toLowerCase();
  return (VALID_SIZES as readonly string[]).includes(lower) ? (lower as MonsterSize) : "medium";
}

function toSpeedString(speed: Open5eSpeed | undefined | null): string {
  if (!speed || typeof speed !== "object") return "30 ft.";
  const parts: string[] = [];
  if (speed.walk) parts.push(`${speed.walk} ft.`);
  if (speed.fly) parts.push(`fly ${speed.fly} ft.`);
  if (speed.swim) parts.push(`swim ${speed.swim} ft.`);
  if (speed.climb) parts.push(`climb ${speed.climb} ft.`);
  if (speed.burrow) parts.push(`burrow ${speed.burrow} ft.`);
  if (speed.hover) {
    const i = parts.findIndex((p) => p.startsWith("fly"));
    if (i !== -1) parts[i] = parts[i].replace(" ft.", " ft. (hover)");
  }
  return parts.join(", ") || "30 ft.";
}

function toHpString(hp: number, dice: string): string {
  if (!hp && !dice) return "10 (2d8+1)";
  if (!dice) return String(hp);
  return `${hp} (${dice})`;
}

function toSavingThrows(m: Open5eMonster): string | undefined {
  const MAP: Array<[keyof Open5eMonster, string]> = [
    ["strength_save", "Str"],
    ["dexterity_save", "Dex"],
    ["constitution_save", "Con"],
    ["intelligence_save", "Int"],
    ["wisdom_save", "Wis"],
    ["charisma_save", "Cha"],
  ];
  const parts: string[] = [];
  for (const [key, label] of MAP) {
    const val = m[key] as number | null | undefined;
    if (val !== null && val !== undefined) parts.push(`${label} ${val >= 0 ? "+" : ""}${val}`);
  }
  return parts.length ? parts.join(", ") : undefined;
}

function toSkills(skills: Record<string, number> | undefined): Record<string, string> | undefined {
  if (!skills || typeof skills !== "object") return undefined;
  const rec: Record<string, string> = {};
  for (const [k, v] of Object.entries(skills)) {
    rec[k.toLowerCase()] = v >= 0 ? `+${v}` : String(v);
  }
  return Object.keys(rec).length ? rec : undefined;
}

function toTraits(
  arr: Open5eTrait[] | null | undefined,
): Array<{ name: string; description: string }> | undefined {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr.map((t) => ({ name: t.name ?? "", description: t.desc ?? "" }));
}

function extractLegendaryResistance(desc: string | undefined): number | undefined {
  if (!desc) return undefined;
  // "If the X fails a saving throw, it can choose to succeed instead (3/Day)."
  const m = desc.match(/\((\d)\s*\/\s*[Dd]ay\)/);
  return m ? parseInt(m[1], 10) : 3;
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapMonster(m: Open5eMonster): MonsterInsert {
  const statBlock: MonsterStatBlock = {
    armor_class: m.armor_class ?? 10,
    hit_points: toHpString(m.hit_points, m.hit_dice),
    speed: toSpeedString(m.speed),
    str: m.strength ?? 10,
    dex: m.dexterity ?? 10,
    con: m.constitution ?? 10,
    int: m.intelligence ?? 10,
    wis: m.wisdom ?? 10,
    cha: m.charisma ?? 10,
    challenge_rating: String(m.challenge_rating ?? "0"),
    saving_throws: toSavingThrows(m),
    skills: toSkills(m.skills),
    damage_vulnerabilities: m.damage_vulnerabilities || undefined,
    damage_resistances: m.damage_resistances || undefined,
    damage_immunities: m.damage_immunities || undefined,
    condition_immunities: m.condition_immunities || undefined,
    senses: m.senses || undefined,
    languages: m.languages || undefined,
    special_abilities: toTraits(m.special_abilities),
    actions: toTraits(m.actions),
    bonus_actions: toTraits(m.bonus_actions),
    reactions: toTraits(m.reactions),
    legendary_resistance: m.legendary_desc ? extractLegendaryResistance(m.legendary_desc) : undefined,
    legendary_actions: toTraits(m.legendary_actions),
  };
  return {
    name: m.name,
    monster_type: normalizeType(m.type),
    size: normalizeSize(m.size),
    alignment: m.alignment || "unaligned",
    habitat: null,
    source: m.document__slug ?? null,
    source_title: m.document__title ?? null,
    source_url: m.document__url ?? null,
    tags: [],
    stat_block: statBlock,
    notes: null,
    image_url: null,
    card_art_url: null,
    is_srd: m.document__slug === "wotc-srd",
    open5e_import: true,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch monsters from one or more Open5e documents. If no slugs are passed,
 * fetches the entire corpus across all documents (~3,200 creatures as of
 * 2026-04) — usually not what you want. In practice callers always pick at
 * least one slug via the source picker.
 *
 * Deduplicates by name across the returned set so cross-document duplicates
 * (e.g. a creature that appears in both SRD and a third-party codex) don't
 * cause an insert conflict downstream.
 */
export async function fetchSrdMonsters(sourceSlugs?: string[]): Promise<MonsterInsert[]> {
  let raw: Open5eMonster[];

  if (sourceSlugs && sourceSlugs.length > 0) {
    const fetches = await Promise.all(
      sourceSlugs.map((slug) =>
        fetchAll<Open5eMonster>(`https://api.open5e.com/v1/monsters/?document__slug=${slug}`),
      ),
    );
    raw = fetches.flat();
  } else {
    raw = await fetchAll<Open5eMonster>("https://api.open5e.com/v1/monsters/");
  }

  const seen = new Set<string>();
  return raw
    .map(mapMonster)
    .filter((m) => {
      if (seen.has(m.name)) return false;
      seen.add(m.name);
      return true;
    });
}
