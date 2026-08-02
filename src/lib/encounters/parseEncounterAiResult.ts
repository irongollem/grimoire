import type { EncounterAiResult, EncounterCombatantAiResult } from "@/ai/types";

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard", "deadly"]);

const MALFORMED_MESSAGE = "AI returned malformed encounter data — please try again.";

/** Coerces a raw field to a string, substituting `fallback` when it is absent
 *  or not a string. Never blindly `?? ""` — every call site below states why
 *  its particular fallback is the right one. */
function coerceString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Validates one raw combatant entry. Returns `null` when the entry has no
 * usable name — such an entry can't be resolved against the Bestiary or
 * shown to the DM, so it is dropped rather than repaired with a placeholder
 * name that would silently pollute the encounter.
 */
function coerceCombatant(raw: unknown): EncounterCombatantAiResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = raw as Record<string, unknown>;

  const name = entry.name;
  if (typeof name !== "string" || name.trim().length === 0) return null;

  const count =
    typeof entry.count === "number" && Number.isFinite(entry.count) ? entry.count : 1;

  // An absent role is a legitimate state, not an error to paper over: the
  // matcher (resolveGeneratedCombatants) already treats "" as "no tactical
  // role suffix" when it builds custom_name. This is the one field in this
  // module where an empty-string default is correct, because empty
  // genuinely means "no role", not "unknown".
  const role = typeof entry.role === "string" ? entry.role : "";

  return { name, count, role };
}

/**
 * Validates and normalizes the raw JSON payload from the encounter-generation
 * AI call into a real `EncounterAiResult`. `EncounterAiResult`'s fields are
 * declared as if they were guaranteed (`name: string`, `role: string`, …),
 * but the value handed in here came straight out of `JSON.parse` on model
 * output — nothing has checked it yet, and `resolveGeneratedCombatants`
 * trusts its input completely (e.g. it calls `entry.role.trim()` with no
 * guard). This function is the boundary that makes the declared types true
 * for everything downstream.
 */
export function parseEncounterAiResult(raw: unknown): EncounterAiResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(MALFORMED_MESSAGE);
  }
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.combatants)) {
    throw new Error(MALFORMED_MESSAGE);
  }

  const combatants = obj.combatants
    .map(coerceCombatant)
    .filter((c): c is EncounterCombatantAiResult => c !== null);

  if (combatants.length === 0) {
    throw new Error(MALFORMED_MESSAGE);
  }

  // "auto" (a legal *request* value) or a typo/omission in the *response*
  // both fall back to "medium" — a safe middle default rather than a crash,
  // since by this point difficulty is cosmetic (a badge) and the combatants
  // are what actually matter.
  const difficultyRaw = obj.difficulty;
  const difficulty =
    typeof difficultyRaw === "string" && VALID_DIFFICULTIES.has(difficultyRaw)
      ? difficultyRaw
      : "medium";

  return {
    // "???" is this repo's established "unknown" marker (see
    // `getNpcDisplayName` callers) — an encounter with no name is a real gap
    // worth seeing, not something to paper over with "".
    name: coerceString(obj.name, "???"),
    difficulty,
    // environment / tactics / twist are optional flavor text; the panel
    // simply skips rendering them when empty, so "" is an explicit, correct
    // default here — not a masked null.
    environment: coerceString(obj.environment, ""),
    tactics: coerceString(obj.tactics, ""),
    twist: coerceString(obj.twist, ""),
    combatants,
  };
}
