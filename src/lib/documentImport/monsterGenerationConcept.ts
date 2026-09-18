/**
 * Turns one page's monster payload (`ExtractedMonster`,
 * `src/types/documentImport.types.ts`) into what `useGenerateMonster` needs
 * when the DM's decision for that entity is `generate` (`entityMatching.ts`)
 * — a page that named a creature without ever printing real stats for it, or
 * a page the DM chose to regenerate from anyway.
 *
 * Pure by the same rule as the rest of this folder: no Supabase client, no
 * AI call, no Vue. `useDocumentImportRunner.ts` is the only caller.
 */
import { MONSTER_SIZES, MONSTER_TYPES, type MonsterSize, type MonsterType } from "@/types/monster.types";
import type { MonsterGenerationOptions } from "@/ai/useMonsterGeneration";

function readString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * `ExtractedMonster.stat_block` is a nested `Partial<MonsterStatBlock>`, not
 * a top-level field — `challenge_rating` has no field of its own on the
 * payload the way `monster_type`/`size`/`alignment`/`habitat` do, since a
 * page's stat block is the one place 5e ever prints a CR.
 */
function readStatBlockField(data: Record<string, unknown>, field: string): string | null {
  const statBlock = data.stat_block;
  if (!statBlock || typeof statBlock !== "object" || Array.isArray(statBlock)) return null;
  const value = (statBlock as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Builds the free-text prompt handed to `useMonsterGeneration().generate` —
 * the same loose, prose style a DM would type into the Monster Generator
 * panel's own textarea; the model reads this as a concept, not a structured
 * record. Every source field is optional (`ExtractedMonster`), so this
 * degrades gracefully all the way down to a bare name when a page gave
 * nothing else to work with.
 */
export function monsterGenerationConcept(data: Record<string, unknown>): string {
  const name = readString(data, "name");
  const size = readString(data, "size");
  const monsterType = readString(data, "monster_type");
  const alignment = readString(data, "alignment");
  const habitat = readString(data, "habitat");
  const description = readString(data, "description");
  const challengeRating = readStatBlockField(data, "challenge_rating");

  // "a <size> <type>" reads naturally with either half alone ("a giant",
  // "a fiend"); with neither present, this clause drops out entirely.
  const sizeType = [size, monsterType].filter((s): s is string => s !== null).join(" ");

  let lead: string;
  if (name && sizeType) lead = `${name}, a ${sizeType}`;
  else if (name) lead = name;
  else if (sizeType) lead = `A ${sizeType} creature`;
  else lead = "An unnamed creature";

  if (alignment) lead += ` (${alignment})`;
  if (habitat) lead += `, found in ${habitat}`;
  if (challengeRating) lead += `, roughly challenge rating ${challengeRating}`;

  return description ? `${lead}. ${description}` : lead;
}

/**
 * Longest-substring match against a closed candidate list — the same rule
 * `normalize.ts`'s `resolveEnum` uses for the same reason (5e's vocabularies
 * nest: "very rare" contains "rare", so the *longest* match must win, not the
 * first one scanned). Duplicated rather than imported: `resolveEnum` always
 * returns a value (it takes a fallback to use when nothing matches), and
 * what this needs is the opposite question — "is this printed text a
 * confident match at all, or should the option be left out entirely and the
 * model told nothing about it."
 */
function matchCandidate<T extends string>(raw: string | null, candidates: readonly T[]): T | undefined {
  if (raw === null) return undefined;
  const haystack = raw.toLowerCase();
  let best: T | undefined;
  let bestLength = 0;
  for (const candidate of candidates) {
    const needle = candidate.toLowerCase().replace(/_/g, " ");
    if (haystack.includes(needle) && needle.length > bestLength) {
      best = candidate;
      bestLength = needle.length;
    }
  }
  return best;
}

/**
 * The subset of a page's monster fields worth forwarding as *structured*
 * generation constraints rather than leaving entirely to the free-text
 * concept above.
 *
 * `monster_type`/`size` are validated against the closed enums before being
 * forwarded, and simply omitted when nothing matches confidently:
 * `useMonsterGeneration`'s own constraint handling force-sets
 * `result.monster_type`/`result.size` to whatever string an option gives it,
 * with no validation of its own — it trusts the Monster Generator panel's
 * `<select>`, which can only ever offer a real enum member in the first
 * place. Forwarding a page's raw, unvalidated text ("Large fiend (demon)")
 * straight through as `monster_type` would either corrupt the generated row
 * or fail its insert outright, after a paid generation call already ran.
 *
 * `challenge_rating` has no enum to validate against — 5e writes it as "5",
 * "1/2", "1/4", free text with no closed set — so any non-blank value found
 * in the page's stat block is forwarded as-is, the same way the panel's own
 * `<AppInput>` constraint field does.
 */
/**
 * The credit cost of one Monster Generator run, given the base cost
 * (`useAiCredits().costOf("monster_stat_block")`) and the active text
 * provider's multiplier (`useProviderConfig().textMultiplierFor(...)`) —
 * mirrors `MonsterGeneratorPanel.vue`'s own `textCreditCost` formula exactly,
 * since a `generate`-decided import entity runs through that same pipeline
 * (`useGenerateMonster.ts`) and must show the same number.
 */
export function monsterGenerationCreditCost(baseCost: number, multiplier: number): number {
  return Math.round(baseCost * multiplier * 100) / 100;
}

export function monsterGenerationOptionsFromPage(data: Record<string, unknown>): MonsterGenerationOptions {
  const options: MonsterGenerationOptions = {};

  const challengeRating = readStatBlockField(data, "challenge_rating");
  if (challengeRating) options.challenge_rating = challengeRating;

  const monsterType = matchCandidate(readString(data, "monster_type"), MONSTER_TYPES);
  if (monsterType) options.monster_type = monsterType satisfies MonsterType;

  const size = matchCandidate(readString(data, "size"), MONSTER_SIZES);
  if (size) options.size = size satisfies MonsterSize;

  return options;
}
