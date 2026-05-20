/**
 * Generic field-by-field merge engine for "enrich existing rows from source".
 *
 * The user's workflow: stub out a row in the UI (just name + a few fields),
 * then later run the importer to fill in the rest from source markdown. The
 * importer must never overwrite manual edits. This module formalises that
 * contract:
 *
 *   - SCALAR fields: if existing is empty → fill from source. If existing has
 *     user content → leave it. If both have content and differ → CONFLICT
 *     (don't write, surface to user).
 *
 *   - ARRAY fields: take the union (existing ∪ source), preserving order
 *     from existing then appending new items from source. Never "dedupe down"
 *     (i.e. never remove an existing tag just because source doesn't have it).
 *
 *   - PROSE fields: like scalar, but with a "stub" special case. If existing
 *     is short (< stubThresholdChars) AND source is substantially longer
 *     (>= existing.length * stubMultiplier), APPEND the source below a
 *     clear separator (don't overwrite — preserve the user's stub note).
 *     Otherwise behave like scalar (empty→fill; non-empty & differ→conflict).
 *
 * No I/O. Pure functions. Both the NPC importer and the faiths importer
 * consume this module via `planRowMerge`.
 */

export type FieldKind = "scalar" | "array" | "prose";

export interface FieldSpec {
  kind: FieldKind;
  /** Prose only. Existing length below this is considered a stub. Default: 200. */
  stubThresholdChars?: number;
  /** Prose only. Source must be >= existing.length * this to qualify as stub-append. Default: 2. */
  stubMultiplier?: number;
}

export type FieldOutcome =
  | { action: "noop" }
  | { action: "fill"; newValue: unknown }
  | { action: "append"; newValue: string; appended: string }
  | { action: "union"; newValue: unknown[]; addedItems: unknown[] }
  | { action: "conflict"; existing: unknown; source: unknown };

export interface RowMergePlan {
  /** Partial payload — only fields with non-conflict, non-noop actions. */
  updates: Record<string, unknown>;
  /** Fields that went from empty → source value. */
  filled: string[];
  /** Fields where source content was appended below a stub. */
  appended: string[];
  /** Array fields where source items were unioned in. */
  unioned: string[];
  /** Fields whose existing non-empty value differs from source — NOT written. */
  conflicts: Array<{ field: string; existing: unknown; source: unknown }>;
  /** Fields where existing already covers source (or source is empty). */
  unchanged: string[];
}

/** Append separator for stub-prose-append. Centralized so tests + UI can recognize it. */
export const SOURCE_APPEND_SEPARATOR = "\n\n---\n\n*From source:*\n\n";

/** Treat null, undefined, empty string, and all-whitespace as empty. */
function isEmptyScalar(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  return false;
}

function deepEqualPrimitive(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === "string" && typeof b === "string") {
    return a.trim() === b.trim();
  }
  return false;
}

export function mergeField(
  existing: unknown,
  source: unknown,
  spec: FieldSpec,
): FieldOutcome {
  if (spec.kind === "array") {
    const existingArr = Array.isArray(existing) ? existing : [];
    const sourceArr = Array.isArray(source) ? source : [];
    const union: unknown[] = [...existingArr];
    const added: unknown[] = [];
    for (const item of sourceArr) {
      if (!union.some((e) => deepEqualPrimitive(e, item))) {
        union.push(item);
        added.push(item);
      }
    }
    if (added.length === 0) return { action: "noop" };
    return { action: "union", newValue: union, addedItems: added };
  }

  // scalar + prose share empty-handling
  const existingEmpty = isEmptyScalar(existing);
  const sourceEmpty = isEmptyScalar(source);

  if (existingEmpty && sourceEmpty) return { action: "noop" };
  if (existingEmpty && !sourceEmpty) return { action: "fill", newValue: source };
  if (!existingEmpty && sourceEmpty) return { action: "noop" };
  // Both non-empty
  if (deepEqualPrimitive(existing, source)) return { action: "noop" };

  if (spec.kind === "prose" && typeof existing === "string" && typeof source === "string") {
    const stubThreshold = spec.stubThresholdChars ?? 200;
    const stubMultiplier = spec.stubMultiplier ?? 2;
    if (existing.length < stubThreshold && source.length >= existing.length * stubMultiplier) {
      const merged = existing.trimEnd() + SOURCE_APPEND_SEPARATOR + source;
      return { action: "append", newValue: merged, appended: source };
    }
  }
  return { action: "conflict", existing, source };
}

/**
 * Walk every field in `fieldSpecs` and merge `existing[field]` with `source[field]`.
 * Returns a `RowMergePlan` summarising what would be written.
 *
 * Fields not in `fieldSpecs` are ignored entirely (so callers can scope the
 * merge to the parser-produced field set without worrying about untouched
 * columns like `created_at`, `user_id`, etc.).
 */
export function planRowMerge(
  existing: Record<string, unknown>,
  source: Record<string, unknown>,
  fieldSpecs: Record<string, FieldSpec>,
): RowMergePlan {
  const plan: RowMergePlan = {
    updates: {},
    filled: [],
    appended: [],
    unioned: [],
    conflicts: [],
    unchanged: [],
  };
  for (const [field, spec] of Object.entries(fieldSpecs)) {
    const outcome = mergeField(existing[field], source[field], spec);
    switch (outcome.action) {
      case "noop":
        plan.unchanged.push(field);
        break;
      case "fill":
        plan.updates[field] = outcome.newValue;
        plan.filled.push(field);
        break;
      case "append":
        plan.updates[field] = outcome.newValue;
        plan.appended.push(field);
        break;
      case "union":
        plan.updates[field] = outcome.newValue;
        plan.unioned.push(field);
        break;
      case "conflict":
        plan.conflicts.push({ field, existing: outcome.existing, source: outcome.source });
        break;
    }
  }
  return plan;
}

/** True if the plan has anything to write. */
export function planHasWrites(plan: RowMergePlan): boolean {
  return Object.keys(plan.updates).length > 0;
}

/**
 * Per-record override: replace existing values with source values for every
 * field in `fieldSpecs`, regardless of whether existing was a user-set value.
 *
 * Use case: the user manually filled a stub row from a non-canonical source
 * (e.g. a placeholder image) and wants the canonical lore to overwrite their
 * guesses. Image fields are protected by virtue of NOT being in `fieldSpecs`
 * — keep them out of the schema and they'll never be touched.
 *
 * Differences from `planRowMerge`:
 *   - Never returns conflicts (the override is the resolution).
 *   - Writes source value verbatim — including null/empty — when it differs
 *     from existing. (Empty-into-empty is still a noop.)
 *   - All written fields are reported in `filled` (no append/union distinction;
 *     the override is uniformly "take source").
 */
export function planForceOverwrite(
  existing: Record<string, unknown>,
  source: Record<string, unknown>,
  fieldSpecs: Record<string, FieldSpec>,
): RowMergePlan {
  const plan: RowMergePlan = {
    updates: {},
    filled: [],
    appended: [],
    unioned: [],
    conflicts: [],
    unchanged: [],
  };
  for (const field of Object.keys(fieldSpecs)) {
    const ev = existing[field];
    const sv = source[field];

    // Both empty (different empty representations are equivalent) — noop
    const evEmpty = isEmptyScalar(ev) || (Array.isArray(ev) && ev.length === 0);
    const svEmpty = isEmptyScalar(sv) || (Array.isArray(sv) && sv.length === 0);
    if (evEmpty && svEmpty) {
      plan.unchanged.push(field);
      continue;
    }

    // Identical (array or scalar)? noop
    if (Array.isArray(ev) && Array.isArray(sv)) {
      if (
        ev.length === sv.length &&
        ev.every((x, i) => deepEqualPrimitive(x, sv[i]))
      ) {
        plan.unchanged.push(field);
        continue;
      }
    } else if (deepEqualPrimitive(ev, sv)) {
      plan.unchanged.push(field);
      continue;
    }

    // Different — overwrite with source verbatim (may be null).
    plan.updates[field] = sv ?? null;
    plan.filled.push(field);
  }
  return plan;
}

/** Compact human-readable summary for log output. */
export function summarisePlan(plan: RowMergePlan): string {
  const parts: string[] = [];
  if (plan.filled.length) parts.push(`filled=[${plan.filled.join(",")}]`);
  if (plan.appended.length) parts.push(`appended=[${plan.appended.join(",")}]`);
  if (plan.unioned.length) parts.push(`unioned=[${plan.unioned.join(",")}]`);
  if (plan.conflicts.length) parts.push(`conflicts=[${plan.conflicts.map((c) => c.field).join(",")}]`);
  return parts.length ? parts.join(" ") : "no changes";
}
