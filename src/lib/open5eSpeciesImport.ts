import { fetchAllFromDocuments, licenseForDocumentKey, rulesetForDocument } from "@/lib/open5eApi";
import type { Open5eDocumentRef } from "@/lib/open5eApi";
import { markdownToTiptapJson, toTiptapJson } from "@/lib/markdownToTiptap";
import type { SpeciesSize } from "@/types/species.types";

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
  subspecies_of: { key: string; name: string } | null;
  traits: Open5eTrait[];
  document: Open5eDocumentRef;
}

const VALID_SIZES: SpeciesSize[] = ["tiny", "small", "medium", "large"];

export function parseSize(raw: string): SpeciesSize | null {
  const s = raw?.toLowerCase() as SpeciesSize;
  return VALID_SIZES.includes(s) ? s : null;
}

export function parseSpeed(raw: string | undefined): Record<string, number> | null {
  if (!raw) return null;
  // e.g. "30 ft., fly 30 ft."
  const result: Record<string, number> = {};
  const walkMatch = raw.match(/^(\d+)/);
  if (walkMatch) result.walk = parseInt(walkMatch[1]);
  const flyMatch = raw.match(/fly\s+(\d+)/i);
  if (flyMatch) result.fly = parseInt(flyMatch[1]);
  const swimMatch = raw.match(/swim\s+(\d+)/i);
  if (swimMatch) result.swim = parseInt(swimMatch[1]);
  const climbMatch = raw.match(/climb\s+(\d+)/i);
  if (climbMatch) result.climb = parseInt(climbMatch[1]);
  return Object.keys(result).length ? result : null;
}

export function parseLanguages(raw: string | undefined): string[] {
  if (!raw) return [];
  // Strip leading markdown bold/italic header — handles both "***Languages.***" and "**_Languages._**"
  const cleaned = raw.replace(/^\*+_?[^*\n]+_?\.?\*+\s*/i, "");
  // Take only the first sentence (the one listing the language names)
  const firstSentence = cleaned.split(".")[0];
  // Strip "You can speak, read, and write " / "You speak " preamble
  const stripped = firstSentence.replace(/^you (?:can )?(?:speak(?:,? read(?:,? and write)?)?\s+)/i, "");
  // Drop entries that are still clearly descriptive phrases (e.g. "your choice of Common or Undercommon")
  return stripped
    .split(/,\s*|\s+and\s+/)
    .map((l) => l.trim())
    .filter((l) => Boolean(l) && !/^your choice/i.test(l));
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

/**
 * Content Open5e actually supplies — safe to refresh on every re-import,
 * including on an existing row, so upstream fixes (e.g. open5e-api#964-style
 * corrections) are picked up.
 */
export function buildImportedFields(race: Open5eRace, documentMetadata?: ReadonlyMap<string, Open5eDocumentRef>) {
  const trait = (name: string) => race.traits.find(entry => entry.name.toLowerCase() === name);
  const size = parseSize(trait("size")?.desc.match(/\b(tiny|small|medium|large)\b/i)?.[1] ?? "");
  const speciesTraits = race.traits
    .filter(entry => !["size", "speed", "languages", "ability score increase"].includes(entry.name.toLowerCase()))
    .map(entry => ({ name: entry.name, description: markdownToTiptapJson(entry.desc) }));
  return {
    name: race.name,
    description: race.desc ? toTiptapJson(race.desc) : null,
    size,
    speed: parseSpeed(trait("speed")?.desc),
    ability_score_increases: parseAsi(trait("ability score increase")?.desc),
    traits: speciesTraits,
    languages: parseLanguages(trait("languages")?.desc),
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
 * DM-added art, notes, subraces, and overrides).
 */
export function buildCreateOnlyDefaults() {
  return {
    notes: null,
    subraces: null,
    image_url: null,
    focal_point: null,
    is_shapeshifter: false,
    avg_height: null,
    avg_weight: null,
    granted_spells: [],
  };
}

/**
 * Fetches every species record (subspecies included) from the given Open5e
 * v2 document keys. Unlike `fetchOpen5eMonsters` (which maps eagerly — monsters
 * have no subspecies concept to filter on first), the raw `Open5eRace[]` is
 * returned as-is: a caller that wants importable rows must first decide
 * whether to keep subspecies (`race.is_subspecies`) before calling
 * `buildImportedFields`/`buildCreateOnlyDefaults` — see
 * `scripts/seed-library-species.ts`, which keeps only non-subspecies rows for the
 * shared table.
 */
export async function fetchOpen5eSpecies(documentKeys: string[]): Promise<Open5eRace[]> {
  return fetchAllFromDocuments<Open5eRace>("https://api.open5e.com/v2/species/", documentKeys);
}
