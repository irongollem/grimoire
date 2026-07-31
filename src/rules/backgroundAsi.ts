/**
 * 2024 PHB background mechanics: the ability-score-increase choice a player
 * makes from a background's fixed ability trio (+2/+1 split or +1/+1/+1), and
 * lookup of the background's Origin feat grant against imported class_features.
 *
 * Pure logic — no Vue, no Supabase — so it's usable from both the character
 * creation wizard (useCharacterCreationForm) and the standalone background
 * picker (PlayerBackgroundPickerView), and is unit-testable on its own.
 */
import type { SaveKey } from "@/types/party.types";
import type { AbilityScoreKey, BackgroundOriginFeat } from "@/types/background.types";
import type { ClassFeature } from "@/types/feature.types";
import { ABILITY_KEYS } from "@/types/card.types";
import { slugifyKey } from "@/lib/library/open5eApi";

export type BackgroundAsiMode = "plus2plus1" | "plus1plus1plus1";

export interface BackgroundAsiChoice {
  mode: BackgroundAsiMode;
  /** Ability receiving +2. Only meaningful (and required) in "plus2plus1" mode. */
  primary?: SaveKey;
  /** Ability receiving +1 alongside `primary`. Only meaningful (and required) in "plus2plus1" mode. */
  secondary?: SaveKey;
}

/** Maps a background's full ability names to the abbreviated SaveKeys stored on PartyMember. */
export const ABILITY_TO_SAVE_KEY: Record<AbilityScoreKey, SaveKey> = {
  strength: "str", dexterity: "dex", constitution: "con",
  intelligence: "int", wisdom: "wis", charisma: "cha",
};

// Same six keys, same order as the local literal this replaced — ABILITY_KEYS
// (src/types/card.types.ts) is the shared source of truth for the ability-key set.
const SAVE_KEYS: readonly SaveKey[] = ABILITY_KEYS;

function asSaveKey(value: unknown): SaveKey | undefined {
  return typeof value === "string" && (SAVE_KEYS as readonly string[]).includes(value)
    ? (value as SaveKey)
    : undefined;
}

/** Maps a background's ASI ability trio (full names) to the abbreviated SaveKeys used on PartyMember. */
export function trioToSaveKeys(trio: readonly AbilityScoreKey[] | null | undefined): SaveKey[] {
  return (trio ?? []).map(name => ABILITY_TO_SAVE_KEY[name]);
}

/**
 * True when `choice` is a complete, well-formed selection for the given trio:
 * every ability referenced belongs to the trio, and plus2plus1 names two
 * distinct abilities (the third is implicitly left untouched).
 */
export function isValidAsiChoice(
  choice: BackgroundAsiChoice | null | undefined,
  trio: readonly AbilityScoreKey[] | null | undefined,
): boolean {
  const allowed = new Set(trioToSaveKeys(trio));
  if (allowed.size !== 3 || !choice) return false;
  if (choice.mode === "plus1plus1plus1") return true;
  if (choice.mode === "plus2plus1") {
    return !!choice.primary && !!choice.secondary
      && choice.primary !== choice.secondary
      && allowed.has(choice.primary)
      && allowed.has(choice.secondary);
  }
  return false;
}

/** The ability-score deltas a valid choice grants. Empty for an invalid/incomplete choice. */
export function abilityBonusesForChoice(
  choice: BackgroundAsiChoice | null | undefined,
  trio: readonly AbilityScoreKey[] | null | undefined,
): Partial<Record<SaveKey, number>> {
  if (!isValidAsiChoice(choice, trio)) return {};
  if (choice!.mode === "plus1plus1plus1") {
    const bonuses: Partial<Record<SaveKey, number>> = {};
    for (const key of trioToSaveKeys(trio)) bonuses[key] = 1;
    return bonuses;
  }
  return { [choice!.primary!]: 2, [choice!.secondary!]: 1 };
}

/**
 * Runtime-validate a `class_choices.background_asi` value read back from the
 * DB (jsonb → unknown). Returns null for anything malformed rather than
 * trusting the shape blindly.
 */
export function parseBackgroundAsiChoice(raw: unknown): BackgroundAsiChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.mode !== "plus2plus1" && obj.mode !== "plus1plus1plus1") return null;
  return { mode: obj.mode, primary: asSaveKey(obj.primary), secondary: asSaveKey(obj.secondary) };
}

/**
 * Parses a free-text feat grant like "Magic Initiate (Cleric)" into a name +
 * variant pair. Shared by the Open5e importer and the background editor (so a
 * DM typing a variant into the plain-text `feat_grant_name` field also
 * populates the structured `origin_feat` used for lookup).
 */
export function parseOriginFeatText(text: string | null | undefined): BackgroundOriginFeat | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) return { name: match[1].trim(), variant: match[2].trim() };
  return { name: trimmed, variant: null };
}

export interface ResolvedOriginFeat {
  originFeat: BackgroundOriginFeat;
  /** The matching imported/system class_features row, or null if that feat hasn't been imported yet. */
  feature: ClassFeature | null;
}

/**
 * Looks up a background's Origin feat grant against the campaign's available
 * class_features (feats import into that table — see open5eFeatImport.ts).
 * Matches by conceptual_key so renames/re-imports stay linked. Returns null
 * only when the background grants no feat at all; an unresolved feat still
 * returns a result with `feature: null` so callers can show the plain name
 * with a clear "not imported" marker instead of silently dropping it.
 */
export function resolveOriginFeat(
  originFeat: BackgroundOriginFeat | null | undefined,
  features: readonly ClassFeature[],
): ResolvedOriginFeat | null {
  if (!originFeat) return null;
  const key = slugifyKey(originFeat.name);
  const feature = features.find(f => f.conceptual_key === key) ?? null;
  return { originFeat, feature };
}
