/**
 * A 5e game condition (Blinded, Charmed, Poisoned, …). Baked per-edition into
 * `src/data/srdConditions2014.ts` (SRD 5.1) and `src/data/srdConditions2024.ts`
 * (SRD 5.2, patched via `src/data/conditionPatches.ts` — see that file for why)
 * at build time; callers should import the `CONDITIONS` / `getCondition`
 * helpers from `@/rules/conditions` rather than reading the static modules
 * directly.
 */
export interface Condition {
  /** Stable id derived from the slug (e.g. "blinded"). */
  id: string;
  /** Open5e slug (url-safe). */
  slug: string;
  /** Display name (Title Case, e.g. "Blinded"). */
  name: string;
  /** Full rules text, newline-preserved for tooltip rendering. */
  description: string;
  /** Parsed bullet / paragraph list for structured rendering. */
  effects: string[];
}
