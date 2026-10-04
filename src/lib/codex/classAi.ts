import type { AiProvenance } from "@/ai/provenance";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { getDefaultSpellSlots } from "@/types/spell.types";
import type { RulesetKey } from "@/types/ruleset.types";
import type {
  CasterType,
  CustomClassInsert,
  CustomResource,
  HitDie,
  PreparedAbility,
} from "@/levelup/customTypes";
import {
  isRecord,
  levelledFeaturesFromAi,
  stringList,
  text,
  wholeNumber,
  featureIdsByLevel,
  type LevelledFeatureDraft,
} from "./featureAi";

/** What `generate-entity-text` returns for the `custom_class` generator (untrusted). */
export interface ClassAiResult {
  class_name?: unknown;
  hit_die?: unknown;
  primary_ability?: unknown;
  saving_throws?: unknown;
  armor_proficiencies?: unknown;
  weapon_proficiencies?: unknown;
  subclass_level?: unknown;
  caster_progression?: unknown;
  caster_type?: unknown;
  prepared_ability?: unknown;
  cantrips_known?: unknown;
  spells_known?: unknown;
  features?: unknown;
  resources?: unknown;
  ai_provenance?: AiProvenance;
}

export const HIT_DICE = [6, 8, 10, 12] as const satisfies readonly HitDie[];
export const CASTER_PROGRESSIONS = ["none", "full", "half", "third", "pact"] as const;
export type CasterProgression = (typeof CASTER_PROGRESSIONS)[number];
export const CASTER_PROGRESSION_LABELS: Record<CasterProgression, string> = {
  none: "No spellcasting",
  full: "Full caster",
  half: "Half caster",
  third: "Third caster",
  pact: "Pact magic",
};

export const ABILITY_NAMES = [
  "Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma",
] as const;
type AbilityName = (typeof ABILITY_NAMES)[number];

const ABILITY_ALIASES: Record<string, AbilityName> = {
  str: "Strength", strength: "Strength",
  dex: "Dexterity", dexterity: "Dexterity",
  con: "Constitution", constitution: "Constitution",
  int: "Intelligence", intelligence: "Intelligence",
  wis: "Wisdom", wisdom: "Wisdom",
  cha: "Charisma", charisma: "Charisma",
};

/** Both editions give an ability score improvement at these levels. */
export const DEFAULT_ASI_LEVELS = [4, 8, 12, 16, 19] as const;

const CASTER_TYPES = ["prepared", "known", "spellbook"] as const satisfies readonly CasterType[];
const PREPARED_ABILITIES = ["wis", "int", "cha"] as const satisfies readonly PreparedAbility[];
const ABILITY_TO_PREPARED: Partial<Record<AbilityName, PreparedAbility>> = {
  Wisdom: "wis", Intelligence: "int", Charisma: "cha",
};

const MAX_FEATURES_PER_LEVEL = 4;
const MAX_FEATURES = 60;
const MAX_RESOURCES = 6;
const MAX_PROFICIENCIES = 12;

/** Published classes are modelled on these when slots are derived from the progression. */
const SLOT_TEMPLATE_CLASS: Record<Exclude<CasterProgression, "none">, string> = {
  full: "Wizard",
  half: "Paladin",
  third: "Fighter (Eldritch Knight)",
  pact: "Warlock",
};

const PREPARED_DIVISOR: Record<Exclude<CasterProgression, "none">, number> = {
  full: 1,
  half: 2,
  third: 3,
  pact: 1,
};

function abilityFrom(raw: unknown): AbilityName | null {
  return ABILITY_ALIASES[text(raw).toLowerCase()] ?? null;
}

/** Exactly the abilities named, in the order given, without repeats. */
function abilityList(raw: unknown): AbilityName[] {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/,|\/|&|\band\b/i)
      : [];
  const out: AbilityName[] = [];
  for (const item of items) {
    const ability = abilityFrom(item);
    if (ability && !out.includes(ability)) out.push(ability);
  }
  return out;
}

export function casterProgressionFrom(raw: unknown): CasterProgression {
  const key = text(raw).toLowerCase();
  return CASTER_PROGRESSIONS.find((p) => p === key) ?? "none";
}

/** 2024 classes take a subclass at 3; 2014 classes vary between 1 and 3. */
export function subclassLevelFor(raw: unknown, ruleset: RulesetKey): number {
  if (ruleset === "2024") return 3;
  const n = wholeNumber(raw);
  return n !== null && n >= 1 && n <= 3 ? n : 3;
}

/** The slot table, 20 levels by 9 spell levels, read off the published caster tables. */
export function slotGridFor(progression: CasterProgression, ruleset: RulesetKey): number[][] | null {
  if (progression === "none") return null;
  const template = SLOT_TEMPLATE_CLASS[progression];
  return Array.from({ length: 20 }, (_, i) => {
    const row = Array<number>(9).fill(0);
    for (const slot of getDefaultSpellSlots(template, i + 1, ruleset)) {
      if (slot.level >= 1 && slot.level <= 9) row[slot.level - 1] = slot.max;
    }
    return row;
  });
}

/** A 20-element, non-decreasing table of whole numbers, or null when the model's table is not usable. */
export function sanitizeKnownTable(raw: unknown, max: number): number[] | null {
  if (!Array.isArray(raw) || raw.length !== 20) return null;
  const out: number[] = [];
  let floor = 0;
  for (const item of raw) {
    const n = wholeNumber(item);
    if (n === null || n < 0) return null;
    floor = Math.max(floor, Math.min(max, n));
    out.push(floor);
  }
  return out.some((n) => n > 0) ? out : null;
}

function slugKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function sanitizeResources(raw: unknown): CustomResource[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomResource[] = [];
  const keys = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const label = text(item.label).slice(0, 60);
    const key = slugKey(text(item.key) || label);
    if (!label || !key || keys.has(key)) continue;
    const rest = text(item.rest).toLowerCase() === "short" ? "short" : "long";
    const scaling = text(item.scaling).toLowerCase();
    if (scaling === "per_level") {
      out.push({ key, label, rest, scaling: "per_level" });
    } else if (scaling === "table") {
      // A null cell (non-numeric model output) drops the filtered list below 20,
      // which invalidates the whole resource rather than becoming a 0.
      const table = Array.isArray(item.table_values)
        ? item.table_values.map(wholeNumber).filter((n): n is number => n !== null)
        : [];
      if (table.length !== 20 || table.some((n) => n < 0 || n > 99)) continue;
      out.push({ key, label, rest, scaling: "table", table_values: table });
    } else {
      const value = wholeNumber(item.fixed_value);
      out.push({
        key, label, rest, scaling: "fixed",
        fixed_value: value !== null && value >= 0 && value <= 99 ? value : 1,
      });
    }
    keys.add(key);
    if (out.length >= MAX_RESOURCES) break;
  }
  return out;
}

/** The slice of a class row the progression rules constrain. `features` maps level to feature ids. */
export type ClassProgressionLike = Pick<
  CustomClassInsert,
  | "hit_die" | "saving_throws" | "asi_levels" | "subclass_level" | "spell_slots"
  | "spells_known" | "cantrips_known" | "caster_type" | "features" | "resources"
>;

function isTable20(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === 20 && v.every((n) => Number.isInteger(n) && n >= 0);
}

/** Every structural problem with a class's progression. An empty list means the class is playable as written. */
export function validateClassProgression(c: ClassProgressionLike): string[] {
  const problems: string[] = [];

  if (!HIT_DICE.some((d) => d === c.hit_die)) problems.push(`Hit die ${String(c.hit_die)} is not d6, d8, d10 or d12.`);

  const saves = c.saving_throws;
  if (saves.length !== 2 || new Set(saves).size !== 2 || !saves.every((s) => ABILITY_NAMES.some((a) => a === s))) {
    problems.push("A class has exactly two different saving throw proficiencies.");
  }

  const asi = c.asi_levels;
  if (!asi.every((l, i) => Number.isInteger(l) && l >= 1 && l <= 20 && (i === 0 || l > asi[i - 1]))) {
    problems.push("Ability score improvement levels must be increasing levels between 1 and 20.");
  }

  if (!Number.isInteger(c.subclass_level) || c.subclass_level < 1 || c.subclass_level > 20) {
    problems.push("The subclass level must be between 1 and 20.");
  }

  const levels = Object.keys(c.features);
  for (const key of levels) {
    const level = Number(key);
    if (!Number.isInteger(level) || level < 1 || level > 20) problems.push(`Features at level "${key}" are outside levels 1 to 20.`);
  }
  if (!c.features["1"]?.length) problems.push("The class has no level 1 feature.");
  if (!c.features[String(c.subclass_level)]?.length) {
    problems.push(`The class grants nothing at its subclass level (${c.subclass_level}).`);
  }

  if (c.spell_slots !== null) {
    const grid = c.spell_slots;
    if (grid.length !== 20 || !grid.every((row) => row.length === 9 && row.every((n) => Number.isInteger(n) && n >= 0))) {
      problems.push("The spell slot table must be 20 levels of 9 spell levels.");
    }
  }
  if ((c.caster_type === "none") !== (c.spell_slots === null)) {
    problems.push("Spell slots and caster type disagree about whether this class casts spells.");
  }
  if (c.spells_known !== null && !isTable20(c.spells_known)) problems.push("Spells known must be a 20-level table.");
  if (c.cantrips_known !== null && !isTable20(c.cantrips_known)) problems.push("Cantrips known must be a 20-level table.");

  const keys = new Set<string>();
  for (const r of c.resources) {
    if (!r.key || !r.label) problems.push("A resource needs a key and a label.");
    if (keys.has(r.key)) problems.push(`Resource "${r.key}" appears twice.`);
    keys.add(r.key);
    if (r.scaling === "table" && !isTable20(r.table_values)) problems.push(`Resource "${r.key}" needs a 20-level table.`);
    if (r.scaling === "fixed" && !Number.isInteger(r.fixed_value)) problems.push(`Resource "${r.key}" needs a fixed value.`);
  }

  return problems;
}

export interface ClassDraftContext {
  ruleset: RulesetKey;
  campaignId: string | null;
}

export interface ClassDraft {
  /** The class row without its features: those are created first and then linked in. */
  base: CustomClassInsert;
  features: LevelledFeatureDraft[];
  progression: CasterProgression;
  /** Structural problems the normaliser could not repair. Empty when the draft can be created. */
  problems: string[];
}

function subclassGrantFeature(className: string, level: number, ctx: ClassDraftContext): LevelledFeatureDraft {
  const name = ctx.ruleset === "2024" ? `${className} Subclass` : "Subclass Choice";
  return {
    level,
    insert: {
      name,
      description: toTiptapJson(
        `At level ${level}, you choose a subclass of the ${className} class. Your subclass grants you features at level ${level} and again at later levels.`,
      ),
      feature_type: "passive",
      source: "Grimoire:AI",
      prerequisite: null,
      tags: [],
      open5e_import: false,
      ruleset: ctx.ruleset,
      campaign_id: ctx.campaignId,
      ai_provenance: null,
    },
  };
}

/**
 * Turn the model's class JSON into a class that is structurally valid by
 * construction and shaped for the table's edition: ASI levels are the book's,
 * the 2024 subclass level is 3, and spell slots come from the published caster
 * tables for the chosen progression, never from numbers the model wrote.
 */
export function classDraftFromAi(ai: ClassAiResult, ctx: ClassDraftContext): ClassDraft {
  const className = text(ai.class_name).slice(0, 80);
  const hitDieRaw = wholeNumber(ai.hit_die);
  const hit_die: HitDie = HIT_DICE.find((d) => d === hitDieRaw) ?? 8;

  const abilities = abilityList(ai.primary_ability);
  const progression = casterProgressionFrom(ai.caster_progression);
  const subclass_level = subclassLevelFor(ai.subclass_level, ctx.ruleset);

  const features = levelledFeaturesFromAi(
    ai.features,
    ai.ai_provenance,
    ctx,
    { maxPerLevel: MAX_FEATURES_PER_LEVEL, maxTotal: MAX_FEATURES },
  );
  // The subclass is granted by a feature at the subclass level; add the plain
  // one when the model left that level empty so the level is never bare.
  if (className && !features.some((f) => f.level === subclass_level)) {
    features.push(subclassGrantFeature(className, subclass_level, ctx));
    features.sort((a, b) => a.level - b.level);
  }

  const casts = progression !== "none";
  const casterTypeRaw = text(ai.caster_type).toLowerCase();
  const caster_type: CasterType = !casts
    ? "none"
    : CASTER_TYPES.find((t) => t === casterTypeRaw)
      ?? (ctx.ruleset === "2014" && progression === "pact" ? "known" : "prepared");
  const preparedRaw = text(ai.prepared_ability).toLowerCase();
  const prepared_ability: PreparedAbility | null = casts && caster_type !== "known"
    ? PREPARED_ABILITIES.find((a) => a === preparedRaw)
      ?? abilities.map((a) => ABILITY_TO_PREPARED[a]).find((a) => a !== undefined)
      ?? "cha"
    : null;

  const base: CustomClassInsert = {
    class_name: className,
    source: "Grimoire:AI",
    ruleset: ctx.ruleset,
    campaign_id: ctx.campaignId,
    hit_die,
    primary_ability: abilities.length ? abilities.slice(0, 2).join(" and ") : null,
    saving_throws: abilityList(ai.saving_throws).slice(0, 2),
    armor_proficiencies: stringList(ai.armor_proficiencies, MAX_PROFICIENCIES, 60),
    weapon_proficiencies: stringList(ai.weapon_proficiencies, MAX_PROFICIENCIES, 60),
    subclass_level,
    features: featureIdsByLevel(features, features.map((_, i) => `pending-${i}`)),
    asi_levels: [...DEFAULT_ASI_LEVELS],
    spell_slots: slotGridFor(progression, ctx.ruleset),
    spells_known: casts && caster_type === "known" ? sanitizeKnownTable(ai.spells_known, 30) : null,
    cantrips_known: casts ? sanitizeKnownTable(ai.cantrips_known, 6) : null,
    slot_recovery: progression === "pact" ? "short" : "long",
    caster_type,
    prepared_ability,
    prepared_divisor: prepared_ability && casts ? PREPARED_DIVISOR[progression] : null,
    steps: [],
    resources: sanitizeResources(ai.resources),
    ai_provenance: ai.ai_provenance ?? null,
  };

  const problems = validateClassProgression(base);
  if (!className) problems.unshift("The class has no name.");
  return { base, features, progression, problems };
}

/** The class row with its `features` pointing at the created feature rows, in draft order. */
export function classWithFeatureIds(draft: ClassDraft, ids: readonly string[]): CustomClassInsert {
  return { ...draft.base, features: featureIdsByLevel(draft.features, ids) };
}

export interface ClassSummaryLine {
  label: string;
  count: number;
}

/** Feature counts by level band, for the confirmation step. */
export function featureCountsByBand(features: readonly LevelledFeatureDraft[]): ClassSummaryLine[] {
  const bands = [
    { label: "Levels 1-4", from: 1, to: 4 },
    { label: "Levels 5-10", from: 5, to: 10 },
    { label: "Levels 11-16", from: 11, to: 16 },
    { label: "Levels 17-20", from: 17, to: 20 },
  ];
  return bands.map(({ label, from, to }) => ({
    label,
    count: features.filter((f) => f.level >= from && f.level <= to).length,
  }));
}
