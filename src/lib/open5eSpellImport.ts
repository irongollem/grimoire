import type { SpellInsert, SpellSchool } from "@/types/spell.types";
import { SPELL_SCHOOLS, SPELL_CLASSES } from "@/types/spell.types";
import { ARTIFICER_SPELL_DELTA } from "@/data/artificerSpellDelta";

// ── Open5e v1 API shapes ──────────────────────────────────────────────────────

interface Open5eSpell {
  slug: string;
  name: string;
  desc: string;
  higher_level: string;
  range: string;
  components: string;        // "V, S, M"
  material: string;
  ritual: string;            // "yes" | "no"
  duration: string;
  concentration: string;     // "yes" | "no"
  casting_time: string;      // "1 action", "1 bonus action", etc.
  level: string;             // "Cantrip" | "1st-level" | "2nd-level" etc.
  level_int: number;
  school: { name: string } | string;
  dnd_class: string;         // "Wizard, Sorcerer" (comma-separated)
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

export async function fetchOpen5eDocuments(): Promise<Open5eDocument[]> {
  const docs = await fetchAll<Open5eDocument>("https://api.open5e.com/v1/documents/");
  return docs.slice().sort((a, b) => a.title.localeCompare(b.title));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeSchool(raw: string | { name: string }): SpellSchool {
  const name = typeof raw === "string" ? raw : raw.name;
  const lower = name.toLowerCase().trim();
  return (SPELL_SCHOOLS as readonly string[]).includes(lower)
    ? (lower as SpellSchool)
    : "evocation";
}

function normalizeLevel(spell: Open5eSpell): number {
  if (spell.level.toLowerCase() === "cantrip") return 0;
  return spell.level_int ?? 0;
}

const CASTING_TIME_MAP: Record<string, string> = {
  "1 action": "Action",
  "1 bonus action": "Bonus Action",
  "1 reaction": "Reaction",
  "1 minute": "1 Minute",
  "10 minutes": "10 Minutes",
  "1 hour": "1 Hour",
  "8 hours": "8 Hours",
  "24 hours": "24 Hours",
};

function normalizeCastingTime(raw: string): { casting_time: string; casting_time_custom: string | null } {
  const lower = raw.toLowerCase().trim();
  // Exact match first
  if (CASTING_TIME_MAP[lower]) return { casting_time: CASTING_TIME_MAP[lower], casting_time_custom: null };
  // Reaction with condition text
  if (lower.startsWith("1 reaction")) return { casting_time: "Reaction", casting_time_custom: raw };
  return { casting_time: "Special", casting_time_custom: raw };
}

const DURATION_MAP: Record<string, string> = {
  "instantaneous": "Instantaneous",
  "until dispelled": "Until Dispelled",
  "1 round": "1 Round",
  "concentration, up to 1 minute": "Concentration, up to 1 minute",
  "concentration, up to 10 minutes": "Concentration, up to 10 minutes",
  "concentration, up to 1 hour": "Concentration, up to 1 hour",
  "concentration, up to 8 hours": "Concentration, up to 8 hours",
  "up to 1 minute": "Concentration, up to 1 minute",
  "up to 10 minutes": "Concentration, up to 10 minutes",
  "up to 1 hour": "Concentration, up to 1 hour",
  "up to 8 hours": "Concentration, up to 8 hours",
  "1 minute": "1 Minute",
  "10 minutes": "10 Minutes",
  "1 hour": "1 Hour",
  "8 hours": "8 Hours",
  "24 hours": "24 Hours",
  "7 days": "7 Days",
  "30 days": "30 Days",
};

function normalizeDuration(raw: string): { duration: string; duration_custom: string | null } {
  const lower = raw.toLowerCase().trim();
  if (DURATION_MAP[lower]) return { duration: DURATION_MAP[lower], duration_custom: null };
  return { duration: "Special", duration_custom: raw };
}

const FEET_MAP: Record<string, string> = {
  "5 feet": "5 ft.",
  "10 feet": "10 ft.",
  "30 feet": "30 ft.",
  "60 feet": "60 ft.",
  "90 feet": "90 ft.",
  "120 feet": "120 ft.",
  "150 feet": "150 ft.",
  "300 feet": "300 ft.",
  "500 feet": "500 ft.",
};

function normalizeRange(raw: string): { range: string; range_custom: string | null } {
  const lower = raw.toLowerCase().trim();
  if (lower === "self" || lower === "touch" || lower === "sight" || lower === "unlimited") {
    return { range: raw.charAt(0).toUpperCase() + raw.slice(1), range_custom: null };
  }
  if (lower === "1 mile") return { range: "1 mile", range_custom: null };
  if (FEET_MAP[lower]) return { range: FEET_MAP[lower], range_custom: null };
  return { range: "Special", range_custom: raw };
}

const VALID_CLASSES = new Set<string>(SPELL_CLASSES);

function normalizeClasses(raw: string, spellName: string): string[] {
  const classes = raw
    ? raw.split(",").map((c) => c.trim()).filter((c) => VALID_CLASSES.has(c))
    : [];
  if (ARTIFICER_SPELL_DELTA.has(spellName) && !classes.includes("Artificer")) {
    classes.push("Artificer");
  }
  return classes;
}

function normalizeComponents(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => ["V", "S", "M"].includes(c));
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapSpell(spell: Open5eSpell): SpellInsert {
  const { casting_time, casting_time_custom } = normalizeCastingTime(spell.casting_time);
  const { duration, duration_custom } = normalizeDuration(spell.duration);
  const { range, range_custom } = normalizeRange(spell.range);
  return {
    name: spell.name,
    level: normalizeLevel(spell),
    school: normalizeSchool(spell.school),
    casting_time,
    casting_time_custom,
    range,
    range_custom,
    components: normalizeComponents(spell.components),
    material: spell.material?.trim() || null,
    duration,
    duration_custom,
    concentration: spell.concentration?.toLowerCase() === "yes",
    ritual: spell.ritual?.toLowerCase() === "yes",
    attack_type: null,
    save_attribute: null,
    save_effect: null,
    damage_rolls: null,
    healing_dice: null,
    target_description: null,
    aoe_shape: null,
    aoe_size: null,
    condition_inflicted: null,
    description: spell.desc ?? "",
    higher_levels: spell.higher_level?.trim() || null,
    classes: normalizeClasses(spell.dnd_class, spell.name),
    tags: [],
    source: spell.document__slug ?? null,
    source_title: spell.document__title ?? null,
    source_url: spell.document__url ?? null,
    open5e_import: true,
    image_url: null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchSrdSpells(sourceSlugs?: string[]): Promise<SpellInsert[]> {
  let rawSpells: Open5eSpell[];

  if (sourceSlugs && sourceSlugs.length > 0) {
    const fetches = await Promise.all(
      sourceSlugs.map((slug) =>
        fetchAll<Open5eSpell>(`https://api.open5e.com/v1/spells/?document__slug=${slug}`),
      ),
    );
    rawSpells = fetches.flat();
  } else {
    rawSpells = await fetchAll<Open5eSpell>("https://api.open5e.com/v1/spells/");
  }

  const seen = new Set<string>();
  return rawSpells
    .map(mapSpell)
    .filter((s) => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });
}
