import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import type { AiProvenance } from "@/ai/provenance";
import type { RulesetKey } from "@/types/ruleset.types";
import type {
  SpeciesInsert,
  SpeciesSize,
  SpeciesSpeed,
  SpeciesSubrace,
  SpeciesTrait,
} from "@/types/species.types";

/** What `generate-entity-text` returns for the `species` generator (untrusted). */
export interface SpeciesAiResult {
  name?: unknown;
  description?: unknown;
  size?: unknown;
  avg_height?: unknown;
  avg_weight?: unknown;
  speed?: unknown;
  ability_score_increases?: unknown;
  traits?: unknown;
  languages?: unknown;
  subraces?: unknown;
  natural_armor_ac?: unknown;
  is_shapeshifter?: unknown;
  tags?: unknown;
  image_prompt?: unknown;
  ai_provenance?: AiProvenance;
}

export const SPECIES_SIZES = ["tiny", "small", "medium", "large"] as const satisfies readonly SpeciesSize[];

const SPEED_KEYS = ["walk", "fly", "swim", "climb", "burrow"] as const satisfies readonly (keyof SpeciesSpeed)[];
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
const ABILITY_ALIASES: Record<string, (typeof ABILITY_KEYS)[number]> = {
  str: "str", strength: "str",
  dex: "dex", dexterity: "dex",
  con: "con", constitution: "con",
  int: "int", intelligence: "int",
  wis: "wis", wisdom: "wis",
  cha: "cha", charisma: "cha",
};

const MAX_TRAITS = 10;
const MAX_SUBRACES = 4;
const MAX_LANGUAGES = 6;
const MAX_TAGS = 6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function textOrNull(v: unknown): string | null {
  const t = text(v);
  return t || null;
}

function stringList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    const t = text(item);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Walk/fly/swim/climb/burrow, rounded to a multiple of 5 and clamped 0-120. */
export function sanitizeSpeed(raw: unknown): SpeciesSpeed | null {
  if (!isRecord(raw)) return null;
  const speed: SpeciesSpeed = {};
  for (const key of SPEED_KEYS) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    speed[key] = Math.min(120, Math.max(0, Math.round(value / 5) * 5));
  }
  return Object.keys(speed).length ? speed : null;
}

/**
 * 2014 species ability score increases: a map of the six abilities to +1/+2.
 * With a free-text rider ("+1 to two others of your choice") the result is a
 * single `{ description }` that carries the numbers as text first, because the
 * editor shows only the description and would drop beside-it numbers on save.
 */
export function sanitizeAbilityIncreases(raw: unknown): Record<string, number | string> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, number> = {};
  let rider = "";
  for (const [k, v] of Object.entries(raw)) {
    const ability = ABILITY_ALIASES[k.toLowerCase()];
    if (ability && typeof v === "number" && Number.isFinite(v)) {
      const n = Math.round(v);
      // The 2014 books never give a species more than +2 to one ability (the
      // total is not capped: a 2014 human takes +1 to all six).
      if (n >= 1 && n <= 2) out[ability] = n;
    } else if (k === "description" && typeof v === "string" && v.trim()) {
      rider = v.trim();
    }
  }
  if (!rider) return Object.keys(out).length ? out : null;
  // The editor shows only `description` when one is present and re-parses it on
  // save, so numbers kept beside a rider would be dropped. Fold them into the
  // text in the editor's own "+2 CHA" form, which reads like a DM wrote it.
  const numeric = Object.entries(out).map(([k, v]) => `+${v} ${k.toUpperCase()}`);
  return { description: [...numeric, rider].join(", ") };
}

function sanitizeTraits(raw: unknown, max: number): SpeciesTrait[] {
  if (!Array.isArray(raw)) return [];
  const out: SpeciesTrait[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = text(item.name);
    const description = text(item.description);
    if (!name || !description) continue;
    out.push({ name, description: toTiptapJson(description) });
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeSubraces(raw: unknown): SpeciesSubrace[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SpeciesSubrace[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = text(item.name);
    if (!name) continue;
    const description = text(item.description);
    out.push({
      name,
      description: description ? toTiptapJson(description) : "",
      traits: sanitizeTraits(item.traits, 6),
      ability_score_increases: sanitizeAbilityIncreases(item.ability_score_increases),
    });
    if (out.length >= MAX_SUBRACES) break;
  }
  return out.length ? out : null;
}

export interface SpeciesDraftContext {
  ruleset: RulesetKey;
  campaignId: string | null;
  imageUrl?: string | null;
}

/**
 * Turn the model's species JSON into a row the species table accepts, shaped
 * for the table's edition. 2024 species carry no ability score increase (that
 * moved to backgrounds) and no subraces (lineages are traits), so both are
 * nulled however the model answered.
 */
export function speciesInsertFromAi(ai: SpeciesAiResult, ctx: SpeciesDraftContext): SpeciesInsert {
  const is2024 = ctx.ruleset === "2024";
  const size = SPECIES_SIZES.find((s) => s === text(ai.size).toLowerCase()) ?? null;
  const ac = typeof ai.natural_armor_ac === "number" ? Math.round(ai.natural_armor_ac) : null;
  const description = text(ai.description);

  return {
    name: text(ai.name),
    description: description ? toTiptapJson(description) : null,
    size,
    avg_height: textOrNull(ai.avg_height),
    avg_weight: textOrNull(ai.avg_weight),
    speed: sanitizeSpeed(ai.speed),
    ability_score_increases: is2024 ? null : sanitizeAbilityIncreases(ai.ability_score_increases),
    traits: (() => {
      const traits = sanitizeTraits(ai.traits, MAX_TRAITS);
      return traits.length ? traits : null;
    })(),
    languages: stringList(ai.languages, MAX_LANGUAGES),
    tags: stringList(ai.tags, MAX_TAGS).map((t) => t.toLowerCase()),
    source: "Grimoire:AI",
    subraces: is2024 ? null : sanitizeSubraces(ai.subraces),
    image_url: ctx.imageUrl ?? null,
    focal_point: null,
    is_shapeshifter: ai.is_shapeshifter === true,
    natural_armor_ac: ac !== null && ac >= 10 && ac <= 20 ? ac : null,
    granted_spells: [],
    ruleset: ctx.ruleset,
    campaign_id: ctx.campaignId,
    ai_provenance: ai.ai_provenance ?? null,
  };
}
