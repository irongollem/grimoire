/**
 * A 5e game condition (Blinded, Charmed, Poisoned, …). Baked from Open5e's
 * `/v1/conditions/` endpoint into `src/data/srdConditions.ts` at build time;
 * callers should import the `CONDITIONS` / `getCondition` helpers from
 * `@/lib/conditions` rather than reading the static module directly.
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
