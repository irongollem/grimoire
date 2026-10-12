import { fetchAllFromDocuments, licenseForDocumentKey, rulesetForDocument } from "@/lib/library/open5eApi";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import { markdownToTiptapJson, toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { OPEN5E_SPECIES_GAPS } from "@/data/open5eSpeciesGaps";
import { DEFAULT_WALK_SPEED, speciesHasWalkSpeed } from "@/rules/speciesStats";
import type { SpeciesSize, SpeciesSpeed, SpeciesSubrace } from "@/types/species.types";

export interface Open5eTrait {
  name: string;
  desc: string;
  type: string | null;
}

export interface Open5eRace {
  key: string;
  name: string;
  desc: string;
  is_subspecies: boolean;
  /** The parent species' record key (e.g. `"srd_elf"`), not an object: the
   *  live v2 API returns the bare key. */
  subspecies_of: string | null;
  traits: Open5eTrait[];
  document: Open5eDocumentRef;
}

const VALID_SIZES: SpeciesSize[] = ["tiny", "small", "medium", "large"];

export function parseSize(raw: string): SpeciesSize | null {
  const s = raw?.toLowerCase() as SpeciesSize;
  return VALID_SIZES.includes(s) ? s : null;
}

const SPEED_MODES = [
  ["fly", "fly(?:ing)?"],
  ["swim", "swim(?:ming)?"],
  ["climb", "climb(?:ing)?"],
  ["burrow", "burrow(?:ing)?"],
] as const;

/**
 * Reads movement speeds from either shape Open5e writes: the 2024 SRD's terse
 * "30 feet" / "30 ft., fly 30 ft.", and the prose of the 2014 SRD and Kobold
 * Press books ("Your base walking speed is 25 feet.", "a base walking speed
 * of 40 feet", "You have a burrowing speed of 20 feet"). Reading only the terse
 * shape left every 2014 and Tome of Heroes species without a speed, so the
 * character builder fell back to 30 ft for dwarves, gnomes and halflings.
 */
export function parseSpeed(raw: string | undefined): Record<string, number> | null {
  if (!raw) return null;
  const result: Record<string, number> = {};
  const walkMatch = raw.match(/^\s*(\d+)\b/) ?? raw.match(/walking speed (?:is|of) (\d+)/i);
  if (walkMatch) result.walk = parseInt(walkMatch[1]);
  for (const [mode, word] of SPEED_MODES) {
    const match = raw.match(new RegExp(`\\b${word}(?: speed (?:is|of))?\\s+(\\d+)`, "i"));
    if (match) result[mode] = parseInt(match[1]);
  }
  return Object.keys(result).length ? result : null;
}

/**
 * A species' speeds: the Speed trait, plus any other mode a trait grants in so
 * many words ("You have a burrowing speed of 20 feet", the erina's Digger).
 * Only that explicit phrase is read outside the Speed trait, so a number in an
 * unrelated rule ("fly 30 feet" in a spell) cannot become a speed.
 */
export function parseSpeciesSpeed(traits: readonly Open5eTrait[]): Record<string, number> | null {
  const result: Record<string, number> = {};
  for (const entry of traits) {
    if (entry.name.toLowerCase() === "speed") continue;
    for (const [mode, word] of SPEED_MODES) {
      const match = entry.desc.match(new RegExp(`\\byou have an? ${word} speed of (\\d+)`, "i"));
      if (match) result[mode] = parseInt(match[1]);
    }
  }
  Object.assign(result, parseSpeed(traits.find(entry => entry.name.toLowerCase() === "speed")?.desc));
  return Object.keys(result).length ? result : null;
}

/** A language entry that names a choice rather than a language: the player picks it, so it is no language they know yet. */
const LANGUAGE_CHOICE = /\b(?:choice|choose|either|one of the following|associated with|extra language|other language)\b/i;

/** Pulls the language-listing sentence out of a Languages trait, preamble and markdown header removed. */
function languageClause(raw: string): string {
  // Strip leading markdown bold/italic header — handles both "***Languages.***" and "**_Languages._**"
  const cleaned = raw.replace(/^\*+_?[^*\n]+_?\.?\*+\s*/i, "");
  // Parentheticals ("Machine Speech (a whistling, clicking language…)") would split on their commas
  const firstSentence = cleaned.replace(/\s*\([^)]*\)/g, "").split(".")[0];
  // Strip "You can speak, read, and write " / "You speak " preamble
  return firstSentence.replace(/^you (?:can )?(?:speak(?:,? read(?:,? and write)?)?\s+)/i, "");
}

/**
 * The languages a species always knows. The list is copied onto a new
 * character's known languages, so a choice ("your choice of Common or
 * Undercommon", "one extra language of your choice") is left out rather than
 * becoming a language called that; `languagesNeedTrait` keeps the trait text
 * so the choice is still on the sheet.
 */
export function parseLanguages(raw: string | undefined): string[] {
  if (!raw) return [];
  // "Common and one of the following: Abyssal, Infernal, or Void Speech": everything after the colon is the choice
  const fixed = languageClause(raw).replace(/\bone of the following:.*$/i, "");
  return fixed
    .split(/,\s*|\s+and\s+/)
    .map((l) => l.trim().replace(/^and\s+/i, ""))
    .filter((l) => Boolean(l) && !LANGUAGE_CHOICE.test(l));
}

/** True when the Languages trait offers a choice that `parseLanguages` cannot hold. */
export function languagesNeedTrait(raw: string | undefined): boolean {
  return Boolean(raw) && LANGUAGE_CHOICE.test(languageClause(raw as string));
}

/** True when a Speed trait says more than its numbers: "determined by your subrace", "not reduced by heavy armor". */
export function speedNeedsTrait(raw: string | undefined): boolean {
  if (!raw) return false;
  return raw
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .some((sentence) => sentence && !/\d+\s*(?:feet|ft)/i.test(sentence));
}

/** True when a Size trait names no size, or more than one (the 2024 "Medium or Small, chosen when you select this species"). */
export function sizeNeedsTrait(raw: string | undefined): boolean {
  if (!raw) return false;
  const sizes = new Set((raw.match(/\b(tiny|small|medium|large)\b/gi) ?? []).map((size) => size.toLowerCase()));
  return sizes.size !== 1;
}

export function parseTags(race: Open5eRace, size: SpeciesSize | null): string[] {
  const tags: string[] = ["humanoid"];
  if (size) tags.push(size);
  // Add the race's own name as a tag (e.g. "elf", "dwarf", "half-elf")
  const nameTag = race.name.toLowerCase().replace(/\s+/g, "-");
  if (!tags.includes(nameTag)) tags.push(nameTag);
  return tags;
}

export function parseAsi(raw: string | undefined): Record<string, number | string> | null {
  if (!raw) return null;
  const entries: Record<string, number> = {};
  const pattern = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(?:score\s+)?increases? by (\d+)/gi;
  for (const match of raw.matchAll(pattern)) {
    entries[match[1].toLowerCase().slice(0, 3)] = Number(match[2]);
  }
  return Object.keys(entries).length ? entries : null;
}

/** Size, speed and languages read from a record's traits, then filled from the curated gap table only where the record gave none. */
function readStats(race: Open5eRace) {
  const trait = (name: string) => race.traits.find(entry => entry.name.toLowerCase() === name);
  const gap = OPEN5E_SPECIES_GAPS[race.key];
  const size = parseSize(trait("size")?.desc.match(/\b(tiny|small|medium|large)\b/i)?.[1] ?? "") ?? gap?.size ?? null;
  const parsedSpeed = parseSpeciesSpeed(race.traits);
  const speed: SpeciesSpeed | null = parsedSpeed ?? gap?.speed ?? null;
  const parsedLanguages = parseLanguages(trait("languages")?.desc);
  const languages = parsedLanguages.length > 0 ? parsedLanguages : [...(gap?.languages ?? [])];
  // A consumed trait stays a trait when its field cannot hold all of it, so
  // the rule ("determined by your Heritage Subrace", a language choice) is
  // still on the sheet. A gap fill does not consume: the deferring trait stays.
  const consumed = new Set(["ability score increase"]);
  if (!sizeNeedsTrait(trait("size")?.desc)) consumed.add("size");
  if (!speedNeedsTrait(trait("speed")?.desc)) consumed.add("speed");
  if (!languagesNeedTrait(trait("languages")?.desc)) consumed.add("languages");
  return { trait, size, speed, languages, consumed };
}

/**
 * Content Open5e actually supplies — safe to refresh on every re-import,
 * including on an existing row, so upstream fixes (e.g. open5e-api#964-style
 * corrections) are picked up.
 */
export function buildImportedFields(race: Open5eRace, documentMetadata?: ReadonlyMap<string, Open5eDocumentRef>) {
  const { trait, size, speed, languages, consumed } = readStats(race);
  const speciesTraits = race.traits
    .filter(entry => !consumed.has(entry.name.toLowerCase()))
    .map(entry => ({ name: entry.name, description: markdownToTiptapJson(entry.desc) }));
  return {
    name: race.name,
    description: race.desc ? toTiptapJson(race.desc) : null,
    size,
    speed,
    ability_score_increases: parseAsi(trait("ability score increase")?.desc),
    traits: speciesTraits,
    languages,
    tags: parseTags(race, size),
    source: race.document.display_name || race.document.name,
    ruleset: rulesetForDocument(race.document),
    conceptual_key: race.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    source_document_key: race.document.key,
    source_record_key: race.key,
    source_revision: race.document.name,
    source_license: licenseForDocumentKey(documentMetadata, race.document.key),
    provenance: {
      provider: "open5e-v2",
      document: {
        key: race.document.key,
        publisher: race.document.publisher ?? null,
        gamesystem: race.document.gamesystem ?? null,
        permalink: race.document.permalink ?? null,
      },
    },
  };
}

/**
 * Fields Open5e has no data for — DM-owned from the moment the species is
 * created. Only used to fill out a brand-new row; a re-import must never
 * reset these back to null/empty on an existing species (that would wipe
 * DM-added art, subraces, and overrides).
 */
export function buildCreateOnlyDefaults() {
  return {
    subraces: null,
    image_url: null,
    focal_point: null,
    is_shapeshifter: false,
    avg_height: null,
    avg_weight: null,
    granted_spells: [],
  };
}

const ASI_TRAIT = "ability score increase";

/**
 * One Open5e subspecies record as a subrace of its parent. Open5e v2 models a
 * subrace (High Elf, Malkin catfolk) as a species record of its own that
 * points at its parent through `subspecies_of`; Grimoire keeps it inside the
 * parent's `subraces`, which is what the character builder offers. Its ability
 * score increase is the subrace's own, added to the parent's.
 */
export function buildSubrace(race: Open5eRace): SpeciesSubrace {
  const { size, speed, languages, consumed } = readStats(race);
  return {
    name: race.name,
    description: race.desc ? toTiptapJson(race.desc) : "",
    traits: race.traits
      .filter(entry => !consumed.has(entry.name.toLowerCase()))
      .map(entry => ({ name: entry.name, description: markdownToTiptapJson(entry.desc) })),
    ability_score_increases: parseAsi(race.traits.find(entry => entry.name.toLowerCase() === ASI_TRAIT)?.desc),
    // Omitted rather than null when empty, so stored subraces stay lean.
    ...(size ? { size } : {}),
    ...(speed ? { speed } : {}),
    ...(languages.length > 0 ? { languages } : {}),
  };
}

/**
 * Guarantees a walking speed: when neither the species nor every one of its
 * subraces states one, the species takes the 5e baseline and keeps any other
 * mode it has (a swim-only record). Mirrors the `*_walk_speed_present` check.
 */
export function withWalkSpeed<T extends { speed: SpeciesSpeed | null }>(
  fields: T,
  subraces: readonly SpeciesSubrace[] | null,
): T {
  if (speciesHasWalkSpeed({ speed: fields.speed, subraces: subraces ? [...subraces] : null })) return fields;
  return { ...fields, speed: { ...fields.speed, walk: DEFAULT_WALK_SPEED } };
}

/**
 * Splits fetched records into core species and the subraces each one carries,
 * keyed by the parent's record key. A subspecies whose parent was not fetched
 * lands in `orphans`, so a caller can report it rather than lose it silently.
 */
export function groupSubspecies(races: readonly Open5eRace[]): {
  core: Open5eRace[];
  subracesByParent: Map<string, SpeciesSubrace[]>;
  orphans: Open5eRace[];
} {
  const core = races.filter(race => !race.is_subspecies);
  const coreKeys = new Set(core.map(race => race.key));
  const subracesByParent = new Map<string, SpeciesSubrace[]>();
  const orphans: Open5eRace[] = [];
  for (const race of races) {
    if (!race.is_subspecies) continue;
    if (!race.subspecies_of || !coreKeys.has(race.subspecies_of)) {
      orphans.push(race);
      continue;
    }
    const siblings = subracesByParent.get(race.subspecies_of) ?? [];
    siblings.push(buildSubrace(race));
    subracesByParent.set(race.subspecies_of, siblings);
  }
  return { core, subracesByParent, orphans };
}

/**
 * Fetches every species record (subspecies included) from the given Open5e
 * v2 document keys. Unlike `fetchOpen5eMonsters` (which maps eagerly — monsters
 * have no subspecies concept to filter on first), the raw `Open5eRace[]` is
 * returned as-is: a caller that wants importable rows must first decide
 * whether to keep subspecies (`race.is_subspecies`) before calling
 * `buildImportedFields`/`buildCreateOnlyDefaults` — see
 * `scripts/seed-library-species.ts`, which folds subspecies into their parent's
 * `subraces` with `groupSubspecies`.
 */
export async function fetchOpen5eSpecies(documentKeys: string[]): Promise<Open5eRace[]> {
  return fetchAllFromDocuments<Open5eRace>("https://api.open5e.com/v2/species/", documentKeys);
}
