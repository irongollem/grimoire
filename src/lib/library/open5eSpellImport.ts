import type { SpellInsert, SpellSchool, HigherLevelDamage } from "@/types/spell.types";
import { SPELL_SCHOOLS, SPELL_CLASSES } from "@/types/spell.types";
import { ARTIFICER_SPELL_DELTA } from "@/data/artificerSpellDelta";
import { SRD_2014_CLASS_SPELL_LISTS } from "@/data/srd2014ClassSpellLists";
import { fetchAll, fetchAllFromDocuments, rulesetForDocument, slugifyKey, stableSrdId } from "@/lib/library/open5eApi";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import type { RulesetKey } from "@/types/ruleset.types";
import { buildStructuredSpellEffects, describesHealing } from "@/rules/spellEffects";
import type { DamagePart } from "@/lib/library/spellTextMechanics";
import {
  matchAttackDamage, matchChoiceAttackDamage, matchChoiceSaveDamage, matchHealing, matchInstances, matchRider, matchSaveDamage,
  normDice, rollIsNotDamageOrHealing, upcastNamedTypes,
} from "@/lib/library/spellTextMechanics";
import type { InstanceRead } from "@/lib/library/spellTextMechanics";

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

export interface ImportedLibrarySpell extends SpellInsert {
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
  // "1 action" reads as "action", but "1 minute" and "1 hour" are keys as written.
  const lower = spell.casting_time.toLowerCase().trim();
  const castingTime = CASTING_TIME_MAP[lower] ?? CASTING_TIME_MAP[lower.replace(/^1 /, "")];
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
    const suffix = DURATION_MAP[withoutConcentration] ?? withoutConcentration;
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
  const miles = lower.match(/^(\d+)\s*miles?$/);
  if (miles) return { range: `${miles[1]} ${miles[1] === "1" ? "mile" : "miles"}`, range_custom: null };
  return { range: "Special", range_custom: raw };
}

const VALID_CLASSES = new Set<string>(SPELL_CLASSES);

function normalizeClasses(spell: Open5eV2Spell): string[] {
  const tagged = spell.classes.map((entry) => entry.name).filter((name) => VALID_CLASSES.has(name));
  // The 2014 SRD's own class lists replace Open5e's tags, which fold in every
  // subclass's spells (see srd2014ClassSpellLists.ts); a subclass's spells reach
  // a character through the subclass instead. A class the table does not cover
  // keeps Open5e's tag.
  const classes =
    spell.document.key === "srd-2014"
      ? [
          ...SPELL_CLASSES.filter((name) => SRD_2014_CLASS_SPELL_LISTS[name]?.has(spell.name)),
          ...tagged.filter((name) => !(name in SRD_2014_CLASS_SPELL_LISTS)),
        ]
      : tagged;
  if (ARTIFICER_SPELL_DELTA.has(spell.name) && !classes.includes("Artificer")) classes.push("Artificer");
  return classes;
}

export const UPCAST_DICE_RE = /(\d+d\d+)\s+(?:for|per)\s+each\s+(?:spell\s+)?slot\s+level\s+above/i;

function parseHigherLevelDamage(prose: string | null): HigherLevelDamage | null {
  if (!prose || /heal/i.test(prose)) return null;
  const match = prose.match(UPCAST_DICE_RE);
  return match ? { dice_per_level: match[1], type: null } : null;
}

function parseHigherLevelHealing(prose: string | null): string | null {
  if (!prose || !/heal/i.test(prose)) return null;
  return prose.match(UPCAST_DICE_RE)?.[1] ?? null;
}

function inferAttackType(spell: Open5eV2Spell, rollKept: boolean, rider: boolean): string | null {
  // A rider is rolled when a weapon hits, so nothing is rolled at cast.
  if (rider) return null;
  // Bless carries attack_roll for its d4; without a damage roll and a "spell attack" in the text there is no attack.
  if (spell.attack_roll && (rollKept || /spell attack/i.test(spell.desc))) return /melee spell attack/i.test(spell.desc) ? "melee_spell" : "ranged_spell";
  if (spell.saving_throw_ability) return "save";
  if (rollKept && !isHealingSpell(spell)) return "automatic";
  return null;
}

function isHealingSpell(spell: Open5eV2Spell): boolean {
  return describesHealing(spell.desc);
}

function inferSaveEffect(spell: Open5eV2Spell): string | null {
  if (!spell.saving_throw_ability) return null;
  if (/half (?:as much )?damage|half the damage|half damage/i.test(spell.desc)) return "half";
  if (/on a successful save[^.]*no damage|takes no damage on a successful save/i.test(spell.desc)) return "negates";
  return "special";
}

/** What the text proves about the cast-time roll, beside what Open5e filled in. */
interface ReadRoll {
  dice: string;
  /** One part, or two when the text names both in one sentence. */
  parts: DamagePart[];
  /** Open5e's roll was a die the text uses for something else (Bless, Guidance). */
  dropped: boolean;
  /** The caster picks the damage type at cast: the types the text lists, and the part carries none. */
  choices?: string[];
  /** Extra damage rolled when a weapon hits (Hex), not at cast: no effects, no cast-time attack. */
  rider?: boolean;
}

const instanceRead = (spell: Open5eV2Spell): InstanceRead | null => matchInstances(spell.desc, spell.higher_level, spell.level);

function readRoll(spell: Open5eV2Spell): ReadRoll {
  const none: ReadRoll = { dice: "", parts: [], dropped: false };
  if (isHealingSpell(spell)) {
    if (spell.damage_roll && rollIsNotDamageOrHealing(spell.desc, spell.damage_roll)) return { ...none, dropped: true };
    return { ...none, dice: spell.damage_roll || matchHealing(spell.desc) || "" };
  }
  const rider = matchRider(spell.desc);
  if (rider) return { dice: rider.dice, parts: [rider], dropped: false, rider: true };
  const choice = spell.saving_throw_ability && !spell.attack_roll ? matchChoiceSaveDamage(spell.desc)
    : spell.attack_roll ? matchChoiceAttackDamage(spell.desc) : null;
  // The text is the authority on the dice; Open5e's own roll must agree or the spell is left to the checker's rejection.
  if (choice && (!spell.damage_roll || normDice(spell.damage_roll) === choice.dice)) {
    return { dice: choice.dice, parts: [{ dice: choice.dice, type: "" }], dropped: false, choices: choice.choices };
  }
  const saveText = spell.saving_throw_ability && !spell.attack_roll ? matchSaveDamage(spell.desc) : null;
  // A sentence that names a different save ability than Open5e's is not read as this spell's roll.
  const save = saveText && (!saveText.ability || saveText.ability === spell.saving_throw_ability.toLowerCase()) ? saveText : null;
  const attack = spell.attack_roll ? matchAttackDamage(spell.desc) : null;
  const dart = instanceRead(spell)?.damage;
  const read = save?.parts ?? attack ?? (dart ? [dart] : null);
  // Two parts in one sentence: the text is the authority over Open5e's single roll.
  if (read && read.length === 2) return { dice: read[0].dice, parts: read, dropped: false };
  if (spell.damage_roll && rollIsNotDamageOrHealing(spell.desc, spell.damage_roll)) return { ...none, dropped: true };
  const one = read?.[0];
  if (!spell.damage_roll) return one ? { dice: one.dice, parts: [one], dropped: false } : none;
  const type = spell.damage_types.length === 1 ? spell.damage_types[0].toLowerCase() : one && normDice(one.dice) === normDice(spell.damage_roll) ? one.type : "";
  return { dice: spell.damage_roll, parts: [{ dice: spell.damage_roll, type }], dropped: false };
}

/** "the bludgeoning damage increases by 1d8 ...": the one type an upcast names, else null. */
function upcastPartType(prose: string | null, parts: DamagePart[]): string | null {
  if (!prose || parts.length < 2) return null;
  const named = upcastNamedTypes(prose).filter((type) => parts.some((p) => p.type === type));
  return named.length === 1 ? named[0] : null;
}

export function mapOpen5eV2Spell(
  spell: Open5eV2Spell,
  documentMetadata?: Open5eDocument,
): ImportedLibrarySpell | null {
  const ruleset = rulesetForDocument(spell.document);
  if (!ruleset) return null;
  const { casting_time, casting_time_custom } = normalizeCastingTime(spell);
  const { duration, duration_custom } = normalizeDuration(spell);
  const { range, range_custom } = normalizeRange(spell);
  const healing = isHealingSpell(spell);
  const roll = readRoll(spell);
  const twoParts = roll.parts.length === 2;
  const higherLevelDamage = parseHigherLevelDamage(spell.higher_level);
  if (higherLevelDamage && twoParts) higherLevelDamage.type = upcastPartType(spell.higher_level, roll.parts);
  const higherLevelHealing = parseHigherLevelHealing(spell.higher_level);
  const instances = instanceRead(spell)?.instances ?? null;
  const effectSource = {
    ...spell,
    damage_roll: roll.dice,
    damage_types: roll.parts.length === 1 && roll.parts[0].type ? [roll.parts[0].type] : [],
    damage_parts: twoParts ? roll.parts : null,
    casting_options: roll.dropped ? [] : spell.casting_options,
  };
  const effects = (roll.rider ? [] : buildStructuredSpellEffects(effectSource)).map((built) => {
    // A save-for-half branch is a copy of the base effect with a different
    // outcome/multiplier. It must scale with the same slot-level dice or a
    // successful save would incorrectly use the spell's base-level damage.
    const part = built.id.match(/^base(-2)?(?:-save-half)?$/);
    if (!part) return built;
    const effect = {
      ...built,
      ...(roll.choices ? { damageTypeChoices: roll.choices } : {}),
      ...(instances ? { instances } : {}),
    };
    // With two parts only the one the upcast names scales.
    if (twoParts && effect.damageType !== higherLevelDamage?.type) return effect;
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
    attack_type: inferAttackType(spell, roll.dice !== "", Boolean(roll.rider)),
    save_attribute: spell.saving_throw_ability ? spell.saving_throw_ability.slice(0, 3).toUpperCase() : null,
    save_effect: inferSaveEffect(spell),
    damage_rolls: roll.dice && !healing ? roll.parts : null,
    healing_dice: healing ? roll.dice || null : null,
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

export interface ExistingLibrarySpellIdentity {
  id: string;
  source_document_key: string;
  source_record_key: string;
  image_url: string | null;
  mechanics_reviewed: boolean;
}

export interface LibrarySpellImportPlan {
  /** Rows to upsert — new spells plus refreshed existing (unreviewed) ones. */
  rows: ImportedLibrarySpell[];
  /** Existing rows left untouched because an admin already reviewed their mechanics. */
  skippedReviewed: number;
}

/**
 * Reconciles freshly-fetched Open5e spells against existing `library_spells` rows
 * keyed by (source_document_key, source_record_key). `mapOpen5eV2Spell`
 * always sets `mechanics_reviewed: false` on the mapped row — it has no way
 * to know an admin already checked the structured effects against the
 * source text — so a naive re-import would silently reset that review flag
 * (and overwrite the reviewed content) every time upstream data changes
 * (e.g. open5e-api#964). Rows already marked reviewed are excluded from the
 * plan entirely; everything else refreshes normally, carrying over the
 * existing row's id and any admin-set image_url.
 */
export function planLibrarySpellImport(
  spells: ReadonlyArray<ImportedLibrarySpell>,
  existing: ReadonlyArray<ExistingLibrarySpellIdentity>,
): LibrarySpellImportPlan {
  const byIdentity = new Map(existing.map((row) => [
    `${row.source_document_key}::${row.source_record_key}`,
    row,
  ]));
  const rows: ImportedLibrarySpell[] = [];
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

export async function fetchOpen5eSpells(sourceKeys?: string[]): Promise<ImportedLibrarySpell[]> {
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
    .filter((spell): spell is ImportedLibrarySpell => spell !== null);
}
