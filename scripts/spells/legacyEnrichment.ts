/**
 * Pure parts of the legacy-spell enrichment (#1123): which v2 document holds
 * each v1 book, how a legacy row is matched to a v2 spell by name, and the
 * PATCH body that carries only mechanics across.
 */

/** v1 `source_document_key` -> the Open5e v2 document holding the same book. */
export const LEGACY_TO_V2_DOCUMENT: Record<string, string> = {
  dmag: "deepm",
  "dmag-e": "deepmx",
  toh: "toh",
  kp: "kp",
  a5e: "a5e-ag",
  o5e: "open5e",
  warlock: "wz", // Warlock Zine
};

/** The only columns an enrichment may write. Anything else is a bug. */
export const MECHANICS_COLUMNS = [
  "attack_type",
  "save_attribute",
  "save_effect",
  "damage_rolls",
  "healing_dice",
  "higher_level_damage",
  "higher_level_healing",
  "effects",
  "casting_options",
  "effect_schema_version",
] as const;
export type MechanicsColumn = (typeof MECHANICS_COLUMNS)[number];

export interface LegacyRow {
  id: string;
  name: string;
  description: string;
  source_document_key: string;
  mechanics_reviewed: boolean;
  provenance: Record<string, unknown> | null;
  damage_rolls: unknown[] | null;
  healing_dice: string | null;
}

export interface V2Spell {
  name: string;
  description: string;
  source_document_key: string;
  source_record_key: string;
  damage_rolls: unknown[] | null;
  healing_dice: string | null;
  [column: string]: unknown;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Same as normalizeName with a trailing "(...)" removed; the fallback key. */
export function normalizeNameWithoutParenthetical(name: string): string {
  return normalizeName(name.replace(/\s*\([^)]*\)\s*$/, ""));
}

export function normalizeText(text: string): string {
  return normalizeName(text);
}

export type MatchResult =
  | { status: "matched"; spell: V2Spell; via: "exact" | "parenthetical" }
  | { status: "unmatched" }
  | { status: "ambiguous"; candidates: string[] };

function lookup(
  key: string,
  index: Map<string, V2Spell[]>,
  via: "exact" | "parenthetical",
): MatchResult | null {
  const hits = index.get(key);
  if (!hits?.length) return null;
  if (hits.length > 1) return { status: "ambiguous", candidates: hits.map((spell) => spell.source_record_key) };
  return { status: "matched", spell: hits[0], via };
}

function indexBy(spells: V2Spell[], keyOf: (name: string) => string): Map<string, V2Spell[]> {
  const index = new Map<string, V2Spell[]>();
  for (const spell of spells) {
    const key = keyOf(spell.name);
    index.set(key, [...(index.get(key) ?? []), spell]);
  }
  return index;
}

/** Match one legacy row against the spells of its mapped v2 document. */
export function matchLegacyRow(row: LegacyRow, v2Spells: V2Spell[]): MatchResult {
  const document = LEGACY_TO_V2_DOCUMENT[row.source_document_key];
  const candidates = v2Spells.filter((spell) => spell.source_document_key === document);
  const exact = lookup(normalizeName(row.name), indexBy(candidates, normalizeName), "exact");
  if (exact) return exact;
  // Parenthetical fallback only when the plain name found nothing at all.
  return (
    lookup(
      normalizeNameWithoutParenthetical(row.name),
      indexBy(candidates, normalizeNameWithoutParenthetical),
      "parenthetical",
    ) ?? { status: "unmatched" }
  );
}

export function descriptionsDiffer(legacy: string, v2: string): boolean {
  return normalizeText(legacy) !== normalizeText(v2);
}

function hasRoll(rolls: unknown[] | null, dice: string | null): boolean {
  return (Array.isArray(rolls) && rolls.length > 0) || Boolean(dice);
}

export function gainsRoll(row: LegacyRow, spell: V2Spell): boolean {
  return !hasRoll(row.damage_rolls, row.healing_dice) && hasRoll(spell.damage_rolls, spell.healing_dice);
}

/** The PATCH body: mechanics columns plus a merged provenance, nothing else. */
export function buildPatch(row: LegacyRow, spell: V2Spell, at: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const column of MECHANICS_COLUMNS) patch[column] = spell[column];
  patch.provenance = {
    ...row.provenance,
    mechanics_enriched_from: {
      provider: "open5e",
      api_version: "v2",
      document: spell.source_document_key,
      record: spell.source_record_key,
      at,
    },
  };
  return patch;
}

export type Outcome =
  | "enriched"
  | "skipped_reviewed"
  | "unmatched"
  | "ambiguous"
  | "unmapped_document";

export interface RowOutcome {
  id: string;
  name: string;
  document: string;
  outcome: Outcome;
  via?: "exact" | "parenthetical";
  record?: string;
  candidates?: string[];
  gainsRoll?: boolean;
  descriptionDiffers?: boolean;
  patch?: Record<string, unknown>;
}

export function planRow(row: LegacyRow, v2Spells: V2Spell[], at: string): RowOutcome {
  const head = { id: row.id, name: row.name, document: row.source_document_key };
  if (!(row.source_document_key in LEGACY_TO_V2_DOCUMENT)) return { ...head, outcome: "unmapped_document" };
  if (row.mechanics_reviewed) return { ...head, outcome: "skipped_reviewed" };
  const match = matchLegacyRow(row, v2Spells);
  if (match.status === "unmatched") return { ...head, outcome: "unmatched" };
  if (match.status === "ambiguous") return { ...head, outcome: "ambiguous", candidates: match.candidates };
  return {
    ...head,
    outcome: "enriched",
    via: match.via,
    record: match.spell.source_record_key,
    gainsRoll: gainsRoll(row, match.spell),
    descriptionDiffers: descriptionsDiffer(row.description, match.spell.description),
    patch: buildPatch(row, match.spell, at),
  };
}
