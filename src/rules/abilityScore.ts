// The ability modifier. One definition for every rule that turns a score into a modifier.
// Pure and edge-importable (relative `.ts` imports only).

/** SRD 5.1 "Ability Scores and Modifiers": subtract 10 and halve, rounding down (so 9 is -1). */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}
