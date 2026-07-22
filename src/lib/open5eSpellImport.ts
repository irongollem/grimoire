import type { SpellInsert, SpellSchool, HigherLevelDamage } from "@/types/spell.types";
import { SPELL_SCHOOLS, SPELL_CLASSES } from "@/types/spell.types";
import { ARTIFICER_SPELL_DELTA } from "@/data/artificerSpellDelta";
import { fetchAll, fetchAllFromDocuments, rulesetForDocument, slugifyKey, stableSrdId } from "@/lib/open5eApi";
import type { Open5eDocumentRef } from "@/lib/open5eApi";
import type { RulesetKey } from "@/types/ruleset.types";
import { buildStructuredSpellEffects } from "@/lib/spellEffects";

type SupportedRuleset = RulesetKey;

interface Open5eCastingOption extends Record<string, unknown> {
  type: string;
  damage_roll: string | null;
  target_count: number | null;
  duration: string | null;
  range: number | null;
  concentration: boolean | null;
  shape_size: number | null;
  desc: string | null;
}

interface Open5eV2Spell {
  key: string;
  document: Open5eDocumentRef;
  casting_options: Open5eCastingOption[];
  school: { name: string; key: string } | string;
  classes: Array<{ name: string; key: string }>;
  name: string;
  desc: string;
  level: number;
  higher_level: string;
  target_type: string | null;
  range_text: string;
  range: number | null;
  ritual: boolean;
  casting_time: string;
  reaction_condition: string | null;
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  material_specified: string;
  target_count: number | null;
  saving_throw_ability: string;
  attack_roll: boolean;
  damage_roll: string;
  damage_types: string[];
  duration: string;
  shape_type: string | null;
  shape_size: number | null;
  shape_size_unit: string | null;
  concentration: boolean;
}

export interface Open5eDocument {
  slug: string;
  title: string;
  ruleset: SupportedRuleset;
  source_revision: string;
  license: string | null;
}

export interface ImportedSrdSpell extends SpellInsert {
  id: string;
  conceptual_key: string;
  ruleset: SupportedRuleset;
  source_document_key: string;
  source_record_key: string;
  source_revision: string;
  source_license: string | null;
  provenance: Record<string, unknown>;
  casting_options: Open5eCastingOption[];
  mechanics_reviewed: boolean;
  effect_schema_version: number;
}

export async function fetchOpen5eDocuments(): Promise<Open5eDocument[]> {
  const docs = await fetchAll<Open5eDocumentRef>("https://api.open5e.com/v2/documents/");
  return docs
    .map((document): Open5eDocument | null => {
      const ruleset = rulesetForDocument(document);
      if (!ruleset) return null;
      return {
        slug: document.key,
        title: document.display_name || document.name,
        ruleset,
        source_revision: document.name,
        license: document.licenses?.map((license) => license.key).join(", ") || null,
      };
    })
    .filter((document): document is Open5eDocument => document !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

function normalizeSchool(raw: string | { name: string }): SpellSchool {
  const lower = (typeof raw === "string" ? raw : raw.name).toLowerCase().trim();
  return (SPELL_SCHOOLS as readonly string[]).includes(lower)
    ? (lower as SpellSchool)
    : "evocation";
}

const CASTING_TIME_MAP: Record<string, string> = {
  action: "Action",
  "bonus action": "Bonus Action",
  reaction: "Reaction",
  "1 minute": "1 Minute",
  "10 minutes": "10 Minutes",
  "1 hour": "1 Hour",
  "8 hours": "8 Hours",
  "24 hours": "24 Hours",
};

function normalizeCastingTime(spell: Open5eV2Spell) {
  const lower = spell.casting_time.toLowerCase().trim().replace(/^1 /, "");
  const castingTime = CASTING_TIME_MAP[lower];
  if (castingTime) {
    return {
      casting_time: castingTime,
      casting_time_custom: spell.reaction_condition || null,
    };
  }
  return { casting_time: "Special", casting_time_custom: spell.casting_time };
}

const DURATION_MAP: Record<string, string> = {
  instantaneous: "Instantaneous",
  "until dispelled": "Until Dispelled",
  "1 round": "1 Round",
  "1 minute": "1 Minute",
  "10 minutes": "10 Minutes",
  "1 hour": "1 Hour",
  "8 hours": "8 Hours",
  "24 hours": "24 Hours",
  "7 days": "7 Days",
  "30 days": "30 Days",
};

function normalizeDuration(spell: Open5eV2Spell) {
  const raw = spell.duration?.trim() || "Special";
  const lower = raw.toLowerCase();
  if (spell.concentration) {
    const withoutConcentration = lower.replace(/^concentration,?\s*(up to\s*)?/, "");
    const suffix = DURATION_MAP[withoutConcentration] ?? raw;
    return { duration: `Concentration, up to ${suffix.toLowerCase()}`, duration_custom: null };
  }
  const duration = DURATION_MAP[lower];
  return duration
    ? { duration, duration_custom: null }
    : { duration: "Special", duration_custom: raw };
}

function normalizeRange(spell: Open5eV2Spell) {
  const raw = spell.range_text?.trim() || "Special";
  const lower = raw.toLowerCase();
  if (["self", "touch", "sight", "unlimited"].includes(lower)) {
    return { range: lower[0].toUpperCase() + lower.slice(1), range_custom: null };
  }
  const feet = lower.match(/^(\d+)\s*(?:feet|foot|ft\.?)$/);
  if (feet) return { range: `${feet[1]} ft.`, range_custom: null };
  if (/^\d+\s*miles?$/.test(lower)) return { range: lower.replace("miles", "mile"), range_custom: null };
  return { range: "Special", range_custom: raw };
}

const VALID_CLASSES = new Set<string>(SPELL_CLASSES);

function normalizeClasses(spell: Open5eV2Spell): string[] {
  const classes = spell.classes.map((entry) => entry.name).filter((name) => VALID_CLASSES.has(name));
  if (ARTIFICER_SPELL_DELTA.has(spell.name) && !classes.includes("Artificer")) classes.push("Artificer");
  return classes;
}

const UPCAST_DICE_RE = /(\d+d\d+)\s+(?:for|per)\s+each\s+(?:spell\s+)?slot\s+level\s+above/i;

function parseHigherLevelDamage(prose: string | null): HigherLevelDamage | null {
  if (!prose || /heal/i.test(prose)) return null;
  const match = prose.match(UPCAST_DICE_RE);
  return match ? { dice_per_level: match[1], type: null } : null;
}

function parseHigherLevelHealing(prose: string | null): string | null {
  if (!prose || !/heal/i.test(prose)) return null;
  return prose.match(UPCAST_DICE_RE)?.[1] ?? null;
}

function inferAttackType(spell: Open5eV2Spell): string | null {
  if (spell.attack_roll) return /melee spell attack/i.test(spell.desc) ? "melee_spell" : "ranged_spell";
  if (spell.saving_throw_ability) return "save";
  if (spell.damage_roll && !isHealingSpell(spell)) return "automatic";
  return null;
}

function isHealingSpell(spell: Open5eV2Spell): boolean {
  return /(?:regains?|restore)[^.]*hit points/i.test(spell.desc);
}

function inferSaveEffect(spell: Open5eV2Spell): string | null {
  if (!spell.saving_throw_ability) return null;
  if (/half (?:as much )?damage|half the damage|half damage/i.test(spell.desc)) return "half";
  if (/on a successful save[^.]*no damage|takes no damage on a successful save/i.test(spell.desc)) return "negates";
  return "special";
}

export function mapOpen5eV2Spell(
  spell: Open5eV2Spell,
  documentMetadata?: Open5eDocument,
): ImportedSrdSpell | null {
  const ruleset = rulesetForDocument(spell.document);
  if (!ruleset) return null;
  const { casting_time, casting_time_custom } = normalizeCastingTime(spell);
  const { duration, duration_custom } = normalizeDuration(spell);
  const { range, range_custom } = normalizeRange(spell);
  const damageType = spell.damage_types.length === 1 ? spell.damage_types[0].toLowerCase() : "";
  const healing = isHealingSpell(spell);
  const higherLevelDamage = parseHigherLevelDamage(spell.higher_level);
  const higherLevelHealing = parseHigherLevelHealing(spell.higher_level);
  const effects = buildStructuredSpellEffects(spell).map((effect) => {
    // A save-for-half branch is a copy of the base effect with a different
    // outcome/multiplier. It must scale with the same slot-level dice or a
    // successful save would incorrectly use the spell's base-level damage.
    if (effect.id !== "base" && effect.id !== "base-save-half") return effect;
    const dice = effect.kind === "healing" ? higherLevelHealing : higherLevelDamage?.dice_per_level;
    return dice ? { ...effect, scaling: { mode: "slot" as const, dice } } : effect;
  });

  return {
    id: stableSrdId(spell.key),
    conceptual_key: slugifyKey(spell.name),
    ruleset,
    source_document_key: spell.document.key,
    source_record_key: spell.key,
    source_revision: documentMetadata?.source_revision ?? spell.document.name,
    source_license: documentMetadata?.license ?? null,
    provenance: {
      provider: "open5e",
      api_version: "v2",
      publisher: spell.document.publisher ?? null,
      gamesystem: spell.document.gamesystem ?? null,
      permalink: spell.document.permalink ?? null,
    },
    casting_options: spell.casting_options ?? [],
    effect_schema_version: 1,
    effects,
    mechanics_reviewed: false,
    name: spell.name,
    level: spell.level,
    school: normalizeSchool(spell.school),
    casting_time,
    casting_time_custom,
    range,
    range_custom,
    components: [spell.verbal && "V", spell.somatic && "S", spell.material && "M"].filter(Boolean) as string[],
    material: spell.material_specified?.trim() || null,
    duration,
    duration_custom,
    concentration: spell.concentration,
    ritual: spell.ritual,
    attack_type: inferAttackType(spell),
    save_attribute: spell.saving_throw_ability ? spell.saving_throw_ability.slice(0, 3).toUpperCase() : null,
    save_effect: inferSaveEffect(spell),
    damage_rolls: spell.damage_roll && !healing ? [{ dice: spell.damage_roll, type: damageType }] : null,
    healing_dice: healing ? spell.damage_roll || null : null,
    target_description: [spell.target_count, spell.target_type].filter((value) => value !== null && value !== "").join(" ") || null,
    aoe_shape: spell.shape_type?.toLowerCase() || null,
    aoe_size: spell.shape_size === null ? null : `${spell.shape_size} ${spell.shape_size_unit ?? "feet"}`,
    condition_inflicted: null,
    description: spell.desc ?? "",
    higher_levels: spell.higher_level?.trim() || null,
    higher_level_damage: higherLevelDamage,
    higher_level_healing: higherLevelHealing,
    classes: normalizeClasses(spell),
    tags: [],
    source: spell.document.key,
    source_title: spell.document.display_name || spell.document.name,
    source_url: spell.document.permalink || null,
    open5e_import: true,
    image_url: null,
  };
}

export interface ExistingSrdSpellIdentity {
  id: string;
  source_document_key: string;
  source_record_key: string;
  image_url: string | null;
  mechanics_reviewed: boolean;
}

export interface SrdSpellImportPlan {
  /** Rows to upsert — new spells plus refreshed existing (unreviewed) ones. */
  rows: ImportedSrdSpell[];
  /** Existing rows left untouched because an admin already reviewed their mechanics. */
  skippedReviewed: number;
}

/**
 * Reconciles freshly-fetched Open5e spells against existing `srd_spells` rows
 * keyed by (source_document_key, source_record_key). `mapOpen5eV2Spell`
 * always sets `mechanics_reviewed: false` on the mapped row — it has no way
 * to know an admin already checked the structured effects against the
 * source text — so a naive re-import would silently reset that review flag
 * (and overwrite the reviewed content) every time upstream data changes
 * (e.g. open5e-api#964). Rows already marked reviewed are excluded from the
 * plan entirely; everything else refreshes normally, carrying over the
 * existing row's id and any admin-set image_url.
 */
export function planSrdSpellImport(
  spells: ReadonlyArray<ImportedSrdSpell>,
  existing: ReadonlyArray<ExistingSrdSpellIdentity>,
): SrdSpellImportPlan {
  const byIdentity = new Map(existing.map((row) => [
    `${row.source_document_key}::${row.source_record_key}`,
    row,
  ]));
  const rows: ImportedSrdSpell[] = [];
  let skippedReviewed = 0;
  for (const spell of spells) {
    const current = byIdentity.get(`${spell.source_document_key}::${spell.source_record_key}`);
    if (current?.mechanics_reviewed) {
      skippedReviewed++;
      continue;
    }
    rows.push(current ? { ...spell, id: current.id, image_url: current.image_url } : spell);
  }
  return { rows, skippedReviewed };
}

export async function fetchSrdSpells(sourceKeys?: string[]): Promise<ImportedSrdSpell[]> {
  const documents = await fetchOpen5eDocuments();
  const selected = sourceKeys?.length
    ? documents.filter((document) => sourceKeys.includes(document.slug))
    : documents;
  if (!selected.length) return [];
  const metadata = new Map(selected.map((document) => [document.slug, document]));
  const spells = await fetchAllFromDocuments<Open5eV2Spell>(
    "https://api.open5e.com/v2/spells/",
    selected.map((document) => document.slug),
  );

  return spells
    .map((spell) => mapOpen5eV2Spell(spell, metadata.get(spell.document.key)))
    .filter((spell): spell is ImportedSrdSpell => spell !== null);
}
